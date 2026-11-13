// Satu jalan skenario: siapkan data (setup) → putar langkah → simpan hasil, temuan, bukti.
// Dipakai panel (server.ts) dan CLI (cli.ts).
import { EventEmitter } from 'node:events'
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import type { APIRequestContext, Browser, BrowserContext, Page } from 'playwright'
import { config } from './config.ts'
import { Controller, Stopped } from './controller.ts'
import { readRun } from './history.ts'
import * as kitModule from './kit.ts'
import * as lib from './lib.ts'
import { type PersonaId, personaName } from './personas.ts'
import type { Finding, RunResult, RunStatus } from './run-types.ts'
import { stepInfo } from './scenarios.ts'
import type { BaseCtx, Scenario, ScenarioData, StepCtx } from './types.ts'

const BECOME_HOLD = 4500
const SHOT_TIMEOUT = 10_000
/** Jeda sebelum browser ditutup paksa saat Hentikan, supaya aksi yang menunggu sempat berhenti. */
const STOP_GRACE_MS = 1500
const CLOSE_TIMEOUT_MS = 5000

const runStamp = () => new Date().toISOString().replaceAll(/[:.]/g, '-').slice(0, 19)
const firstLine = (e: unknown) => (e instanceof Error ? e.message : String(e)).split('\n')[0] ?? ''

export class Run extends EventEmitter {
  readonly mod: Scenario
  readonly headed: boolean
  readonly ctl: Controller
  readonly runId: string
  readonly dir: string
  readonly result: RunResult
  data: ScenarioData | null = null
  private page: Page | null = null
  private browser: Browser | null = null
  private ctx: BrowserContext | null = null
  private persona: PersonaId | null = null
  private apis = new Map<PersonaId, APIRequestContext>()
  private finished = false

  constructor(id: string, mod: Scenario, { headed = false, speed = 1 } = {}) {
    super()
    this.mod = mod
    this.headed = headed
    this.ctl = new Controller({ scale: headed ? 1 : config.headlessHold, speed })
    this.runId = `${id}/${runStamp()}`
    this.dir = path.join(config.runsDir, this.runId)
    mkdirSync(this.dir, { recursive: true })
    this.result = {
      run_id: this.runId,
      scenario: id,
      title: mod.meta.title,
      headed,
      status: 'idle',
      started_at: null,
      ended_at: null,
      duration_ms: null,
      from_step: 0,
      data_from: null,
      current_step: null,
      last_shot: null,
      error: null,
      steps: mod.steps.map((s, i) => ({
        ...stepInfo(s, i),
        status: 'menunggu',
        ms: null,
        error: null,
        shot: null,
      })),
      findings: [],
    }
    this.ctl.on('log', (l: string) => this.log(l))
    this.ctl.on('change', () => {
      if (['berjalan', 'jeda'].includes(this.result.status))
        this.setStatus(this.ctl.paused ? 'jeda' : 'berjalan')
      else this.emit('change')
    })
    this.save()
  }

  log(line: string) {
    const t = new Date().toTimeString().slice(0, 8)
    this.emit('log', `${t} ${line}`)
  }

  private save() {
    writeFileSync(path.join(this.dir, 'result.json'), JSON.stringify(this.result, null, 2))
  }

  private saveData() {
    writeFileSync(path.join(this.dir, 'data.json'), JSON.stringify(this.data, null, 2))
  }

  private setStatus(s: RunStatus) {
    if (this.result.status !== s) {
      this.result.status = s
      this.save()
    }
    this.emit('change')
  }

  snapshot() {
    return { ...this.result, speed: this.ctl.speed, paused: this.ctl.paused, data: this.data }
  }

  /** Sesi API persona lain tanpa jendela; ditutup otomatis di akhir. */
  private async as(who: PersonaId) {
    let rc = this.apis.get(who)
    if (!rc) {
      rc = await lib.apiAs(who)
      this.apis.set(who, rc)
    }
    return rc
  }

  private async disposeApis() {
    for (const rc of this.apis.values()) await rc.dispose().catch(() => {})
    this.apis.clear()
  }

  private baseCtx(): BaseCtx {
    return {
      lib,
      kit: kitModule,
      ctl: this.ctl,
      log: (l) => this.log(l),
      as: (who) => this.as(who),
      api: { get: lib.apiGet, send: lib.apiSend },
      ok: kitModule.ok,
    }
  }

  /** Siapkan data segar lewat API (setup), atau pakai data jalan lain (`fromRun`). */
  async prepare({ fromRun }: { fromRun?: string } = {}) {
    lib.setController(this.ctl)
    this.setStatus('menyiapkan')
    try {
      if (fromRun) {
        readRun(fromRun)
        const target = path.join(this.dir, 'data.json')
        copyFileSync(path.join(config.runsDir, fromRun, 'data.json'), target)
        this.data = JSON.parse(readFileSync(target, 'utf8')) as ScenarioData
        this.result.data_from = fromRun
        this.log(`Data dipakai dari jalan ${fromRun}`)
      } else {
        this.log('Menyiapkan data lewat API…')
        this.data = (await this.mod.setup?.(this.baseCtx())) ?? {}
        this.saveData()
        this.log('Data siap')
      }
      this.setStatus('siap')
    } catch (e) {
      this.result.error = `Siapkan data gagal: ${firstLine(e)}`
      this.log(this.result.error)
      this.setStatus('gagal')
      throw e
    } finally {
      await this.disposeApis()
    }
  }

  private async shot(name: string): Promise<string | null> {
    if (!this.page) return null
    const n = readdirSync(this.dir).filter((f) => f.endsWith('.png')).length + 1
    const file = `${String(n).padStart(2, '0')}-${name.replaceAll(/[^a-z0-9]+/gi, '-').slice(0, 60)}.png`
    await this.page
      .screenshot({ path: path.join(this.dir, file), fullPage: false, timeout: SHOT_TIMEOUT })
      .catch(() => null)
    if (!existsSync(path.join(this.dir, file))) return null
    this.result.last_shot = file
    this.save()
    this.emit('change')
    return file
  }

  private async become(who: PersonaId) {
    if (this.persona === who || !this.page) return
    await lib.become(this.page, who, { caption: `Ganti akun: ${personaName(who)}` })
    this.persona = who
    await this.ctl.hold(BECOME_HOLD)
  }

  /** Putar langkah mulai indeks `from`. Bila from > 0 dan data bukan dari jalan lain, pakai reach. */
  async start({ from = 0 }: { from?: number } = {}) {
    if (this.result.status !== 'siap')
      throw new Error(`Jalan belum siap (status ${this.result.status})`)
    lib.setController(this.ctl)
    const steps = this.mod.steps
    const data = this.data ?? {}
    if (from < 0 || from >= steps.length) throw new Error(`Langkah ${from + 1} tidak ada`)
    this.result.from_step = from
    for (let i = 0; i < from; i++) {
      const r = this.result.steps[i]
      if (r) r.status = 'dilompati'
    }
    this.result.started_at = new Date().toISOString()
    const t0 = Date.now()
    this.setStatus('berjalan')
    let i = from
    try {
      if (from > 0 && !this.result.data_from) {
        const reach = steps[from]?.reach
        if (!reach)
          throw new Error(
            `Langkah ${from + 1} tidak punya reach; pakai data jalan yang berhenti sebelum langkah ini`,
          )
        this.log(`Membawa data ke awal langkah ${from + 1} (reach)…`)
        try {
          await reach(this.baseCtx(), data)
        } catch (e) {
          throw new Error(`Reach langkah ${from + 1} gagal: ${firstLine(e)}`)
        }
        this.saveData()
      }
      const browser = await lib.launch({ headed: this.headed })
      this.browser = browser
      browser.on('disconnected', () => {
        if (!this.finished) this.ctl.stop()
      })
      const first = steps[from]?.who ?? this.mod.meta.personas[0]?.who
      if (!first) throw new Error('Tidak ada persona untuk membuka jendela')
      const p = await lib.asPersona(browser, first)
      this.ctx = p.ctx
      this.page = p.page
      this.persona = first
      this.log(`Jendela dibuka sebagai ${personaName(first)}`)
      for (; i < steps.length; i++) {
        const s = steps[i]
        const r = this.result.steps[i]
        if (!s || !r) break
        this.result.current_step = i
        r.status = 'berjalan'
        this.save()
        this.emit('change')
        this.log(`Langkah ${i + 1}/${steps.length}: ${s.title}`)
        const ts = Date.now()
        if (s.who) await this.become(s.who)
        await s.run(this.stepCtx(i, p.page), data)
        r.ms = Date.now() - ts
        r.status = 'lulus'
        r.shot = await this.shot(`${i + 1}-${s.id}`)
        this.saveData()
        this.save()
      }
      this.result.current_step = null
      this.finish('selesai')
    } catch (e) {
      const stopped = e instanceof Stopped || this.ctl.stopRequested
      const r = this.result.steps[i]
      if (r) {
        r.status = stopped ? 'dihentikan' : 'gagal'
        r.error = stopped ? null : firstLine(e)
        if (!stopped) r.shot = await this.shot(`${i + 1}-gagal`)
      }
      if (!stopped) {
        this.result.error = firstLine(e)
        this.log(`GAGAL: ${this.result.error}`)
      }
      this.finish(stopped ? 'dihentikan' : 'gagal')
    } finally {
      this.result.duration_ms = Date.now() - t0
      if (this.mod.cleanup) {
        // Pembersihan lewat API (mis. mengembalikan setelan), juga saat gagal atau dihentikan.
        try {
          await this.mod.cleanup(this.baseCtx(), data)
        } catch (e) {
          this.result.cleanup_error = firstLine(e)
          this.log(`PERINGATAN pembersihan: ${this.result.cleanup_error}`)
        }
      }
      this.save()
      await this.close()
    }
  }

  private stepCtx(i: number, page: Page): StepCtx {
    const total = this.mod.steps.length
    const k = kitModule.kit({ total })
    return {
      ...this.baseCtx(),
      page,
      k,
      n: i + 1,
      total,
      say: (text, ms = kitModule.STEP) => k.say(page, `${i + 1}/${total} · ${text}`, ms),
      wait: (ms) => this.ctl.hold(ms),
      shot: (name) => this.shot(name),
      become: (who) => this.become(who),
      open: (route) => lib.open(page, route),
      note: (text) => {
        const r = this.result.steps[i]
        if (r) r.notes = [...(r.notes ?? []), text]
        this.log(`CATATAN: ${text}`)
        this.save()
      },
    }
  }

  finish(status: RunStatus) {
    this.finished = true
    this.result.ended_at = new Date().toISOString()
    this.log(`Jalan ${status}`)
    this.setStatus(status)
  }

  private async close() {
    this.finished = true
    await this.disposeApis()
    if (this.ctx) {
      const trace = path.join(this.dir, 'trace.zip')
      await this.ctx.tracing.stop({ path: trace }).catch(() => {})
      if (existsSync(trace)) {
        this.result.trace = 'trace.zip'
        this.save()
      }
    }
    // Di bawah Bun, browser.close() kadang tidak pernah selesai; jangan biarkan jalan menggantung.
    await Promise.race([
      this.browser?.close().catch(() => {}),
      new Promise((r) => setTimeout(r, CLOSE_TIMEOUT_MS)),
    ])
    this.page = null
    this.ctx = null
    this.browser = null
    this.emit('change')
  }

  pause() {
    this.ctl.pause()
    void this.shot('jeda')
  }

  resume() {
    this.ctl.resume()
  }

  step() {
    this.ctl.step()
  }

  setSpeed(s: unknown) {
    this.ctl.setSpeed(s)
  }

  async stop() {
    if (['siap', 'idle'].includes(this.result.status)) {
      this.finish('dihentikan')
      return
    }
    this.ctl.stop()
    setTimeout(() => this.browser?.close().catch(() => {}), STOP_GRACE_MS)
  }

  /** Catat temuan: screenshot saat ini + entri di berkas temuan dan result.json. */
  async finding(note: unknown): Promise<Finding> {
    if (typeof note !== 'string' || !note.trim()) throw new Error('Catatan temuan kosong')
    const i = this.result.current_step
    const step = i == null ? null : this.result.steps[i]
    const shot = await this.shot('temuan')
    const temuanDir = path.dirname(config.temuanFile)
    const entry: Finding = {
      at: new Date().toISOString(),
      step: step ? `${step.n}. ${step.title}` : null,
      persona: this.persona ? personaName(this.persona) : null,
      url: this.page ? this.page.url() : null,
      note: note.trim(),
      screenshot: shot ? path.relative(temuanDir, path.join(this.dir, shot)) : null,
    }
    this.result.findings.push(entry)
    this.save()
    mkdirSync(temuanDir, { recursive: true })
    if (!existsSync(config.temuanFile)) writeFileSync(config.temuanFile, '# Temuan uji skenario\n')
    const md = [
      '',
      `## ${entry.at.slice(0, 16).replace('T', ' ')} · ${this.result.title}`,
      '',
      `- **Skenario:** ${this.result.scenario} (jalan \`${this.runId}\`)`,
      `- **Langkah:** ${entry.step ?? '-'}`,
      `- **Persona:** ${entry.persona ?? '-'}`,
      `- **Halaman:** ${entry.url ?? '-'}`,
      `- **Catatan:** ${entry.note.replaceAll('\n', ' ')}`,
      `- **Screenshot:** ${entry.screenshot ? `\`${entry.screenshot}\`` : '-'}`,
      '',
    ].join('\n')
    appendFileSync(config.temuanFile, md)
    this.log(`Temuan dicatat${shot ? ` (${shot})` : ''}`)
    this.emit('change')
    return entry
  }
}

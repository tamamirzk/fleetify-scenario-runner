// Satu jalan skenario JSON: siapkan data → langkah (aksi demi aksi) → bersihkan → hasil, temuan,
// bukti. Dipakai panel (server.ts) dan CLI (cli.ts).
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
import type { APIRequestContext, BrowserContext, CDPSession, Page } from 'playwright'
import { PUSTAKA } from '../pustaka/index.ts'
import { config } from './config.ts'
import { Controller, Stopped } from './controller.ts'
import { readRun } from './history.ts'
import { jalankanAksi, type Layar, type Lingkungan, uraiAksi } from './interpreter.ts'
import * as kitModule from './kit.ts'
import { layarPlaywright } from './layar.ts'
import * as lib from './lib.ts'
import { type PersonaId, personaName } from './personas.ts'
import {
  type Finding,
  type JenisTemuan,
  LABEL_TEMUAN,
  type RunResult,
  type RunStatus,
} from './run-types.ts'
import { type BerkasSkenario, stepInfo } from './scenarios.ts'
import type { Aksi, Skenario } from './skema.ts'
import type { BaseCtx, StepCtx } from './types.ts'

const BECOME_HOLD = 4500
const SHOT_TIMEOUT = 10_000
/** Jeda sebelum jendela ditutup paksa saat Hentikan, supaya aksi yang menunggu sempat berhenti. */
const STOP_GRACE_MS = 1500
const CLOSE_TIMEOUT_MS = 5000
const SCREENCAST = { format: 'jpeg', quality: 70, maxWidth: 1400, maxHeight: 900 } as const

const runStamp = () => new Date().toISOString().replaceAll(/[:.]/g, '-').slice(0, 19)
const firstLine = (e: unknown) => (e instanceof Error ? e.message : String(e)).split('\n')[0] ?? ''

type Data = Record<string, unknown>

export class Run extends EventEmitter {
  readonly berkas: BerkasSkenario
  readonly sk: Skenario
  readonly headed: boolean
  readonly ctl: Controller
  readonly runId: string
  readonly dir: string
  readonly result: RunResult
  data: Data = {}
  private page: Page | null = null
  private ctx: BrowserContext | null = null
  private cdp: CDPSession | null = null
  private persona: PersonaId | null = null
  private apis = new Map<PersonaId, APIRequestContext>()
  private finished = false
  private stepIdx: number | null = null

  constructor(berkas: BerkasSkenario & { skenario: Skenario }, { headed = false, speed = 1 } = {}) {
    super()
    this.berkas = berkas
    this.sk = berkas.skenario
    this.headed = headed
    this.ctl = new Controller({ scale: headed ? 1 : config.headlessHold, speed })
    this.runId = `${berkas.slug}/${runStamp()}`
    this.dir = path.join(config.runsDir, this.runId)
    mkdirSync(this.dir, { recursive: true })
    this.result = {
      run_id: this.runId,
      scenario: berkas.slug,
      task: berkas.task,
      path: berkas.path,
      title: this.sk.judul,
      estimasi: this.sk.estimasi,
      file_mtime: berkas.mtime,
      headed,
      status: 'idle',
      started_at: null,
      ended_at: null,
      duration_ms: null,
      from_step: 0,
      data_from: null,
      current_step: null,
      current_aksi: null,
      last_shot: null,
      error: null,
      steps: this.sk.langkah.map((s, i) => ({
        ...stepInfo(s, i),
        reach: i === 0 || !!s.capai,
        status: 'menunggu',
        ms: null,
        error: null,
        shot: null,
        aksi: s.aksi.map((a) => ({ teks: uraiAksi(a), status: 'menunggu', ms: null })),
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

  private note(text: string) {
    const r = this.stepIdx == null ? null : this.result.steps[this.stepIdx]
    if (r) r.notes = [...(r.notes ?? []), text]
    this.log(`CATATAN: ${text}`)
    this.save()
  }

  private baseCtx(): BaseCtx {
    return {
      lib,
      kit: kitModule,
      ctl: this.ctl,
      stempel: String(this.data.stempel ?? kitModule.stamp()),
      log: (l) => this.log(l),
      note: (t) => this.note(t),
      as: (who) => this.as(who),
      api: { get: lib.apiGet, send: lib.apiSend },
      ok: kitModule.ok,
    }
  }

  private stepCtx(page: Page, n: number): StepCtx {
    const total = this.sk.langkah.length
    const k = kitModule.kit({ total })
    return {
      ...this.baseCtx(),
      page,
      k,
      wait: (ms) => this.ctl.hold(ms),
      open: (route) => lib.open(page, route),
      say: (text, ms = kitModule.STEP) => k.say(page, `${n}/${total} · ${text}`, ms),
      shot: (name) => this.shot(name),
    }
  }

  /** Lingkungan interpreter. Tanpa layar untuk siapkan, capai, dan bersihkan. */
  private env(layar?: Layar): Lingkungan {
    return {
      layar,
      data: this.data,
      catat: (t) => this.note(t),
      log: (l) => this.log(l),
      pustaka: async (nama, args) => {
        const p = PUSTAKA[nama]
        if (!p) throw new Error(`Aksi pustaka "${nama}" tidak ada`)
        const parsed = p.argumen.safeParse(args)
        if (!parsed.success) {
          const i = parsed.error.issues[0]
          throw new Error(`Argumen ${nama} tidak sah: ${i?.path.join('.')} ${i?.message}`)
        }
        if (p.jenis === 'api') return p.jalankan(this.baseCtx(), parsed.data)
        if (!this.page) throw new Error(`Aksi ${nama} butuh jendela`)
        return p.jalankan(this.stepCtx(this.page, (this.stepIdx ?? 0) + 1), parsed.data)
      },
    }
  }

  private async aksiApi(daftar: Aksi[], label: string) {
    for (const a of daftar) {
      this.log(`${label}: ${uraiAksi(a, this.data)}`)
      await jalankanAksi(a, this.env())
    }
  }

  /** Siapkan data segar lewat API, atau pakai data jalan lain (`fromRun`). */
  async prepare({ fromRun }: { fromRun?: string } = {}) {
    lib.setController(this.ctl)
    this.setStatus('menyiapkan')
    try {
      if (fromRun) {
        readRun(fromRun)
        const target = path.join(this.dir, 'data.json')
        copyFileSync(path.join(config.runsDir, fromRun, 'data.json'), target)
        this.data = JSON.parse(readFileSync(target, 'utf8')) as Data
        this.result.data_from = fromRun
        this.log(`Data dipakai dari jalan ${fromRun}`)
      } else {
        this.data = { stempel: kitModule.stamp(), docs: [] }
        this.log('Menyiapkan data lewat API…')
        await this.aksiApi(this.sk.siapkan, 'Siapkan')
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

  /** Tampilan langsung: screencast CDP, satu frame JPEG (base64) per event "frame". */
  private async startScreencast(page: Page) {
    try {
      const cdp = await page.context().newCDPSession(page)
      this.cdp = cdp
      cdp.on('Page.screencastFrame', (f) => {
        this.emit('frame', f.data)
        cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {})
      })
      await cdp.send('Page.startScreencast', SCREENCAST)
    } catch (e) {
      this.log(`Tampilan langsung tidak tersedia: ${firstLine(e)}`)
    }
  }

  /** Putar langkah mulai indeks `from`. Bila from > 0 dan data bukan dari jalan lain, pakai capai. */
  async start({ from = 0 }: { from?: number } = {}) {
    if (this.result.status !== 'siap')
      throw new Error(`Jalan belum siap (status ${this.result.status})`)
    lib.setController(this.ctl)
    const steps = this.sk.langkah
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
        const capai = steps[from]?.capai
        if (!capai)
          throw new Error(
            `Langkah ${from + 1} tidak punya capai; pakai data jalan yang berhenti sebelum langkah ini`,
          )
        this.log(`Membawa data ke awal langkah ${from + 1} (capai)…`)
        try {
          await this.aksiApi(capai, 'Capai')
        } catch (e) {
          throw new Error(`Capai langkah ${from + 1} gagal: ${firstLine(e)}`)
        }
        this.saveData()
      }
      const browser = await lib.sharedBrowser({ headed: this.headed })
      const first = steps[from]?.sebagai ?? this.sk.persona[0]?.siapa
      if (!first) throw new Error('Tidak ada persona untuk membuka jendela')
      const p = await lib.asPersona(browser, first)
      this.ctx = p.ctx
      this.page = p.page
      this.persona = first
      // Menutup jendela (atau browser) sama dengan Hentikan.
      p.page.on('close', () => {
        if (!this.finished) this.ctl.stop()
      })
      await this.startScreencast(p.page)
      this.log(`Jendela dibuka sebagai ${personaName(first)}`)
      for (; i < steps.length; i++) await this.runStep(i, p.page)
      this.result.current_step = null
      this.result.current_aksi = null
      this.finish('selesai')
    } catch (e) {
      const stopped = e instanceof Stopped || this.ctl.stopRequested
      const r = this.result.steps[i]
      if (r) {
        r.status = stopped ? 'dihentikan' : 'gagal'
        r.error = stopped ? null : firstLine(e)
        const a = this.result.current_aksi == null ? null : r.aksi[this.result.current_aksi]
        if (a && a.status === 'berjalan') a.status = stopped ? 'dihentikan' : 'gagal'
        if (!stopped) r.shot = await this.shot(`${i + 1}-gagal`)
      }
      if (!stopped) {
        this.result.error = firstLine(e)
        this.log(`GAGAL: ${this.result.error}`)
      }
      this.finish(stopped ? 'dihentikan' : 'gagal')
    } finally {
      this.result.duration_ms = Date.now() - t0
      if (this.sk.bersihkan?.length) {
        // Pembersihan lewat API (mis. mengembalikan setelan), juga saat gagal atau dihentikan.
        try {
          await this.aksiApi(this.sk.bersihkan, 'Bersihkan')
        } catch (e) {
          this.result.cleanup_error = firstLine(e)
          this.log(`PERINGATAN pembersihan: ${this.result.cleanup_error}`)
        }
      }
      this.save()
      await this.close()
    }
  }

  private async runStep(i: number, page: Page) {
    const s = this.sk.langkah[i]
    const r = this.result.steps[i]
    if (!s || !r) return
    const daftar: Aksi[] = [
      ...(s.sebagai && s.sebagai !== this.persona ? [{ sebagai: s.sebagai }] : []),
      ...s.aksi,
    ]
    r.aksi = daftar.map((a) => ({ teks: uraiAksi(a, this.data), status: 'menunggu', ms: null }))
    this.stepIdx = i
    this.result.current_step = i
    this.result.current_aksi = null
    r.status = 'berjalan'
    this.save()
    this.emit('change')
    this.log(`Langkah ${i + 1}/${this.sk.langkah.length}: ${s.judul}`)
    const env = this.env(
      layarPlaywright({
        page,
        total: this.sk.langkah.length,
        nomor: () => i + 1,
        shot: (n) => this.shot(n),
        sebagai: (who) => this.become(who),
      }),
    )
    const ts = Date.now()
    for (const [j, a] of daftar.entries()) {
      const ar = r.aksi[j]
      if (!ar) continue
      ar.teks = uraiAksi(a, this.data)
      ar.status = 'berjalan'
      this.result.current_aksi = j
      this.emit('change')
      const ta = Date.now()
      await jalankanAksi(a, env)
      ar.ms = Date.now() - ta
      ar.status = 'selesai'
      this.emit('change')
    }
    r.ms = Date.now() - ts
    r.status = 'lulus'
    this.result.current_aksi = null
    r.shot = await this.shot(`${i + 1}-${s.id}`)
    this.saveData()
    this.save()
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
    await Promise.race([
      this.cdp?.send('Page.stopScreencast').catch(() => {}),
      new Promise((r) => setTimeout(r, 1000)),
    ])
    this.cdp = null
    if (this.ctx) {
      const trace = path.join(this.dir, 'trace.zip')
      await Promise.race([
        this.ctx.tracing.stop({ path: trace }).catch(() => {}),
        new Promise((r) => setTimeout(r, CLOSE_TIMEOUT_MS * 4)),
      ])
      if (existsSync(trace)) {
        this.result.trace = 'trace.zip'
        this.save()
      }
    }
    // Browser dipakai bersama antar-jalan (lib.sharedBrowser); yang ditutup hanya konteks jalan ini.
    // Di bawah Bun, close() kadang tidak pernah selesai; jangan biarkan jalan menggantung.
    await Promise.race([
      this.ctx?.close().catch(() => {}),
      new Promise((r) => setTimeout(r, CLOSE_TIMEOUT_MS)),
    ])
    this.page = null
    this.ctx = null
    this.emit('change')
  }

  pause() {
    this.ctl.pause()
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
    setTimeout(() => this.ctx?.close().catch(() => {}), STOP_GRACE_MS)
  }

  /** Catat temuan: screenshot saat ini + entri di berkas temuan dan result.json. */
  async finding(jenis: JenisTemuan, note: unknown): Promise<Finding> {
    if (typeof note !== 'string' || !note.trim()) throw new Error('Catatan temuan kosong')
    const i = this.result.current_step ?? lastIndex(this.result)
    const step = i == null ? null : this.result.steps[i]
    const ai = this.result.current_aksi
    const shot = await this.shot('temuan')
    const entry: Finding = {
      at: new Date().toISOString(),
      jenis,
      step_n: step?.n ?? null,
      step: step?.title ?? null,
      aksi: step && ai != null ? (step.aksi[ai]?.teks ?? null) : null,
      persona: this.persona ? personaName(this.persona) : null,
      url: this.page ? this.page.url() : null,
      note: note.trim(),
      screenshot: shot,
    }
    this.result.findings.push(entry)
    this.save()
    const temuanDir = path.dirname(config.temuanFile)
    mkdirSync(temuanDir, { recursive: true })
    if (!existsSync(config.temuanFile)) writeFileSync(config.temuanFile, '# Temuan uji skenario\n')
    const md = [
      '',
      `## ${entry.at.slice(0, 16).replace('T', ' ')} · ${LABEL_TEMUAN[jenis]} · ${this.result.title}`,
      '',
      `- **Jenis:** ${LABEL_TEMUAN[jenis]}`,
      `- **Skenario:** \`${this.result.path}\` (jalan \`${this.runId}\`)`,
      `- **Langkah:** ${step ? `${step.n}. ${step.title}` : '-'}`,
      `- **Aksi:** ${entry.aksi ?? '-'}`,
      `- **Persona:** ${entry.persona ?? '-'}`,
      `- **Halaman:** ${entry.url ?? '-'}`,
      `- **Catatan:** ${entry.note.replaceAll('\n', ' ')}`,
      `- **Screenshot:** ${shot ? `\`${path.relative(temuanDir, path.join(this.dir, shot))}\`` : '-'}`,
      '',
    ].join('\n')
    appendFileSync(config.temuanFile, md)
    this.log(`Temuan dicatat (${LABEL_TEMUAN[jenis]})${shot ? ` · ${shot}` : ''}`)
    this.emit('change')
    return entry
  }
}

/** Langkah terakhir yang tersentuh (untuk temuan sesudah jalan selesai). */
function lastIndex(r: RunResult): number | null {
  for (let i = r.steps.length - 1; i >= 0; i--)
    if (r.steps[i]?.status !== 'menunggu' && r.steps[i]?.status !== 'dilompati') return i
  return null
}

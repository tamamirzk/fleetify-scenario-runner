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
import { teksDiff } from '../pemeriksaan/banding.ts'
import { Pemeriksa } from '../pemeriksaan/jalankan.ts'
import type { HasilPernyataan, PernyataanSiap } from '../pemeriksaan/jejak.ts'
import { PemeriksaUi, teksUiLangkah } from '../pemeriksaan/ui.ts'
import { PUSTAKA } from '../pustaka/index.ts'
import { config } from './config.ts'
import { Controller, Stopped, skalaTahan } from './controller.ts'
import { readRun } from './history.ts'
import {
  type CatatanCek,
  jalankanAksi,
  jalankanCek,
  type Layar,
  type Lingkungan,
  uraiAksi,
} from './interpreter.ts'
import * as kitModule from './kit.ts'
import { ambilKunci, lepasKunci } from './kunci.ts'
import { susunLaporan } from './laporan.ts'
import { layarPlaywright } from './layar.ts'
import * as lib from './lib.ts'
import { type PersonaId, personaName } from './personas.ts'
import { isiPlaceholder } from './placeholder.ts'
import { PencatatRequest } from './requests.ts'
import {
  type Finding,
  type JenisTemuan,
  LABEL_TEMUAN,
  type PraLangkah,
  type RunResult,
  type RunStatus,
} from './run-types.ts'
import { cariLocator } from './sasaran.ts'
import { type BerkasSkenario, stepInfo } from './scenarios.ts'
import type { Aksi, Sasaran as SasaranUi, Skenario } from './skema.ts'
import {
  type LayarPanel,
  type MutuLangsung,
  opsiScreencast,
  TAMPILAN_BAWAAN,
  type Tampilan,
  viewportCss,
} from './tampilan.ts'
import type { BaseCtx, StepCtx } from './types.ts'

const BECOME_HOLD = 4500
const SHOT_TIMEOUT = 10_000
/** Jeda sebelum jendela ditutup paksa saat Hentikan, supaya aksi yang menunggu sempat berhenti. */
const STOP_GRACE_MS = 1500
const CLOSE_TIMEOUT_MS = 5000

const runStamp = () => new Date().toISOString().replaceAll(/[:.]/g, '-').slice(0, 19)
const firstLine = (e: unknown) => (e instanceof Error ? e.message : String(e)).split('\n')[0] ?? ''

type Data = Record<string, unknown>

export interface OpsiJalan {
  headed?: boolean
  speed?: number
  pemeriksaan?: boolean
  ui?: boolean
  /** Jalan dari panel: tempo tontonan penuh walau headless (HEADLESS_HOLD hanya untuk CLI). */
  panel?: boolean
  /** Jeda otomatis di awal setiap langkah (sakelar panel). */
  jedaTiapLangkah?: boolean
  /** Tampilan aplikasi (ukuran layar + skala); bawaan 1400×900 · 100 %. */
  tampilan?: Tampilan
  /** Mutu tampilan langsung (screencast saja); bawaan hemat (perilaku lama), panel memakai tajam. */
  mutuLangsung?: MutuLangsung
  /** Ukuran area tampil panel × devicePixelRatio (untuk batas bingkai screencast). */
  layarPanel?: LayarPanel | null
}

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
  private mutuLangsung: MutuLangsung
  private layarPanel: LayarPanel | null
  private persona: PersonaId | null = null
  private apis = new Map<PersonaId, APIRequestContext>()
  private finished = false
  private stepIdx: number | null = null
  /** Lapisan Pemeriksaan DB (docs/PEMERIKSAAN.md); null bila dimatikan lewat opsi. */
  private pemeriksa: Pemeriksa | null
  /** Lapisan Pemeriksaan UI (statis check:design + DOM); null bila dimatikan (--tanpa-ui). */
  private pemeriksaUi: PemeriksaUi | null
  /** Request tulis per langkah (transaksi tersangka untuk pelanggaran DB). */
  private readonly pencatat: PencatatRequest
  /** Asal cek UI yang sedang dicatat: aksi pastikan* (bawaan) atau field `cek` langkah. */
  private sumberCek: 'aksi' | 'cek' = 'aksi'
  readonly tampilan: Tampilan
  /** Siapkan/Capai yang sedang mencatat request tulis (pencatat langkah 0). */
  private praAktif: PraLangkah | null = null

  constructor(
    berkas: BerkasSkenario & { skenario: Skenario },
    {
      headed = false,
      speed = 1,
      pemeriksaan = true,
      ui = true,
      panel = false,
      jedaTiapLangkah = false,
      tampilan = TAMPILAN_BAWAAN,
      mutuLangsung = 'hemat',
      layarPanel = null,
    }: OpsiJalan = {},
  ) {
    super()
    this.berkas = berkas
    this.sk = berkas.skenario
    this.headed = headed
    this.pemeriksa = pemeriksaan
      ? new Pemeriksa({ nonaktif: this.sk.pemeriksaan?.nonaktif, log: (l) => this.log(l) })
      : null
    this.pemeriksaUi = ui
      ? new PemeriksaUi({
          nonaktif: this.sk.pemeriksaanUi?.nonaktif,
          abaikanHalaman: this.sk.pemeriksaanUi?.abaikanHalaman,
          log: (l) => this.log(l),
        })
      : null
    this.pencatat = new PencatatRequest((n, r) => {
      if (n === 0) {
        this.praAktif?.requests.push(r)
        return
      }
      const step = this.result.steps[n - 1]
      if (!step) return
      step.requests = [...(step.requests ?? []), r]
    })
    this.ctl = new Controller({
      scale: skalaTahan({ headed, panel, headlessHold: config.headlessHold }),
      speed,
    })
    this.ctl.jedaTiapLangkah = jedaTiapLangkah
    this.tampilan = tampilan
    this.mutuLangsung = mutuLangsung
    this.layarPanel = layarPanel
    this.runId = `${berkas.slug}/${runStamp()}`
    this.dir = path.join(config.runsDir, this.runId)
    mkdirSync(this.dir, { recursive: true })
    this.result = {
      run_id: this.runId,
      scenario: berkas.slug,
      task: berkas.task,
      sasaran: { web: config.webUrl, tenant: config.tenantSlug },
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
      tampilan: { ...tampilan, viewport: viewportCss(tampilan) },
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
    return {
      ...this.result,
      speed: this.ctl.speed,
      paused: this.ctl.paused,
      target: this.ctl.target,
      jeda_tiap_langkah: this.ctl.jedaTiapLangkah,
      skala_tahan: this.ctl.scale,
      // "3/7 · teks" → "teks": nomor langkah sudah ada di kartu.
      keterangan: this.ctl.keterangan?.replace(/^\d+\/\d+ · /, '') ?? null,
      data: this.data,
    }
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
      cek: layar ? (c) => this.catatCek(c) : undefined,
      data: this.data,
      catat: (t) => this.note(t),
      log: (l) => this.log(l),
      pustaka: async (nama, args, simpan) => {
        const p = PUSTAKA[nama]
        if (!p) throw new Error(`Aksi pustaka "${nama}" tidak ada`)
        const parsed = p.argumen.safeParse(args)
        if (!parsed.success) {
          const i = parsed.error.issues[0]
          throw new Error(`Argumen ${nama} tidak sah: ${i?.path.join('.')} ${i?.message}`)
        }
        let hasil: unknown
        if (p.jenis === 'api') hasil = await p.jalankan(this.baseCtx(), parsed.data)
        else {
          if (!this.page) throw new Error(`Aksi ${nama} butuh jendela`)
          hasil = await p.jalankan(this.stepCtx(this.page, (this.stepIdx ?? 0) + 1), parsed.data)
        }
        // Dokumen yang dihasilkan aksi diikuti Pemeriksaan (diff kolom antar langkah).
        if (p.dokumen && hasil && this.pemeriksa)
          this.pemeriksa.daftarkanDokumen(p.dokumen(hasil), simpan, nama)
        return hasil
      },
    }
  }

  /**
   * Siapkan/Capai: catat request tulis aksi pustaka, lalu (bila Pemeriksaan DB aktif) satu snapshot jejak
   * baris sesudahnya, supaya perubahan data siapkan tidak tercampur dengan langkah pertama.
   */
  private async catatPra(
    label: PraLangkah['label'],
    n: number,
    kerja: () => Promise<void>,
    { snapshot }: { snapshot: boolean },
  ) {
    const pra: PraLangkah = { label, requests: [] }
    this.result.pra = [...(this.result.pra ?? []).filter((p) => p.label !== label), pra]
    this.praAktif = pra
    this.pencatat.aktif(0)
    lib.setApiListener(this.pencatat.dariApi)
    try {
      await kerja()
    } finally {
      this.pencatat.aktif(null)
      lib.setApiListener(null)
      this.praAktif = null
    }
    const m =
      snapshot && this.pemeriksa && !this.pemeriksa.dilewati ? this.pemeriksa.mulaiLangkah(n) : null
    if (m)
      void m.selesai.then((db) => {
        pra.db = db
        this.save()
        this.emit('change')
      })
    this.save()
  }

  /** Pernyataan data langkah dengan placeholder terisi; yang datanya belum ada langsung jadi hasil galat. */
  private pernyataanLangkah(i: number): { siap: PernyataanSiap[]; galat: HasilPernyataan[] } {
    const n = i + 1
    const siap: PernyataanSiap[] = []
    const galat: HasilPernyataan[] = []
    for (const [k, p] of (this.sk.langkah[i]?.pernyataanData ?? []).entries()) {
      const id = p.id ?? `${n}.d${k + 1}`
      try {
        siap.push({ ...(isiPlaceholder(p as Record<string, unknown>, this.data) as typeof p), id })
      } catch (e) {
        galat.push({
          id,
          judul: p.judul,
          langkah: n,
          lulus: false,
          diharapkan: p.jumlah !== undefined ? `${p.jumlah} baris` : String(p.diharapkan ?? ''),
          terlihat: '–',
          galat: firstLine(e),
        })
      }
    }
    return { siap, galat }
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
      // Satu tenant = satu pemutar sekaligus (proses lain: panel lain, CLI) — dicek sebelum menyentuh server.
      ambilKunci(config.tenantSlug, this.runId)
      // Baseline invarian DB sebelum ada data yang disentuh; galat tidak menggagalkan jalan.
      if (this.pemeriksa?.dikonfigurasi) await this.pemeriksa.ambilBaseline()
      else if (this.pemeriksa)
        this.log('Pemeriksaan DB: tidak dikonfigurasi (V2_DATABASE_URL / V2_BACKEND_DIR kosong)')
      if (fromRun) {
        readRun(fromRun)
        const target = path.join(this.dir, 'data.json')
        copyFileSync(path.join(config.runsDir, fromRun, 'data.json'), target)
        this.data = JSON.parse(readFileSync(target, 'utf8')) as Data
        this.result.data_from = fromRun
        this.log(`Data dipakai dari jalan ${fromRun}`)
      } else {
        this.data = { stempel: kitModule.stamp(), docs: [] }
        if (this.sk.siapkan.length) this.log('Menyiapkan data lewat API…')
        await this.catatPra('Siapkan', 0, () => this.aksiApi(this.sk.siapkan, 'Siapkan'), {
          snapshot: this.sk.siapkan.length > 0,
        })
        this.saveData()
        this.log('Data siap')
      }
      this.setStatus('siap')
    } catch (e) {
      this.result.error = `Siapkan data gagal: ${firstLine(e)}`
      this.log(this.result.error)
      this.setStatus('gagal')
      this.tulisLaporan()
      this.save()
      lepasKunci(config.tenantSlug)
      throw e
    } finally {
      await this.disposeApis()
    }
  }

  private async shot(name: string): Promise<string | null> {
    if (!this.page) return null
    // Screenshot bersorot Pemeriksaan rupa (*-ui.png) menempel ke screenshot langkahnya, tidak dihitung.
    const n =
      readdirSync(this.dir).filter((f) => f.endsWith('.png') && !f.endsWith('-ui.png')).length + 1
    const file = `${String(n).padStart(2, '0')}-${name.replaceAll(/[^a-z0-9]+/gi, '-').slice(0, 60)}.png`
    await this.page
      .screenshot({ path: path.join(this.dir, file), fullPage: false, timeout: SHOT_TIMEOUT })
      .catch(() => null)
    if (!existsSync(path.join(this.dir, file))) return null
    this.result.last_shot = file
    this.result.last_shot_at = new Date().toISOString()
    this.save()
    this.emit('change')
    return file
  }

  /** Kotak elemen relatif viewport (0–1); null bila tidak ada. */
  private async kotak(
    s: SasaranUi,
  ): Promise<{ x: number; y: number; w: number; h: number } | null> {
    if (!this.page) return null
    const vp = this.page.viewportSize()
    const box = await cariLocator(this.page, s)
      .boundingBox({ timeout: 1000 })
      .catch(() => null)
    return box && vp ? lib.targetRelatif(box, vp).bbox : null
  }

  /** Catat satu cek UI di langkah aktif: id n.k, bbox elemen, screenshot khusus bila gagal. */
  private async catatCek(c: CatatanCek) {
    const i = this.stepIdx
    const r = i == null ? null : this.result.steps[i]
    if (!r || i == null) return
    r.cek ??= []
    const n = i + 1
    const urut = r.cek.filter((x) => x.sumber === 'cek' || x.sumber === 'aksi').length + 1
    const bbox = c.sasaran ? await this.kotak(c.sasaran) : null
    // Sasaran ber-id/selector: tampilkan uraian manusia (nama/teks elemen, atau Harus terlihat langkah);
    // selector mentah disimpan sebagai rincian teknis.
    const manusia = c.sasaran && pakaiId(c.sasaran) ? await this.uraianManusia(c, r.expect) : null
    let screenshot: string | null = null
    if (!c.lulus && this.page) {
      // Tanpa kursor/bingkai penunjuk, supaya kotak merah di laporan menunjuk layar apa adanya.
      await lib.hapusPenunjuk(this.page)
      screenshot = await this.shot(`${n}-cek-${urut}`)
    }
    // id tertulis di skenario dipakai bila belum terpakai di langkah ini; selain itu nomor otomatis.
    const id = c.id && !r.cek.some((x) => x.id === c.id) ? c.id : `${n}.${urut}`
    r.cek.push({
      id,
      langkah: n,
      jenis: c.jenis,
      sumber: this.sumberCek,
      judul: manusia?.judul ?? c.judul,
      diharapkan: manusia?.diharapkan ?? c.diharapkan,
      terlihat: c.terlihat,
      lulus: c.lulus,
      ...(c.lunak ? { lunak: true } : {}),
      ...(manusia ? { teknis: c.judul } : {}),
      screenshot,
      bbox,
      waktu: new Date().toISOString(),
    })
    this.save()
    this.emit('change')
  }

  /** Nama elemen (aria-label atau teks pertama) untuk cek bersasaran id; cadangan: Harus terlihat langkah. */
  private async uraianManusia(c: CatatanCek, harusTerlihat: string) {
    let nama: string | null = null
    if (this.page && c.sasaran)
      nama = await cariLocator(this.page, c.sasaran)
        .evaluate(
          (el) => {
            const a = el.getAttribute('aria-label') ?? el.getAttribute('title')
            const t = (a ?? (el as HTMLElement).innerText ?? '')
              .split('\n')
              .map((x) => x.trim())
              .find(Boolean)
            return t ? t.slice(0, 60) : null
          },
          null,
          { timeout: 1000 },
        )
        .catch(() => null)
    const kata = {
      terlihat: 'terlihat',
      tidak_terlihat: 'tidak terlihat',
      nonaktif: 'nonaktif',
      nilai: '',
    }[c.jenis]
    if (c.jenis === 'nilai')
      return { judul: nama ? `Nilai “${nama}”` : c.judul, diharapkan: c.diharapkan }
    return nama
      ? { judul: `Periksa “${nama}” ${kata}`, diharapkan: `“${nama}” ${kata}` }
      : { judul: `Harus terlihat: ${harusTerlihat}`, diharapkan: harusTerlihat }
  }

  /**
   * Lengkapi cek langkah `i` di akhir langkah: cek lulus menunjuk screenshot akhir langkah; "Harus
   * terlihat" tanpa cek otomatis dicatat sebagai *tidak diperiksa otomatis* (lulus null, tidak dihitung);
   * langkah gagal tanpa cek yang gagal (mis. klik tidak menemukan tombol) dicatat sebagai cek langkah gagal.
   */
  private lengkapiCek(i: number, gagal: boolean) {
    const r = this.result.steps[i]
    if (!r) return
    r.cek ??= []
    const n = i + 1
    for (const c of r.cek) if (c.lulus && !c.screenshot) c.screenshot = r.shot
    const otomatis = r.cek.filter((x) => x.sumber === 'cek' || x.sumber === 'aksi')
    const waktu = new Date().toISOString()
    if (gagal && !r.cek.some((x) => x.lulus === false && !x.lunak))
      r.cek.push({
        id: `${n}.${otomatis.length + 1}`,
        langkah: n,
        jenis: 'langkah',
        sumber: 'langkah',
        judul: 'Langkah selesai tanpa galat',
        diharapkan: 'semua aksi langkah berjalan',
        terlihat: r.error,
        lulus: false,
        screenshot: r.shot,
        bbox: this.ctl.target?.bbox ?? null,
        waktu,
      })
    if (!otomatis.length && !r.cek.some((x) => x.sumber === 'harus_terlihat'))
      r.cek.unshift({
        id: `${n}.0`,
        langkah: n,
        jenis: 'manual',
        sumber: 'harus_terlihat',
        judul: 'Harus terlihat',
        diharapkan: r.expect,
        terlihat: null,
        lulus: null,
        screenshot: r.shot,
        bbox: null,
        waktu,
      })
  }

  private async become(who: PersonaId) {
    if (this.persona === who || !this.page) return
    await lib.become(this.page, who, { caption: `Ganti akun: ${personaName(who)}` })
    this.persona = who
    await this.ctl.hold(BECOME_HOLD)
  }

  private opsiScreencast() {
    return opsiScreencast(this.mutuLangsung, this.layarPanel)
  }

  /** Ganti mutu tampilan langsung / ukuran layar panel di tengah jalan (screenshot langkah tidak terpengaruh). */
  async aturLangsung({ mutu, layar }: { mutu?: MutuLangsung; layar?: LayarPanel | null }) {
    if (mutu) this.mutuLangsung = mutu
    if (layar !== undefined) this.layarPanel = layar
    if (!this.cdp) return
    await this.cdp.send('Page.stopScreencast').catch(() => {})
    await this.cdp.send('Page.startScreencast', this.opsiScreencast()).catch(() => {})
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
      await cdp.send('Page.startScreencast', this.opsiScreencast())
      const o = this.opsiScreencast()
      this.log(
        `Tampilan langsung ${this.mutuLangsung} · JPEG ${o.quality}, maks. ${o.maxWidth}×${o.maxHeight} (tidak disimpan)`,
      )
    } catch (e) {
      this.log(`Tampilan langsung tidak tersedia: ${firstLine(e)}`)
    }
  }

  /** Putar langkah mulai indeks `from`. Bila from > 0 dan data bukan dari jalan lain, pakai capai. */
  async start({ from = 0 }: { from?: number } = {}) {
    if (this.result.status !== 'siap')
      throw new Error(`Jalan belum siap (status ${this.result.status})`)
    lib.setController(this.ctl)
    lib.setTampilan(this.tampilan)
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
          await this.catatPra('Capai', from, () => this.aksiApi(capai, 'Capai'), {
            snapshot: capai.length > 0,
          })
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
      this.pencatat.pasangBrowser(p.page)
      lib.setApiListener(this.pencatat.dariApi)
      if (this.pemeriksaUi?.dikonfigurasi) this.pemeriksaUi.siapkan()
      else if (this.pemeriksaUi) this.log('Pemeriksaan UI: tidak dikonfigurasi (V2_DIR kosong)')
      // Menutup jendela (atau browser) sama dengan Hentikan.
      p.page.on('close', () => {
        if (!this.finished) this.ctl.stop()
      })
      await this.startScreencast(p.page)
      this.log(`Jendela dibuka sebagai ${personaName(first)}`)
      for (; i < steps.length; i++) {
        await this.runStep(i, p.page)
        await this.periksaUiLangkah(i)
        await this.periksaLangkah(i)
      }
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
        if (!stopped) {
          r.shot = await this.shot(`${i + 1}-gagal`)
          // Pohon aksesibilitas halaman saat gagal: bahan memperbaiki selector tanpa membuka trace.
          const aria = await this.page
            ?.locator('body')
            .ariaSnapshot({ timeout: 5000 })
            .catch(() => null)
          if (aria && r.shot)
            writeFileSync(
              path.join(this.dir, r.shot.replace(/\.png$/, '.aria.txt')),
              `${this.page?.url()}\n\n${aria}`,
            )
        }
        if (!stopped) this.lengkapiCek(i, true)
        // Keadaan layar dan DB saat langkah ini berhenti ikut diperiksa dan diatribusikan ke langkah ini.
        if (!stopped) await this.periksaUiLangkah(i)
        await this.periksaLangkah(i)
      }
      if (!stopped) {
        this.result.error = firstLine(e)
        this.log(`GAGAL: ${this.result.error}`)
      }
      this.finish(stopped ? 'dihentikan' : 'gagal')
    } finally {
      this.result.duration_ms = Date.now() - t0
      this.pencatat.aktif(null)
      lib.setApiListener(null)
      // Pemeriksaan akhir: tunggu semua snapshot langkah, lalu ringkas — sebelum bersihkan
      // (yang mengubah data lagi), supaya hasil dan skenario selesai bersama.
      if (this.pemeriksa) {
        this.result.pemeriksaan = await this.pemeriksa.akhir()
        const h = this.result.pemeriksaan
        this.log(
          h.status === 'pelanggaran'
            ? `Pemeriksaan DB: PELANGGARAN BARU di ${h.baru.map((b) => b.id).join(', ')}`
            : h.status === 'lulus'
              ? `Pemeriksaan DB: semua invarian lulus (${h.diperiksa} diperiksa, ${h.snapshot?.jumlah ?? 0} snapshot, rata-rata ${h.snapshot?.rataMs ?? 0} ms)`
              : `Pemeriksaan DB: ${h.status}${h.pesan ? ` — ${h.pesan}` : ''}`,
        )
        this.save()
        this.emit('change')
      }
      if (this.pemeriksaUi) {
        this.result.pemeriksaanUi = await this.pemeriksaUi.akhir()
        const h = this.result.pemeriksaanUi
        this.log(
          h.status === 'pelanggaran'
            ? `Pemeriksaan UI: PELANGGARAN STATIS BARU di ${h.baru.map((b) => `${b.rule} ${path.basename(b.file)}`).join(', ')}`
            : h.status === 'peringatan'
              ? `Pemeriksaan UI: ${h.dom.reduce((a, d) => a + d.jumlah, 0)} temuan DOM (${h.dom.map((d) => d.aturan).join(', ')}), 0 statis baru`
              : h.status === 'lulus'
                ? `Pemeriksaan UI: lulus (statis ${h.statis.jumlah}× rata-rata ${h.statis.rataMs} ms, DOM rata-rata ${h.domWaktu.rataEvalMs} ms)`
                : `Pemeriksaan UI: ${h.status}${h.pesan ? ` — ${h.pesan}` : ''}`,
        )
        this.save()
        this.emit('change')
      }
      if (this.sk.bersihkan?.length) {
        // Pembersihan lewat API (mis. mengembalikan setelan), juga saat gagal atau dihentikan.
        try {
          await this.aksiApi(this.sk.bersihkan, 'Bersihkan')
        } catch (e) {
          this.result.cleanup_error = firstLine(e)
          this.log(`PERINGATAN pembersihan: ${this.result.cleanup_error}`)
        }
      }
      this.tulisLaporan()
      this.save()
      await this.close()
    }
  }

  /** Laporan gabungan Markdown di folder jalan; tidak pernah menggagalkan jalan. */
  private tulisLaporan() {
    try {
      writeFileSync(
        path.join(this.dir, 'laporan.md'),
        susunLaporan(this.result, {
          v2Dir: this.pemeriksaUi?.v2Dir ?? config.v2Dir,
          webUrl: config.webUrl,
        }),
      )
      this.result.laporan = 'laporan.md'
    } catch (e) {
      this.log(`Laporan tidak tertulis: ${firstLine(e)}`)
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
    this.ctl.keterangan = null
    this.pencatat.aktif(i + 1)
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
    // "Jeda tiap langkah": kartu langkah baru sudah tampil (emit di atas); tunggu Lanjut sebelum aksi pertama.
    if (this.ctl.jedaTiapLangkah) {
      this.result.current_aksi = daftar.length ? 0 : null
      this.emit('change')
      await this.ctl.awalLangkah()
    }
    const ts = Date.now()
    for (const [j, a] of daftar.entries()) {
      const ar = r.aksi[j]
      if (!ar) continue
      ar.teks = uraiAksi(a, this.data)
      ar.status = 'berjalan'
      this.result.current_aksi = j
      this.emit('change')
      const ta = Date.now()
      try {
        await jalankanAksi(a, env)
      } catch (e) {
        if (e instanceof Stopped || this.ctl.stopRequested) throw e
        // Galat menyebut aksi yang gagal, supaya penulis skenario tahu baris mana yang diperbaiki.
        throw new Error(`aksi ${j + 1} (${ar.teks}): ${firstLine(e).replace(/^Error: /, '')}`)
      }
      ar.ms = Date.now() - ta
      ar.status = 'selesai'
      this.ctl.target = null
      this.emit('change')
    }
    // Pemeriksaan UI terstruktur sesudah semua aksi (gagal non-lunak = langkah gagal).
    if (s.cek?.length) {
      this.sumberCek = 'cek'
      try {
        await jalankanCek(s.cek, env)
      } finally {
        this.sumberCek = 'aksi'
      }
    }
    // Request tulis yang dikirim di ujung langkah (mis. klik lalu tahanan singkat) harus selesai di
    // langkah ini: tercatat di sini dan perubahan datanya masuk snapshot langkah ini, bukan berikutnya.
    const sisa = await this.pencatat.tungguTulis()
    if (sisa) this.log(`Langkah ${i + 1}: ${sisa} request tulis belum selesai sesudah 10 dtk`)
    r.ms = Date.now() - ts
    r.status = 'lulus'
    this.result.current_aksi = null
    r.shot = await this.shot(`${i + 1}-${s.id}`)
    this.lengkapiCek(i, false)
    this.saveData()
    this.save()
  }

  /**
   * Snapshot DB setelah langkah `i` (indeks 0). Mengantre, lalu menunggu hanya sampai query MULAI
   * supaya langkah berikutnya tidak menunggu SQL selesai; hasilnya masuk ke langkah lewat event.
   */
  private async periksaLangkah(i: number) {
    const r = this.result.steps[i]
    if (!this.pemeriksa || !r || r.db) return
    const pd = this.pernyataanLangkah(i)
    const mulai = this.pemeriksa.mulaiLangkah(i + 1, { pernyataan: pd.siap })
    if (!mulai) return
    r.db = {
      status: 'memeriksa',
      pelanggaran: [],
      sembuh: [],
      dokumen: [],
      galat: [],
      durasiMs: null,
    }
    this.emit('change')
    void mulai.selesai.then((db) => {
      if (pd.galat.length) db.pernyataan = [...(db.pernyataan ?? []), ...pd.galat]
      r.db = db
      const n = i + 1
      if (db.status === 'pelanggaran')
        this.log(
          `Langkah ${n}: DB ✗ ${db.pelanggaran.reduce((a, b) => a + b.baris.length, 0)} pelanggaran baru: ${db.pelanggaran.map((x) => x.id).join(', ')}`,
        )
      else if (db.status === 'galat')
        this.log(`Langkah ${n}: DB galat — ${db.galat[0]?.pesan ?? ''}`)
      else
        this.log(
          `Langkah ${n}: DB ok (${db.durasiMs ?? '?'} ms)${db.sembuh.length ? ` · sembuh: ${db.sembuh.map((x) => x.id).join(', ')}` : ''}`,
        )
      for (const d of db.dokumen) this.log(`Langkah ${n}: ${teksDiff(d)}`)
      this.save()
      this.emit('change')
    })
    await mulai.dimulai
  }

  /**
   * Pemeriksaan UI langkah `i`: DOM langsung di halaman yang tampil (diawait — harus sebelum aksi
   * berikutnya) + screenshot bersorot; pemeriksa statis diantre dan hasilnya masuk lewat event.
   */
  private async periksaUiLangkah(i: number) {
    const r = this.result.steps[i]
    if (!this.pemeriksaUi || !r || r.ui) return
    if (!this.pemeriksaUi.dikonfigurasi) {
      r.ui = {
        status: 'tidak_dikonfigurasi',
        url: null,
        pattern: null,
        page: null,
        statis: null,
        dom: null,
        shotUi: null,
        galat: [],
      }
      return
    }
    const mulai = await this.pemeriksaUi.mulaiLangkah(i + 1, this.page, this.dir, r.shot)
    if (!mulai) return
    r.ui = mulai.awal
    this.save()
    this.emit('change')
    const n = i + 1
    if (mulai.awal.dom?.temuan.length)
      this.log(
        `Langkah ${n}: UI ${mulai.awal.dom.temuan.reduce((a, t) => a + t.jumlah, 0)} temuan DOM (${[...new Set(mulai.awal.dom.temuan.map((t) => t.aturan))].join(', ')}, ${mulai.awal.dom.evalMs} ms, ${mulai.awal.dom.elemen} elemen)`,
      )
    void mulai.selesai.then((ui) => {
      r.ui = ui
      const t = teksUiLangkah(ui)
      if (t) this.log(`Langkah ${n}: ${t}`)
      this.save()
      this.emit('change')
    })
  }

  finish(status: RunStatus) {
    this.finished = true
    this.ctl.keterangan = null
    this.result.ended_at = new Date().toISOString()
    this.log(`Jalan ${status}`)
    this.setStatus(status)
  }

  private async close() {
    this.finished = true
    lepasKunci(config.tenantSlug)
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
      lepasKunci(config.tenantSlug)
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

/** Sasaran memakai id/selector teknis (langsung atau di dalam `dalam`). */
function pakaiId(s: SasaranUi): boolean {
  return s.kartuPersetujuan !== undefined || (!!s.dalam && pakaiId(s.dalam))
}

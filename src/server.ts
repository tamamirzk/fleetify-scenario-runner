// Panel Scenario Runner Fleetify: http + Server-Sent Events, hanya 127.0.0.1.
// Satu jalan pada satu waktu; "Putar semua" mengantre skenario satu modul. Sasaran = server v2 lokal
// (FLEETIFY_WEB_URL), persona tenant TENANT_SLUG lewat impersonasi admin platform.
//   bun run panel              → http://localhost:4800 (jendela skenario headed)
//   HEADLESS=1 bun run panel   → tanpa jendela browser (tampilan langsung tetap jalan)
import { existsSync, mkdirSync, readFileSync, watch, writeFileSync } from 'node:fs'
import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import path from 'node:path'
import { config, ROOT } from './core/config.ts'
import { jumpSources, lastResult, listRuns, readRun } from './core/history.ts'
import { jalanTerkunci, lepasKunci, pemegangLain } from './core/kunci.ts'
import { susunDataLaporan } from './core/laporan-data.ts'
import { closeSharedBrowser } from './core/lib.ts'
import { personaName } from './core/personas.ts'
import { modulProject, PROJECTS, statusSkenario } from './core/project.ts'
import {
  bacaRetensi,
  daftarJalanDisk,
  hapusJalan,
  hapusTrace,
  normalRetensi,
  rencanaRetensi,
  teksByte,
} from './core/riwayat.ts'
import { Run } from './core/run.ts'
import { JENIS_TEMUAN, type JenisTemuan, type RunStatus } from './core/run-types.ts'
import {
  type BerkasSkenario,
  bacaSatu,
  bacaSemua,
  infoAlur,
  muatSkenario,
  stepInfo,
  urutAlur,
} from './core/scenarios.ts'
import {
  bacaLayar,
  bacaMutu,
  bacaTampilan,
  type LayarPanel,
  type MutuLangsung,
  TAMPILAN_BAWAAN,
  type Tampilan,
} from './core/tampilan.ts'
import { Pemeriksa } from './pemeriksaan/jalankan.ts'
import { PemeriksaUi } from './pemeriksaan/ui.ts'

const HOST = '127.0.0.1'
/** Jendela browser skenario tampil (headed) untuk jalan berikutnya; bawaan dari HEADLESS di .env, diganti tuas panel. */
let headed = !config.headless
const ACTIVE: RunStatus[] = ['menyiapkan', 'berjalan', 'jeda']
const MAX_LOGS = 500
const PING_MS = 20_000
const FRAME_MS = 100
const SHUTDOWN_GRACE_MS = 3000
const PANEL_DIR = path.join(ROOT, 'panel')
/** Setelan retensi riwayat (panel/CLI), di .cache/ (tidak di-commit). */
const BERKAS_RETENSI = path.join(config.cacheDir, 'riwayat-retensi.json')
const PANEL = path.join(PANEL_DIR, 'index.html')
/** Berkas statis panel: token, CSS komponen, modul JS (tanpa subfolder lain, tanpa titik ganda). */
const ASET_PANEL = /^\/((?:js\/)?[a-z0-9-]+\.(?:css|js))$/

let current: Run | null = null
let antrean: string[] = []
/** Jumlah skenario antrean "Putar semua" yang sedang berjalan (untuk "skenario k dari n"). */
let antreanTotal = 0
/** Sakelar panel "Jeda tiap langkah" (diingat panel di localStorage dan dikirim saat dimuat). */
let jedaTiapLangkah = false
/** Tampilan aplikasi untuk jalan berikutnya (panel mengirim pilihan tersimpannya). */
let tampilanJalan: Tampilan = TAMPILAN_BAWAAN
/** Mutu tampilan langsung (screencast saja): bawaan panel tajam; CLI/uji tetap hemat. */
let mutuLangsung: MutuLangsung = 'tajam'
/** Area tampil panel × devicePixelRatio terakhir yang dilapor peramban (batas bingkai screencast). */
let layarPanel: LayarPanel | null = null
const clients = new Set<ServerResponse>()
const liveClients = new Set<ServerResponse>()
const logs: string[] = []
let lastFrame: string | null = null
let frameTimer: ReturnType<typeof setTimeout> | null = null

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

function broadcast(event: string, data: unknown) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  for (const res of clients) res.write(msg)
}
const snapshot = () => ({
  headed,
  jeda_tiap_langkah: jedaTiapLangkah,
  tampilan: tampilanJalan,
  mutu_langsung: mutuLangsung,
  antrean,
  antrean_total: antreanTotal,
  sasaran: { web: config.webUrl, tenant: config.tenantSlug },
  run: current ? current.snapshot() : null,
})

function kirimFrame() {
  frameTimer = null
  if (!lastFrame) return
  const msg = `event: frame\ndata: ${lastFrame}\n\n`
  for (const res of liveClients) res.write(msg)
}

function attach(run: Run) {
  logs.length = 0
  lastFrame = null
  run.on('log', (l: string) => {
    logs.push(l)
    if (logs.length > MAX_LOGS) logs.shift()
    console.log(l)
    broadcast('log', l)
  })
  run.on('frame', (data: string) => {
    lastFrame = data
    if (!frameTimer) frameTimer = setTimeout(kirimFrame, FRAME_MS)
  })
  let selesai = false
  run.on('change', () => {
    broadcast('state', snapshot())
    const s = run.result.status
    if (!selesai && ['selesai', 'gagal', 'dihentikan'].includes(s)) {
      selesai = true
      if (s === 'dihentikan') antrean = []
      // Tunggu browser tertutup (trace tertulis) sebelum retensi dan skenario berikutnya di antrean.
      setTimeout(() => {
        try {
          jalankanRetensi()
        } catch (e) {
          console.log(`Retensi riwayat gagal: ${(e as Error).message}`)
        }
        lanjutAntrean(run)
      }, 6000)
    }
  })
}

/** Jalan yang tidak boleh dihapus: jalan panel ini yang belum selesai + kunci tenant proses mana pun. */
function jalanAktif(): Set<string> {
  const s = jalanTerkunci()
  if (current && !['selesai', 'gagal', 'dihentikan', 'dibatalkan'].includes(current.result.status))
    s.add(current.runId)
  return s
}

/** Retensi otomatis sesudah jalan selesai: hapus jalan lama dan trace lama sesuai setelan; dicatat di log. */
function jalankanRetensi() {
  const r = bacaRetensi(BERKAS_RETENSI)
  if (!r.aktif) return
  const aktif = jalanAktif()
  const rencana = rencanaRetensi(daftarJalanDisk(config.runsDir), r, aktif)
  let byteJalan = 0
  let byteTrace = 0
  let nJalan = 0
  let nTrace = 0
  for (const id of rencana.hapus)
    try {
      byteJalan += hapusJalan(config.runsDir, id, aktif)
      nJalan++
    } catch {
      // Dilewati (mis. sedang dipakai): dicoba lagi sesudah jalan berikutnya.
    }
  for (const id of rencana.hapusTrace)
    try {
      byteTrace += hapusTrace(config.runsDir, id, aktif)
      nTrace++
    } catch {
      // Dilewati.
    }
  if (nJalan || nTrace) {
    const l = `Retensi riwayat (simpan ${r.simpan} jalan/skenario, trace ${r.trace} terakhir${r.traceGagal ? ' + jalan gagal' : ''}): ${nJalan} jalan dihapus (${teksByte(byteJalan)}), ${nTrace} trace dihapus (${teksByte(byteTrace)})`
    console.log(l)
    logs.push(l)
    broadcast('log', l)
  }
}

function lanjutAntrean(prev: Run) {
  if (current !== prev) return
  const next = antrean.shift()
  broadcast('state', snapshot())
  if (next) mulaiJalan(next, { speed: prev.ctl.speed, autostart: 0 }).catch(() => {})
}

async function mulaiJalan(
  slug: string,
  o: { speed?: number; fromRun?: string; autostart?: number },
): Promise<Run> {
  if (current && ACTIVE.includes(current.result.status))
    throw new HttpError(409, 'Masih ada jalan yang aktif')
  if (current?.result.status === 'siap') {
    lepasKunci(config.tenantSlug)
    current.finish('dibatalkan')
  }
  const lain = pemegangLain(config.tenantSlug)
  if (lain)
    throw new HttpError(
      409,
      `Tenant "${config.tenantSlug}" sedang dipakai pemutar lain (${lain.jalan}, proses ${lain.pid}). Satu tenant = satu pemutar sekaligus: tunggu jalan itu selesai.`,
    )
  const run = new Run(muatSkenario(slug), {
    headed,
    speed: o.speed ?? 1,
    // Tontonan dari panel selalu tempo penuh, juga headless (tampilan langsung = tontonan).
    panel: true,
    jedaTiapLangkah,
    tampilan: tampilanJalan,
    mutuLangsung,
    layarPanel,
  })
  current = run
  attach(run)
  broadcast('state', snapshot())
  run
    .prepare({ fromRun: o.fromRun })
    .then(() => {
      if (o.autostart !== undefined)
        return run.start({ from: o.autostart }).catch((e: Error) => run.log(`GALAT: ${e.message}`))
    })
    .catch(() => {})
  return run
}

function send(
  res: ServerResponse,
  status: number,
  body: unknown,
  type = 'application/json; charset=utf-8',
) {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' })
  res.end(Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body))
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  let raw = ''
  for await (const chunk of req) raw += chunk
  return raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
}

const TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.json': 'application/json; charset=utf-8',
  '.zip': 'application/zip',
  '.md': 'text/markdown; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
}

function requireRun(): Run {
  if (!current) throw new HttpError(409, 'Belum ada jalan')
  return current
}

/** Ringkasan satu berkas untuk kartu dan pratinjau. */
function kartu(b: BerkasSkenario, semua: BerkasSkenario[] = bacaSemua()) {
  const s = b.skenario
  const last = lastResult(b.slug)
  return {
    slug: b.slug,
    task: b.task,
    path: b.path,
    mtime: b.mtime,
    valid: !!s,
    masalah: b.masalah,
    title: s?.judul ?? null,
    tujuan: s?.tujuan ?? null,
    estimasi: s?.estimasi ?? null,
    modul: s?.modul ?? null,
    // Kedudukan di grup: alur lurus atau belok (dari langkah n alur lurus); null = lepas.
    alur: infoAlur(b, semua),
    langkah: s?.langkah.length ?? null,
    persona: s?.persona.length ?? null,
    // Tiket Plane (FMS-123): tautan = TICKET_URL + kunci, tanpa sinkron.
    tiket: (s?.tiket ?? []).map((key) => ({
      sumber: 'plane' as const,
      key,
      url: config.ticketUrl ? `${config.ticketUrl}${key}` : undefined,
    })),
    pemilik: s?.pemilik ?? null,
    status_tertulis: s?.status ?? null,
    status: statusSkenario(s?.status, last),
    last,
  }
}

function detail(b: BerkasSkenario) {
  const s = b.skenario
  const k = kartu(b)
  return {
    ...k,
    raw: b.raw,
    detail: s && {
      ...s,
      tiket: k.tiket,
      persona: s.persona.map((p) => ({ ...p, nama: personaName(p.siapa) })),
      steps: s.langkah.map((l, i) => ({
        ...stepInfo(l, i),
        reach: i === 0 || !!l.capai,
        aksi: l.aksi.length,
        jump_runs: i > 0 ? jumpSources(b.slug, i) : [],
      })),
    },
    runs: listRuns(b.slug).slice(0, 20),
  }
}

/** Temuan "Skenario salah" yang masih berlaku: dari jalan atas versi berkas yang sekarang.
 * Begitu AI mengubah berkas, temuan lama dianggap sudah ditangani. */
function catatanAi(task?: string) {
  const out = []
  for (const b of bacaSemua()) {
    if (task && b.task !== task) continue
    for (const r of listRuns(b.slug)) {
      if (r.file_mtime !== b.mtime) continue
      const full = readRun(r.run_id)
      for (const f of full.findings)
        if (f.jenis === 'skenario')
          out.push({
            path: b.path,
            slug: b.slug,
            run_id: r.run_id,
            at: f.at,
            step_n: f.step_n,
            step: f.step,
            aksi: f.aksi,
            note: f.note,
            error: f.step_n ? (full.steps[f.step_n - 1]?.error ?? null) : null,
            screenshot: f.screenshot ? `runs/${r.run_id}/${f.screenshot}` : null,
          })
    }
  }
  out.sort((a, b) => (a.at < b.at ? 1 : -1))
  const teks = out.length
    ? [
        'Perbaiki skenario JSON berikut berdasarkan temuan "Skenario salah" dari panel Scenario Runner.',
        'Ikuti docs/SKEMA-SKENARIO.md, lalu jalankan bun run check:scenarios dan putar ulang skenarionya.',
        '',
        ...out.map((c, i) =>
          [
            `${i + 1}. ${c.path}${c.step_n ? ` · langkah ${c.step_n} "${c.step}"` : ''}`,
            c.aksi ? `   Aksi saat itu: ${c.aksi}` : null,
            `   Temuan: ${c.note}`,
            c.error ? `   Galat langkah: ${c.error}` : null,
            c.screenshot ? `   Screenshot: ${c.screenshot}` : null,
          ]
            .filter(Boolean)
            .join('\n'),
        ),
      ].join('\n')
    : ''
  return { items: out, teks }
}

function hapusBanyak(body: Record<string, unknown>, jenis: 'jalan' | 'trace') {
  if (body.konfirmasi !== true) throw new HttpError(400, 'Penghapusan butuh konfirmasi')
  const ids = Array.isArray(body.run_ids) ? body.run_ids.map(String) : []
  if (!ids.length) throw new HttpError(400, 'Tidak ada jalan yang dipilih')
  const aktif = jalanAktif()
  const dihapus: string[] = []
  const gagal: { run_id: string; alasan: string }[] = []
  let byte = 0
  for (const id of ids)
    try {
      byte +=
        jenis === 'jalan'
          ? hapusJalan(config.runsDir, id, aktif)
          : hapusTrace(config.runsDir, id, aktif)
      dihapus.push(id)
    } catch (e) {
      gagal.push({ run_id: id, alasan: (e as Error).message })
    }
  const l = `Riwayat: ${jenis === 'jalan' ? `${dihapus.length} jalan dihapus` : `${dihapus.length} trace dihapus`} (${teksByte(byte)})${gagal.length ? `, ${gagal.length} ditolak` : ''}`
  console.log(l)
  broadcast('log', l)
  broadcast('riwayat', Date.now())
  return { dihapus, gagal, byte }
}

type Handler = (body: Record<string, unknown>, url: URL) => Promise<unknown>
const routes: Record<string, Handler> = {
  'GET /api/config': async () => ({
    web_url: config.webUrl,
    ticket_url: config.ticketUrl,
    tenant: config.tenantSlug,
    headed,
    scenarios_dir: path.relative(ROOT, config.scenariosDir),
    // Lapisan Pemeriksaan (docs/PEMERIKSAAN.md): false = V2_DATABASE_URL kosong, hasil "tidak dikonfigurasi".
    pemeriksaan: new Pemeriksa().dikonfigurasi,
    // Pemeriksaan UI: false = V2_DIR kosong atau tidak memuat Frontend/scripts/check-design.ts.
    pemeriksaan_ui: new PemeriksaUi().dikonfigurasi,
    v2_dir: config.v2Dir,
  }),
  'GET /api/scenarios': async () => {
    const semua = bacaSemua()
    return semua.map((b) => kartu(b, semua))
  },
  /** Project › Modul: satu project Fleetify v2; modul = folder scenarios/<modul>/ dengan jumlah berkas. */
  'GET /api/project': async () => {
    const jumlah = new Map<string, number>()
    for (const b of bacaSemua()) jumlah.set(b.task, (jumlah.get(b.task) ?? 0) + 1)
    return {
      projects: PROJECTS.map((p) => ({ id: p.id, nama: p.nama, modul: modulProject(p, jumlah) })),
    }
  },
  'GET /api/state': async () => ({ ...snapshot(), logs }),
  'GET /api/runs': async (_b, url) => listRuns(url.searchParams.get('scenario') || undefined),
  'GET /api/catatan-ai': async (_b, url) => catatanAi(url.searchParams.get('task') || undefined),
  'POST /api/prepare': async (body) => {
    const run = await mulaiJalan(String(body.scenario ?? ''), {
      speed: Number(body.speed ?? 1),
      fromRun: typeof body.from_run === 'string' ? body.from_run : undefined,
      autostart:
        body.autostart_step === undefined
          ? undefined
          : Math.max(0, Number(body.autostart_step) - 1),
    })
    antrean = []
    antreanTotal = 0
    return { run_id: run.runId }
  },
  'POST /api/queue': async (body) => {
    const task = String(body.task ?? '')
    // Urutan grup: alur lurus dulu, lalu belokan menurut titik beloknya.
    const slugs = urutAlur(bacaSemua().filter((b) => b.task === task && b.skenario)).map(
      (b) => b.slug,
    )
    if (!slugs.length) throw new HttpError(400, `Tidak ada skenario valid di modul ${task}`)
    const [first, ...rest] = slugs
    await mulaiJalan(first as string, { speed: Number(body.speed ?? 1), autostart: 0 })
    antrean = rest
    antreanTotal = slugs.length
    broadcast('state', snapshot())
    return { antrean: slugs }
  },
  'POST /api/start': async (body) => {
    const run = requireRun()
    if (run.result.status !== 'siap')
      throw new HttpError(409, `Jalan belum siap (status ${run.result.status})`)
    const from = Math.max(0, Number(body.from_step ?? 1) - 1)
    if (from > 0 && !run.result.data_from && !run.sk.langkah[from]?.capai)
      throw new HttpError(
        400,
        `Langkah ${from + 1} tidak punya capai; siapkan data dari jalan yang berhenti sebelum langkah ini`,
      )
    run.start({ from }).catch((e: Error) => run.log(`GALAT: ${e.message}`))
    return { ok: true }
  },
  'POST /api/pause': async () => {
    requireRun().pause()
    return { ok: true }
  },
  'POST /api/resume': async () => {
    requireRun().resume()
    return { ok: true }
  },
  'POST /api/step': async () => {
    requireRun().step()
    return { ok: true }
  },
  'POST /api/stop': async () => {
    antrean = []
    await requireRun().stop()
    return { ok: true }
  },
  'POST /api/speed': async (body) => {
    const run = requireRun()
    run.setSpeed(body.speed)
    return { speed: run.ctl.speed }
  },
  /** Tuas "Tampilkan jendela browser": berlaku untuk jalan berikutnya (jalan aktif tidak berganti jendela). */
  'POST /api/jendela': async (body) => {
    headed = body.tampil === true
    console.log(
      `Jendela browser skenario: ${headed ? 'tampil' : 'tersembunyi (headless)'} untuk jalan berikutnya`,
    )
    broadcast('state', snapshot())
    return { headed }
  },
  'POST /api/jeda-tiap-langkah': async (body) => {
    jedaTiapLangkah = body.nyala === true
    current?.ctl.setJedaTiapLangkah(jedaTiapLangkah)
    broadcast('state', snapshot())
    return { nyala: jedaTiapLangkah }
  },
  /** Tampilan aplikasi (ukuran laptop + skala) untuk jalan berikutnya. */
  'POST /api/tampilan': async (body) => {
    try {
      tampilanJalan = bacaTampilan(body.ukuran, body.skala)
      if (body.mutu !== undefined) mutuLangsung = bacaMutu(body.mutu, mutuLangsung)
    } catch (e) {
      throw new HttpError(400, (e as Error).message)
    }
    // Mutu tampilan langsung berlaku seketika juga untuk jalan yang sedang diputar.
    await current?.aturLangsung({ mutu: mutuLangsung })
    broadcast('state', snapshot())
    return { tampilan: tampilanJalan, mutu_langsung: mutuLangsung }
  },
  /** Area tampil panel (CSS px) × devicePixelRatio: batas ukuran bingkai screencast mode Tajam. */
  'POST /api/layar-panel': async (body) => {
    const l = bacaLayar(body)
    if (!l) throw new HttpError(400, 'w, h, dpr harus angka positif')
    const sama =
      layarPanel && layarPanel.w === l.w && layarPanel.h === l.h && layarPanel.dpr === l.dpr
    layarPanel = l
    if (!sama) {
      console.log(`Layar panel ${l.w}×${l.h} @${l.dpr}x (batas bingkai tampilan langsung)`)
      await current?.aturLangsung({ layar: l })
    }
    return { layar: layarPanel }
  },
  /** Riwayat di disk: ukuran tiap jalan, total, setelan retensi, jalan yang sedang berjalan. */
  'GET /api/riwayat': async () => {
    const runs = daftarJalanDisk(config.runsDir)
    return {
      runs,
      total: runs.reduce((a, j) => a + j.ukuran, 0),
      total_trace: runs.reduce((a, j) => a + j.ukuran_trace, 0),
      retensi: bacaRetensi(BERKAS_RETENSI),
      aktif: [...jalanAktif()],
    }
  },
  /** Hapus jalan (butuh konfirmasi: true dari dialog panel). Jalan aktif dan path di luar runs/ ditolak. */
  'POST /api/riwayat/hapus': async (body) => hapusBanyak(body, 'jalan'),
  'POST /api/riwayat/hapus-trace': async (body) => hapusBanyak(body, 'trace'),
  'POST /api/riwayat/retensi': async (body) => {
    const r = normalRetensi(body as Record<string, unknown>)
    mkdirSync(config.cacheDir, { recursive: true })
    writeFileSync(BERKAS_RETENSI, JSON.stringify(r, null, 2))
    return { retensi: r }
  },
  /** Pratinjau retensi dengan setelan sekarang (tanpa menghapus). */
  'GET /api/riwayat/rencana-retensi': async () =>
    rencanaRetensi(
      daftarJalanDisk(config.runsDir),
      { ...bacaRetensi(BERKAS_RETENSI), aktif: true },
      jalanAktif(),
    ),
  'POST /api/finding': async (body) => {
    const jenis = String(body.jenis ?? 'bug')
    if (!JENIS_TEMUAN.includes(jenis as JenisTemuan))
      throw new HttpError(400, 'Jenis temuan tidak sah')
    return requireRun().finding(jenis as JenisTemuan, body.note)
  },
  'POST /api/open': async (body) => {
    const b = bacaSatu(String(body.slug ?? ''))
    const cmd =
      process.platform === 'darwin'
        ? ['open', '-t', b.abs]
        : process.platform === 'win32'
          ? ['cmd', '/c', 'start', '', b.abs]
          : ['xdg-open', b.abs]
    const editor = Bun.which('code') ? ['code', '-g', b.abs] : cmd
    Bun.spawn(editor, { stdio: ['ignore', 'ignore', 'ignore'] })
    return { ok: true }
  },
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', `http://${HOST}:${config.port}`)
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html'))
    return send(res, 200, readFileSync(PANEL, 'utf8'), 'text/html; charset=utf-8')
  const aset = req.method === 'GET' ? url.pathname.match(ASET_PANEL)?.[1] : undefined
  if (aset) {
    const file = path.join(PANEL_DIR, aset)
    if (!existsSync(file)) return send(res, 404, { error: 'Tidak ada' })
    return send(res, 200, readFileSync(file), TYPES[path.extname(file)] ?? 'text/plain')
  }
  if (req.method === 'GET' && (url.pathname === '/events' || url.pathname === '/live')) {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    })
    const live = url.pathname === '/live'
    if (live) {
      if (lastFrame) res.write(`event: frame\ndata: ${lastFrame}\n\n`)
      liveClients.add(res)
    } else {
      res.write(`event: state\ndata: ${JSON.stringify(snapshot())}\n\n`)
      clients.add(res)
    }
    const ping = setInterval(() => res.write(': ping\n\n'), PING_MS)
    req.on('close', () => {
      clearInterval(ping)
      clients.delete(res)
      liveClients.delete(res)
    })
    return
  }
  if (req.method === 'GET' && url.pathname.startsWith('/runs/')) {
    const file = path.resolve(
      config.runsDir,
      decodeURIComponent(url.pathname.slice('/runs/'.length)),
    )
    if (!file.startsWith(config.runsDir + path.sep) || !existsSync(file))
      return send(res, 404, { error: 'Tidak ada' })
    return send(
      res,
      200,
      readFileSync(file),
      TYPES[path.extname(file)] ?? 'application/octet-stream',
    )
  }
  let m = url.pathname.match(/^\/api\/scenarios\/([a-z0-9-]+)$/)
  if (req.method === 'GET' && m?.[1]) return send(res, 200, detail(bacaSatu(m[1])))
  m = url.pathname.match(/^\/api\/runs\/([a-z0-9-]+\/[0-9T-]+)$/)
  if (req.method === 'GET' && m?.[1]) {
    const r = readRun(m[1])
    const dataFile = path.join(config.runsDir, m[1], 'data.json')
    return send(res, 200, {
      ...r,
      data: existsSync(dataFile) ? JSON.parse(readFileSync(dataFile, 'utf8')) : null,
      laporan_data: susunDataLaporan(r),
    })
  }
  const handler = routes[`${req.method} ${url.pathname}`]
  if (!handler) return send(res, 404, { error: 'Rute tidak ada' })
  const body = req.method === 'POST' ? await readBody(req) : {}
  return send(res, 200, await handler(body, url))
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e: Error) =>
    send(res, e instanceof HttpError ? e.status : 500, { error: e.message }),
  )
})

// Berkas JSON baru atau berubah: beri tahu panel supaya daftar dimuat ulang.
let watchTimer: ReturnType<typeof setTimeout> | null = null
if (existsSync(config.scenariosDir))
  watch(config.scenariosDir, { recursive: true }, () => {
    if (watchTimer) clearTimeout(watchTimer)
    watchTimer = setTimeout(() => broadcast('scenarios', Date.now()), 300)
  })

server.listen(config.port, HOST, () => {
  console.log(
    `Scenario Runner Fleetify: http://127.0.0.1:${config.port} (${headed ? 'headed' : 'headless'}) · ${config.webUrl} · tenant ${config.tenantSlug}`,
  )
})

const shutdown = async () => {
  const active = !!current && ACTIVE.includes(current.result.status)
  if (active) await current?.stop()
  setTimeout(
    async () => {
      await closeSharedBrowser()
      process.exit(0)
    },
    active ? SHUTDOWN_GRACE_MS : 0,
  )
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

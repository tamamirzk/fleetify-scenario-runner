// Panel Scenario Runner (mode lokal): http + Server-Sent Events, hanya 127.0.0.1.
// Satu jalan pada satu waktu; "Putar semua" mengantre skenario satu task.
//   bun run panel              → http://localhost:4800 (jendela skenario headed)
//   HEADLESS=1 bun run panel   → tanpa jendela browser (tampilan langsung tetap jalan)
import { existsSync, readFileSync, watch } from 'node:fs'
import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import path from 'node:path'
import { config, ROOT } from './core/config.ts'
import { jumpSources, lastResult, listRuns, readRun } from './core/history.ts'
import { personaName } from './core/personas.ts'
import { Run } from './core/run.ts'
import { JENIS_TEMUAN, type JenisTemuan, type RunStatus } from './core/run-types.ts'
import {
  type BerkasSkenario,
  bacaSatu,
  bacaSemua,
  muatSkenario,
  stepInfo,
} from './core/scenarios.ts'
import { Pemeriksa } from './pemeriksaan/jalankan.ts'
import { PemeriksaUi } from './pemeriksaan/ui.ts'

const HOST = '127.0.0.1'
const HEADED = !config.headless
const ACTIVE: RunStatus[] = ['menyiapkan', 'berjalan', 'jeda']
const MAX_LOGS = 500
const PING_MS = 20_000
const FRAME_MS = 100
const SHUTDOWN_GRACE_MS = 3000
const PANEL = path.join(ROOT, 'panel/index.html')

let current: Run | null = null
let antrean: string[] = []
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
  headed: HEADED,
  antrean,
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
      // Tunggu browser tertutup sebelum skenario berikutnya di antrean.
      setTimeout(() => lanjutAntrean(run), 6000)
    }
  })
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
  if (current?.result.status === 'siap') current.finish('dibatalkan')
  const run = new Run(muatSkenario(slug), { headed: HEADED, speed: o.speed ?? 1 })
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
}

function requireRun(): Run {
  if (!current) throw new HttpError(409, 'Belum ada jalan')
  return current
}

/** Ringkasan satu berkas untuk kartu dan pratinjau. */
function kartu(b: BerkasSkenario) {
  const s = b.skenario
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
    tiket: s?.tiket ?? [],
    langkah: s?.langkah.length ?? null,
    persona: s?.persona.length ?? null,
    last: lastResult(b.slug),
  }
}

function detail(b: BerkasSkenario) {
  const s = b.skenario
  return {
    ...kartu(b),
    raw: b.raw,
    detail: s && {
      ...s,
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

type Handler = (body: Record<string, unknown>, url: URL) => Promise<unknown>
const routes: Record<string, Handler> = {
  'GET /api/config': async () => ({
    web_url: config.webUrl,
    ticket_url: config.ticketUrl,
    headed: HEADED,
    scenarios_dir: path.relative(ROOT, config.scenariosDir),
    // Lapisan Pemeriksaan (docs/PEMERIKSAAN.md): false = V2_DATABASE_URL kosong, hasil "tidak dikonfigurasi".
    pemeriksaan: new Pemeriksa().dikonfigurasi,
    // Pemeriksaan UI: false = V2_DIR kosong atau tidak memuat Frontend/scripts/check-design.ts.
    pemeriksaan_ui: new PemeriksaUi().dikonfigurasi,
    v2_dir: config.v2Dir,
  }),
  'GET /api/scenarios': async () => bacaSemua().map(kartu),
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
    return { run_id: run.runId }
  },
  'POST /api/queue': async (body) => {
    const task = String(body.task ?? '')
    const slugs = bacaSemua()
      .filter((b) => b.task === task && b.skenario)
      .map((b) => b.slug)
    if (!slugs.length) throw new HttpError(400, `Tidak ada skenario valid di task ${task}`)
    const [first, ...rest] = slugs
    await mulaiJalan(first as string, { speed: Number(body.speed ?? 1), autostart: 0 })
    antrean = rest
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
    `Scenario Runner: http://localhost:${config.port} (${HEADED ? 'headed' : 'headless'})`,
  )
})

const shutdown = async () => {
  const active = !!current && ACTIVE.includes(current.result.status)
  if (active) await current?.stop()
  setTimeout(() => process.exit(0), active ? SHUTDOWN_GRACE_MS : 0)
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

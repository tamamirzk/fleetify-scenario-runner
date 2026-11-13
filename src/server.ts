// Panel Scenario Runner: http + Server-Sent Events, hanya 127.0.0.1. Satu jalan pada satu waktu.
//   bun run panel              → http://localhost:4800 (jendela skenario headed)
//   HEADLESS=1 bun run panel   → tanpa jendela browser (verifikasi otomatis)
import { existsSync, readFileSync } from 'node:fs'
import http, { type IncomingMessage, type ServerResponse } from 'node:http'
import path from 'node:path'
import { config, ROOT } from './core/config.ts'
import { jumpSources, listRuns, readRun } from './core/history.ts'
import { Run } from './core/run.ts'
import type { RunStatus } from './core/run-types.ts'
import { describeScenario, listScenarios, loadScenario } from './core/scenarios.ts'

const HOST = '127.0.0.1'
const HEADED = !config.headless
const ACTIVE: RunStatus[] = ['menyiapkan', 'berjalan', 'jeda']
const MAX_LOGS = 500
const PING_MS = 20_000
const SHUTDOWN_GRACE_MS = 3000
const PANEL = path.join(ROOT, 'panel/index.html')

let current: Run | null = null
const clients = new Set<ServerResponse>()
const logs: string[] = []

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
const snapshot = () => ({ headed: HEADED, run: current ? current.snapshot() : null })

function attach(run: Run) {
  logs.length = 0
  run.on('log', (l: string) => {
    logs.push(l)
    if (logs.length > MAX_LOGS) logs.shift()
    console.log(l)
    broadcast('log', l)
  })
  run.on('change', () => broadcast('state', snapshot()))
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
}

function requireRun(): Run {
  if (!current) throw new HttpError(409, 'Belum ada jalan')
  return current
}

type Handler = (body: Record<string, unknown>, url: URL) => Promise<unknown>
const routes: Record<string, Handler> = {
  'GET /api/config': async () => ({
    web_url: config.webUrl,
    ticket_url: config.ticketUrl,
    headed: HEADED,
  }),
  'GET /api/scenarios': async () => listScenarios(),
  'GET /api/state': async () => ({ ...snapshot(), logs }),
  'GET /api/runs': async (_b, url) => listRuns(url.searchParams.get('scenario') || undefined),
  'POST /api/prepare': async (body) => {
    if (current && ACTIVE.includes(current.result.status))
      throw new HttpError(409, 'Masih ada jalan yang aktif')
    if (current?.result.status === 'siap') current.finish('dibatalkan')
    const id = String(body.scenario ?? '')
    const run = new Run(id, await loadScenario(id), {
      headed: HEADED,
      speed: Number(body.speed ?? 1),
    })
    current = run
    attach(run)
    broadcast('state', snapshot())
    run
      .prepare({ fromRun: typeof body.from_run === 'string' ? body.from_run : undefined })
      .catch(() => {})
    return { run_id: run.runId }
  },
  'POST /api/start': async (body) => {
    const run = requireRun()
    if (run.result.status !== 'siap')
      throw new HttpError(409, `Jalan belum siap (status ${run.result.status})`)
    const from = Math.max(0, Number(body.from_step ?? 1) - 1)
    if (from > 0 && !run.result.data_from && !run.mod.steps[from]?.reach)
      throw new HttpError(
        400,
        `Langkah ${from + 1} tidak punya reach; siapkan data dari jalan yang berhenti sebelum langkah ini`,
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
    await requireRun().stop()
    return { ok: true }
  },
  'POST /api/speed': async (body) => {
    const run = requireRun()
    run.setSpeed(body.speed)
    return { speed: run.ctl.speed }
  },
  'POST /api/finding': async (body) => requireRun().finding(body.note),
}

async function handle(req: IncomingMessage, res: ServerResponse) {
  const url = new URL(req.url ?? '/', `http://${HOST}:${config.port}`)
  if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html'))
    return send(res, 200, readFileSync(PANEL, 'utf8'), 'text/html; charset=utf-8')
  if (req.method === 'GET' && url.pathname === '/events') {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    })
    res.write(`event: state\ndata: ${JSON.stringify(snapshot())}\n\n`)
    clients.add(res)
    const ping = setInterval(() => res.write(': ping\n\n'), PING_MS)
    req.on('close', () => {
      clearInterval(ping)
      clients.delete(res)
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
  if (req.method === 'GET' && m?.[1]) {
    const id = m[1]
    const d = await describeScenario(id)
    return send(res, 200, {
      ...d,
      steps: d.steps.map((s, i) => ({ ...s, jump_runs: i > 0 ? jumpSources(id, i) : [] })),
    })
  }
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

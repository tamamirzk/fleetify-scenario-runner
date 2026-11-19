// Slot kerja paralel (docs/RANCANGAN-KERJA-V2.md R-7.1–R-7.8). Tiga worktree v2 yang tidak
// bertabrakan: port, database (Postgres native :5433), Redis DB, nama cookie, dan callback login
// sendiri. Satu slot = satu tiket aktif (atau satu klaster). Bagian murni di atas.
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { config, readDotEnv } from './config.ts'

export const NOMOR_SLOT = [1, 2, 3] as const
export type NomorSlot = (typeof NOMOR_SLOT)[number]

/**
 * Slot tetap untuk sesi chat dan bug tanpa tiket (BUG-n / REQ-n). Tiket Plane memakai slot lain;
 * slot ini baru dipinjam bila semuanya penuh. DB-nya tidak pernah di-reset dari template: data
 * uji yang disiapkan saat chat dipakai lagi di sesi berikutnya.
 */
export const SLOT_CHAT: NomorSlot = 3

/** Postgres native (Homebrew postgresql@16) yang menampung DB slot dan template. */
export const PG_SLOT = {
  port: 5433,
  bin: '/opt/homebrew/opt/postgresql@16/bin',
  template: 'fleetify_template',
}

export interface DefSlot {
  n: NomorSlot
  worktree: string
  portApi: number
  portWeb: number
  db: string
  tmux: string
}

export function defSlot(n: NomorSlot, induk = path.dirname(config.v2RepoDir)): DefSlot {
  return {
    n,
    worktree: path.join(induk, `v2-slot${n}`),
    portApi: 3000 + n * 10,
    portWeb: 5180 + n,
    db: `fleetify_slot${n}`,
    tmux: `slot-${n}`,
  }
}

export const semuaSlot = () => NOMOR_SLOT.map((n) => defSlot(n))

export interface PemakaiSlot {
  key: string
  judul: string
  branch: string | null
}

/** Pilihan saat Ambil (R-7.1a): slot kosong, gabung klaster slot terisi, atau Antrekan. */
export interface PilihanSlot {
  n: NomorSlot
  keadaan: 'kosong' | 'klaster' | 'tidak-siap'
  /** Tiket yang sudah memakai slot (klaster). */
  pemakai: PemakaiSlot[]
  keterangan: string
}

export function pilihanSlot(
  pemakaiPerSlot: Map<number, PemakaiSlot[]>,
  siap: Map<number, boolean>,
): PilihanSlot[] {
  return NOMOR_SLOT.map((n) => {
    const p = pemakaiPerSlot.get(n) ?? []
    if (!siap.get(n))
      return { n, keadaan: 'tidak-siap', pemakai: p, keterangan: `worktree v2-slot${n} belum ada` }
    if (!p.length)
      return {
        n,
        keadaan: 'kosong',
        pemakai: [],
        keterangan:
          n === SLOT_CHAT
            ? 'slot chat/bug — pinjam hanya bila slot lain penuh; branch baru dari development; DB tidak di-reset'
            : 'branch baru dari development; DB slot di-reset dari template',
      }
    return {
      n,
      keadaan: 'klaster',
      pemakai: p,
      keterangan: `gabung klaster ${p.map((x) => x.key).join(', ')} (branch ${p[0]?.branch ?? '?'}; DB tidak di-reset)`,
    }
  })
}

/** Nama branch kerja untuk tiket baru: feat/fms-160; kerja bug lokal: fix/bug-3. */
export const branchBaru = (key: string) =>
  `${key.startsWith('BUG-') ? 'fix' : 'feat'}/${key.toLowerCase()}`

/**
 * Alamat slot, eksplisit. Skrip uji memakai ini, BUKAN `config.apiUrl` yang dibaca sebelum
 * `denganSlot` (nilai bawaan .env = server :5173 — salah port yang berulang kali terjadi).
 */
export function urlSlot(n: NomorSlot) {
  const s = defSlot(n)
  return { web: `http://localhost:${s.portWeb}`, api: `http://localhost:${s.portApi}/api/v1` }
}

/** Lingkungan slot untuk potret/kesehatan: alamat web/API dan DB dari .env slot itu. */
export function lingkunganSlot(s: DefSlot) {
  const env = existsSync(path.join(s.worktree, 'Backend', '.env'))
    ? readDotEnv(path.join(s.worktree, 'Backend', '.env'))
    : {}
  return {
    webUrl: `http://localhost:${s.portWeb}`,
    // Langsung ke API slot: proxy /api di vite.config.ts v2 selalu menuju :3000.
    apiUrl: `http://localhost:${s.portApi}/api/v1`,
    v2DatabaseUrl: env.MIGRATE_DATABASE_URL || env.DATABASE_URL || null,
    v2BackendDir: path.join(s.worktree, 'Backend'),
  }
}

/**
 * Jalankan `fn` dengan config diarahkan ke slot (web, API, DB, Backend), lalu pulihkan. Dipakai
 * potret dan cek kesehatan; potret memegang kunci tenant sehingga tidak ada dua yang bersamaan.
 */
export async function denganSlot<T>(s: DefSlot | null, fn: () => Promise<T>): Promise<T> {
  if (!s) return fn()
  const l = lingkunganSlot(s)
  const lama = {
    webUrl: config.webUrl,
    apiUrl: config.apiUrl,
    v2DatabaseUrl: config.v2DatabaseUrl,
    v2BackendDir: config.v2BackendDir,
  }
  Object.assign(config, l)
  try {
    return await fn()
  } finally {
    Object.assign(config, lama)
  }
}

// ── Pelaksana ──────────────────────────────────────────────────────────────

function jalan(args: string[], cwd?: string, env?: Record<string, string>) {
  const r = spawnSync(args[0] as string, args.slice(1), {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  })
  return { kode: r.status ?? 1, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() }
}

const git = (s: DefSlot, ...a: string[]) => jalan(['git', '-C', s.worktree, ...a])
const psql = (sql: string, db = 'postgres') =>
  jalan([`${PG_SLOT.bin}/psql`, '-p', String(PG_SLOT.port), '-d', db, '-Atc', sql])
const mendengar = (port: number) =>
  jalan(['bash', '-c', `lsof -ti tcp:${port} -sTCP:LISTEN | head -1`]).out

export interface KeadaanSlot extends DefSlot {
  ada: boolean
  head: string | null
  branch: string | null
  bersih: boolean
  api: boolean
  web: boolean
  dbUkuran: string | null
}

export function keadaanSlot(s: DefSlot): KeadaanSlot {
  const ada = existsSync(path.join(s.worktree, '.git'))
  const b = ada ? git(s, 'symbolic-ref', '--short', '-q', 'HEAD') : null
  return {
    ...s,
    ada,
    head: ada ? git(s, 'rev-parse', '--short=8', 'HEAD').out : null,
    branch: b && b.kode === 0 && b.out ? b.out : null,
    bersih: ada ? git(s, 'status', '--porcelain').out === '' : true,
    api: !!mendengar(s.portApi),
    web: !!mendengar(s.portWeb),
    dbUkuran: psql(`select pg_size_pretty(pg_database_size('${s.db}'))`).out || null,
  }
}

/** Hanya hidup/mati server slot (cek port), tanpa git/psql: untuk strip ringkas Dashboard. */
export function portSlotHidup(s: DefSlot): { api: boolean; web: boolean } {
  return { api: !!mendengar(s.portApi), web: !!mendengar(s.portWeb) }
}

/** Nyalakan API (bun --hot) dan web (vite --port) slot dalam sesi tmux `slot-<n>`. */
export function nyalakanSlot(s: DefSlot) {
  if (!existsSync(path.join(s.worktree, '.git')))
    throw new Error(`Worktree ${s.worktree} belum ada`)
  if (jalan(['tmux', 'has-session', '-t', s.tmux]).kode === 0)
    jalan(['tmux', 'kill-session', '-t', s.tmux])
  const a = jalan([
    'tmux',
    'new-session',
    '-d',
    '-s',
    s.tmux,
    '-n',
    'api',
    '-c',
    path.join(s.worktree, 'Backend'),
    'bun run --hot src/index.ts',
  ])
  if (a.kode !== 0) throw new Error(`tmux gagal: ${a.err}`)
  jalan([
    'tmux',
    'new-window',
    '-t',
    s.tmux,
    '-n',
    'web',
    '-c',
    path.join(s.worktree, 'Frontend'),
    `bun run dev -- --port ${s.portWeb}`,
  ])
  jalan(['tmux', 'set-option', '-t', s.tmux, 'remain-on-exit', 'on'])
}

export function matikanSlot(s: DefSlot) {
  jalan(['tmux', 'kill-session', '-t', s.tmux])
}

/** DB slot dibuat ulang dari template (R-7.5). Server slot harus mati (koneksi menahan DROP). */
export function resetDbSlot(s: DefSlot) {
  if (mendengar(s.portApi)) throw new Error(`Matikan dulu server slot ${s.n} sebelum reset DB`)
  const d = psql(`DROP DATABASE IF EXISTS ${s.db} WITH (FORCE)`)
  if (d.kode !== 0) throw new Error(`DROP ${s.db} gagal: ${d.err}`)
  const c = psql(`CREATE DATABASE ${s.db} TEMPLATE ${PG_SLOT.template} OWNER fleetify`)
  if (c.kode !== 0) throw new Error(`CREATE ${s.db} gagal: ${c.err}`)
}

/** Migrasi DB slot ke skema worktree-nya: migrate deploy, rls.sql, sync-rbac. Ringkasan per langkah. */
export function migrasiSlot(s: DefSlot): string[] {
  const be = path.join(s.worktree, 'Backend')
  const env = readDotEnv(path.join(be, '.env'))
  const out: string[] = []
  const m = jalan(['bunx', 'prisma', 'migrate', 'deploy'], be)
  if (m.kode !== 0)
    throw new Error(`migrate deploy gagal: ${(m.err || m.out).split('\n').slice(-3).join(' ')}`)
  out.push(
    /No pending/.test(m.out + m.err) ? 'migrasi: tidak ada yang baru' : 'migrasi: diterapkan',
  )
  const mig = (env.MIGRATE_DATABASE_URL ?? '').replace(/\?.*$/, '')
  const r = jalan(
    [`${PG_SLOT.bin}/psql`, mig, '-q', '-v', 'ON_ERROR_STOP=1', '-f', 'prisma/rls.sql'],
    be,
  )
  if (r.kode !== 0) throw new Error(`rls.sql gagal: ${r.err.split('\n').slice(-2).join(' ')}`)
  out.push('RLS: diterapkan')
  const g = jalan(['bunx', 'prisma', 'generate'], be)
  if (g.kode !== 0) throw new Error('prisma generate gagal')
  const b = jalan(['bun', 'run', 'scripts/sync-rbac.ts', '--apply'], be)
  if (b.kode !== 0) throw new Error(`sync-rbac gagal: ${b.err.split('\n').slice(-2).join(' ')}`)
  out.push(`RBAC: ${b.out.split('\n').filter(Boolean).at(-1) ?? 'tersinkron'}`)
  return out
}

/**
 * Siapkan slot untuk tiket baru: worktree harus bersih; fetch development; branch kerja dibuat
 * dari origin/development (atau dipakai bila sudah ada); server dimatikan; DB di-reset dari template.
 */
export function siapkanSlotBaru(s: DefSlot, branch: string, o: { resetDb?: boolean } = {}) {
  if (!existsSync(path.join(s.worktree, '.git')))
    throw new Error(`Worktree ${s.worktree} belum ada`)
  if (git(s, 'status', '--porcelain').out)
    throw new Error(`Worktree slot ${s.n} punya perubahan yang belum di-commit`)
  git(s, 'fetch', '-q', 'origin', 'development')
  const ada = git(s, 'rev-parse', '--verify', '-q', `refs/heads/${branch}`).kode === 0
  const sw = ada
    ? git(s, 'switch', '-q', branch)
    : // --no-track: tanpa upstream ke development, `git pull/push` polos di worktree tak
      // menyasar development; push pertama dari panel memasang upstream ke branch sendiri.
      git(s, 'switch', '-q', '--no-track', '-c', branch, 'origin/development')
  if (sw.kode !== 0) throw new Error(`git switch ${branch} gagal: ${sw.err}`)
  matikanSlot(s)
  if (o.resetDb ?? s.n !== SLOT_CHAT) resetDbSlot(s)
  // Template bisa tertinggal dari development: migrasi menyamakan DB dengan skema branch.
  const langkah = migrasiSlot(s)
  // Client API frontend (gitignore) mengikuti spec branch baru.
  jalan(['bun', 'run', 'gen:client'], path.join(s.worktree, 'Frontend'), {
    OPENAPI_SPEC: 'openapi.json',
  })
  return langkah
}

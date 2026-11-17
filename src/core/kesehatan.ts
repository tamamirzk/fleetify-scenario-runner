// Cek kesehatan lingkungan v2 lokal (docs/RANCANGAN-KERJA-V2.md R-7.7, R-10.1, R-10.2): layanan
// (Postgres, Redis, Authentik, API, web), kesegaran Prisma client, worktree yang melayani API,
// dan keadaan komputer. Bagian murni (penilaian, ringkasan) di atas; pemeriksa di bawah.
import { existsSync, readdirSync, statfsSync, statSync } from 'node:fs'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import { config, readDotEnv } from './config.ts'
import { cariDbUrl } from './db.ts'

export interface CekKesehatan {
  id: string
  nama: string
  /** lulus | gagal (menghalangi kerja) | peringatan (perlu perhatian, tidak menghalangi). */
  hasil: 'lulus' | 'gagal' | 'peringatan'
  info: string
  saran?: string
}

export interface HasilKesehatan {
  at: string
  cek: CekKesehatan[]
}

/**
 * Prisma client: berkas hasil generate lebih tua dari skema → perlu `db:generate`; proses API
 * mulai sebelum client terakhir dibuat → server memakai client lama di memori (kejadian
 * 16 Nov: simpan ganti meter gagal "undefined is not an object").
 */
export function nilaiPrisma(t: {
  skemaTerbaru: number
  client: number | null
  serverMulai: number | null
}): Pick<CekKesehatan, 'hasil' | 'info' | 'saran'> {
  if (t.client == null)
    return {
      hasil: 'gagal',
      info: 'client belum di-generate',
      saran: 'bun run db:generate di Backend',
    }
  if (t.skemaTerbaru > t.client + 1000)
    return {
      hasil: 'gagal',
      info: 'skema lebih baru dari client',
      saran: 'bun run db:generate lalu nyalakan ulang API',
    }
  if (t.serverMulai != null && t.serverMulai + 1000 < t.client)
    return {
      hasil: 'gagal',
      info: 'API berjalan sejak sebelum client terakhir dibuat',
      saran: 'nyalakan ulang API',
    }
  return { hasil: 'lulus', info: 'client segar' }
}

/** Komputer: disk, memori, beban. Hanya peringatan; tidak pernah menghalangi. */
export function nilaiKomputer(k: {
  diskSisaGiB: number
  memoriBebasPersen: number | null
  beban: number
  cpu: number
}): CekKesehatan[] {
  const out: CekKesehatan[] = []
  out.push(
    k.diskSisaGiB < 20
      ? {
          id: 'disk',
          nama: 'Disk',
          hasil: 'peringatan',
          info: `sisa ${k.diskSisaGiB.toFixed(0)} GiB`,
          saran:
            'bersihkan runs/ lama, cache Docker/Colima, node_modules worktree yang tak dipakai',
        }
      : { id: 'disk', nama: 'Disk', hasil: 'lulus', info: `sisa ${k.diskSisaGiB.toFixed(0)} GiB` },
  )
  if (k.memoriBebasPersen != null)
    out.push(
      k.memoriBebasPersen < 20
        ? {
            id: 'memori',
            nama: 'Memori',
            hasil: 'peringatan',
            info: `bebas ${k.memoriBebasPersen}%`,
            saran: 'tutup aplikasi berat atau matikan server v2 yang tak dipakai',
          }
        : { id: 'memori', nama: 'Memori', hasil: 'lulus', info: `bebas ${k.memoriBebasPersen}%` },
    )
  const rasio = k.beban / k.cpu
  out.push(
    rasio > 1.5
      ? {
          id: 'cpu',
          nama: 'CPU',
          hasil: 'peringatan',
          info: `beban ${k.beban.toFixed(1)} untuk ${k.cpu} core`,
          saran: 'cek proses berat (mis. Spotlight mengindeks ~/work)',
        }
      : {
          id: 'cpu',
          nama: 'CPU',
          hasil: 'lulus',
          info: `beban ${k.beban.toFixed(1)} untuk ${k.cpu} core`,
        },
  )
  return out
}

/** Satu baris vonis + hanya yang gagal/peringatan, masing-masing dengan saran (R-10.2). */
export function ringkasKesehatan(h: HasilKesehatan): string {
  const lulus = h.cek.filter((c) => c.hasil === 'lulus').length
  const gagal = h.cek.filter((c) => c.hasil === 'gagal')
  const tanda = gagal.length ? '×' : h.cek.some((c) => c.hasil === 'peringatan') ? '!' : '✓'
  const baris = [`${tanda} kesehatan ${lulus}/${h.cek.length}`]
  for (const c of h.cek)
    if (c.hasil !== 'lulus')
      baris.push(
        `  ${c.hasil === 'gagal' ? '×' : '!'} ${c.nama}: ${c.info}${c.saran ? ` → ${c.saran}` : ''}`,
      )
  return baris.join('\n')
}

/** Cek yang menghalangi potret: tanpa web, API, dan DB, potret hanya merekam halaman galat. */
export const PENTING_POTRET = ['postgres', 'api', 'web'] as const

// ── Pemeriksa ──────────────────────────────────────────────────────────────

const SARAN_DOCKER = 'colima start (Postgres, Redis, Authentik berjalan di Docker dalam Colima)'

async function http(url: string, ms = 3000): Promise<number | null> {
  try {
    const r = await fetch(url, { signal: AbortSignal.timeout(ms), redirect: 'manual' })
    return r.status
  } catch {
    return null
  }
}

function redisPing(url: string, ms = 2000): Promise<boolean> {
  const u = new URL(url)
  return new Promise((ok) => {
    const s = net.createConnection({ host: u.hostname, port: Number(u.port || 6379) })
    const selesai = (v: boolean) => {
      s.destroy()
      ok(v)
    }
    s.setTimeout(ms, () => selesai(false))
    s.on('error', () => selesai(false))
    s.on('connect', () => s.write('PING\r\n'))
    s.on('data', (d) => selesai(d.toString().startsWith('+PONG')))
  })
}

async function postgres(url: string): Promise<string | null> {
  const { SQL } = await import('bun')
  const sql = new SQL(url, { max: 1, connectionTimeout: 3 })
  try {
    await sql`select 1`
    return null
  } catch (e) {
    return (e as Error).message.split('\n')[0] ?? 'gagal'
  } finally {
    await sql.close().catch(() => {})
  }
}

async function sh(cmd: string, cwd?: string) {
  const p = Bun.spawn(['bash', '-c', cmd], { cwd, stdout: 'pipe', stderr: 'pipe' })
  const out = await new Response(p.stdout).text()
  return { kode: await p.exited, out: out.trim() }
}

const mtimeTerbaru = (dir: string): number => {
  let t = 0
  if (!existsSync(dir)) return t
  for (const e of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!e.isFile()) continue
    const f = path.join(e.parentPath, e.name)
    t = Math.max(t, statSync(f).mtimeMs)
  }
  return t
}

/** PID yang mendengar port, cwd-nya, dan waktu mulainya. */
async function pendengar(port: number) {
  const pid = (await sh(`lsof -ti tcp:${port} -sTCP:LISTEN | head -1`)).out
  if (!pid) return null
  const cwd = (await sh(`lsof -a -p ${pid} -d cwd -Fn | sed -n 's/^n//p'`)).out
  const mulai = (await sh(`ps -o lstart= -p ${pid}`)).out
  return { pid, cwd, mulai: mulai ? new Date(mulai).getTime() : null }
}

/**
 * Periksa lingkungan v2. `commitKerja` (opsional) = commit terakhir sebuah kerja; bila diberikan,
 * diperiksa apakah HEAD worktree yang melayani API sudah memuatnya.
 */
export async function periksaKesehatan(
  o: { commitKerja?: string | null; hanya?: readonly string[] } = {},
): Promise<HasilKesehatan> {
  const cek: CekKesehatan[] = []
  const mau = (id: string) => !o.hanya || o.hanya.includes(id)
  const backendDir = config.v2BackendDir
  const env =
    backendDir && existsSync(path.join(backendDir, '.env'))
      ? readDotEnv(path.join(backendDir, '.env'))
      : {}
  const portApi = Number(env.PORT || 3000)

  const tugas: Promise<void>[] = []
  if (mau('postgres'))
    tugas.push(
      (async () => {
        const url = cariDbUrl({ dbUrl: config.v2DatabaseUrl, backendDir })
        if (!url)
          return void cek.push({
            id: 'postgres',
            nama: 'Postgres',
            hasil: 'gagal',
            info: 'tidak dikonfigurasi',
            saran: 'isi V2_DATABASE_URL atau V2_BACKEND_DIR di .env',
          })
        const galat = await postgres(url)
        cek.push(
          galat
            ? { id: 'postgres', nama: 'Postgres', hasil: 'gagal', info: galat, saran: SARAN_DOCKER }
            : {
                id: 'postgres',
                nama: 'Postgres',
                hasil: 'lulus',
                info: new URL(url).pathname.slice(1),
              },
        )
      })(),
    )
  if (mau('redis') && env.REDIS_URL)
    tugas.push(
      (async () => {
        const ok = await redisPing(env.REDIS_URL as string)
        cek.push(
          ok
            ? { id: 'redis', nama: 'Redis', hasil: 'lulus', info: 'PONG' }
            : {
                id: 'redis',
                nama: 'Redis',
                hasil: 'gagal',
                info: 'tidak menjawab',
                saran: SARAN_DOCKER,
              },
        )
      })(),
    )
  if (mau('authentik') && env.OIDC_ISSUER)
    tugas.push(
      (async () => {
        const s = await http(`${new URL(env.OIDC_ISSUER as string).origin}/-/health/live/`)
        cek.push(
          s != null && s < 500
            ? { id: 'authentik', nama: 'Authentik (login)', hasil: 'lulus', info: `HTTP ${s}` }
            : {
                id: 'authentik',
                nama: 'Authentik (login)',
                hasil: 'gagal',
                info: s == null ? 'tidak menjawab' : `HTTP ${s}`,
                saran: SARAN_DOCKER,
              },
        )
      })(),
    )
  if (mau('api'))
    tugas.push(
      (async () => {
        const s = await http(`http://localhost:${portApi}/docs`)
        cek.push(
          s != null && s < 500
            ? { id: 'api', nama: `API :${portApi}`, hasil: 'lulus', info: `HTTP ${s}` }
            : {
                id: 'api',
                nama: `API :${portApi}`,
                hasil: 'gagal',
                info: s == null ? 'tidak menjawab' : `HTTP ${s}`,
                saran: 'bun run --hot src/index.ts di Backend worktree',
              },
        )
      })(),
    )
  if (mau('web'))
    tugas.push(
      (async () => {
        const s = await http(config.webUrl)
        cek.push(
          s != null && s < 500
            ? { id: 'web', nama: 'Web', hasil: 'lulus', info: `HTTP ${s}` }
            : {
                id: 'web',
                nama: 'Web',
                hasil: 'gagal',
                info: s == null ? 'tidak menjawab' : `HTTP ${s}`,
                saran: 'bun run dev di Frontend worktree',
              },
        )
      })(),
    )
  await Promise.all(tugas)

  if (mau('prisma') || mau('server')) {
    const p = await pendengar(portApi)
    const dir = p?.cwd || backendDir
    if (dir && mau('prisma')) {
      const clientJs = path.join(dir, 'node_modules', '.prisma', 'client', 'client.js')
      const n = nilaiPrisma({
        skemaTerbaru: mtimeTerbaru(path.join(dir, 'prisma', 'schema')),
        client: existsSync(clientJs) ? statSync(clientJs).mtimeMs : null,
        serverMulai: p?.mulai ?? null,
      })
      cek.push({ id: 'prisma', nama: 'Prisma client', ...n })
    }
    if (p && mau('server')) {
      const head = (await sh('git rev-parse --short=8 HEAD', p.cwd)).out
      const nama = path.basename(path.resolve(p.cwd, '..'))
      const potretDir = backendDir ? path.resolve(backendDir) : null
      const beda = potretDir && path.resolve(p.cwd) !== potretDir
      let c: CekKesehatan = {
        id: 'server',
        nama: 'Worktree API',
        hasil: 'lulus',
        info: `${nama} @ ${head}`,
      }
      if (beda)
        c = {
          ...c,
          hasil: 'peringatan',
          info: `${c.info}, padahal potret membaca ${path.basename(path.dirname(potretDir))}`,
          saran: 'samakan V2_BACKEND_DIR dengan worktree yang menyala',
        }
      if (o.commitKerja) {
        const ada = await sh(`git merge-base --is-ancestor ${o.commitKerja} HEAD`, p.cwd)
        if (ada.kode !== 0)
          c = {
            ...c,
            hasil: 'peringatan',
            info: `${c.info}, belum memuat commit kerja ${o.commitKerja.slice(0, 8)}`,
            saran:
              'pindahkan worktree yang menyala ke branch kerja (perlu izin) sebelum potret sesudah',
          }
      }
      cek.push(c)
    }
  }

  if (mau('komputer')) {
    const fs = statfsSync(os.homedir())
    const mp = await sh('memory_pressure 2>/dev/null | tail -1')
    const persen = mp.out.match(/(\d+)%/)?.[1]
    cek.push(
      ...nilaiKomputer({
        diskSisaGiB: (fs.bavail * fs.bsize) / 1024 ** 3,
        memoriBebasPersen: persen ? Number(persen) : null,
        beban: os.loadavg()[0] ?? 0,
        cpu: os.cpus().length,
      }),
    )
  }

  const urut = [
    'postgres',
    'redis',
    'authentik',
    'api',
    'web',
    'prisma',
    'server',
    'disk',
    'memori',
    'cpu',
  ]
  cek.sort((a, b) => urut.indexOf(a.id) - urut.indexOf(b.id))
  return { at: new Date().toISOString(), cek }
}

// Alamat DB Postgres lokal v2, untuk lapisan Pemeriksaan (hanya SELECT) dan pengecualian
// db-lewat-api. Pagar: hanya host lokal, seperti FLEETIFY_WEB_URL. Berkas ini murni (tanpa
// import "bun") supaya bisa diuji Vitest; koneksi dibuka di src/pemeriksaan/jalankan.ts.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { readDotEnv } from './config.ts'

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])

/** Nama host dari URL postgres (`postgresql://user:pw@host:5432/db?schema=public`). */
export function hostDbUrl(url: string): string {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    throw new Error('URL database tidak sah')
  }
  if (!/^postgres(ql)?:$/.test(u.protocol)) throw new Error('URL database harus postgresql://')
  if (!u.hostname) throw new Error('URL database tanpa host')
  return u.hostname
}

/** Tolak host selain localhost/127.0.0.1; kembalikan URL tanpa `?schema=` (tak dikenal klien). */
export function pastikanDbLokal(url: string): string {
  const host = hostDbUrl(url)
  if (!LOCAL_HOSTS.has(host))
    throw new Error(
      `Database ${host} ditolak: hanya database lokal; jangan arahkan ke staging atau produksi`,
    )
  const u = new URL(url)
  u.searchParams.delete('schema')
  return u.toString().replace(/\?$/, '')
}

/** URL dari .env Backend v2: MIGRATE_DATABASE_URL (peran yang menembus RLS) lalu DATABASE_URL. */
export function dbUrlDariBackend(backendDir: string): string | null {
  const file = path.join(backendDir, '.env')
  if (!existsSync(file)) return null
  const env = readDotEnv(file)
  return env.MIGRATE_DATABASE_URL || env.DATABASE_URL || null
}

/** V2_DATABASE_URL, atau .env Backend (V2_BACKEND_DIR). null = Pemeriksaan tidak dikonfigurasi. */
export function cariDbUrl(opsi: {
  dbUrl?: string | null
  backendDir?: string | null
}): string | null {
  if (opsi.dbUrl) return pastikanDbLokal(opsi.dbUrl)
  if (opsi.backendDir) {
    const u = dbUrlDariBackend(opsi.backendDir)
    if (u) return pastikanDbLokal(u)
  }
  return null
}

/** Nama database dari URL, untuk log dan tampilan (tanpa kredensial). */
export function namaDb(url: string): string {
  const u = new URL(url)
  return `${u.hostname}:${u.port || 5432}/${u.pathname.replace(/^\//, '')}`
}

// Kunci tenant: satu tenant = satu pemutar sekaligus. Dua jalan di tenant yang sama (panel lain, CLI)
// saling menimpa impersonasi sesi admin dan data skenario, jadi jalan kedua (proses lain) ditolak dengan
// pesan jelas selama kunci dipegang proses yang masih hidup. Berkas kunci di .cache/.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { config } from './config.ts'

export interface IsiKunci {
  pid: number
  jalan: string
  mulai: string
}

const berkasKunci = (tenant: string) => path.join(config.cacheDir, `kunci-${tenant}.json`)

/** Proses masih hidup? (sinyal 0 hanya memeriksa keberadaan). */
export function hidup(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/** Pemegang kunci tenant ini dari proses LAIN yang masih hidup; null bila bebas. */
export function pemegangLain(s: string, pid = process.pid): IsiKunci | null {
  const f = berkasKunci(s)
  if (!existsSync(f)) return null
  try {
    const k = JSON.parse(readFileSync(f, 'utf8')) as IsiKunci
    return k.pid !== pid && hidup(k.pid) ? k : null
  } catch {
    return null
  }
}

/** Ambil kunci tenant untuk jalan ini; lempar bila dipegang proses lain yang masih hidup. */
export function ambilKunci(s: string, jalan: string): void {
  const lain = pemegangLain(s)
  if (lain)
    throw new Error(
      `Tenant "${s}" sedang dipakai jalan lain (${lain.jalan}, proses ${lain.pid}, sejak ${new Date(lain.mulai).toTimeString().slice(0, 8)}). Satu tenant = satu pemutar sekaligus: tunggu jalan itu selesai.`,
    )
  mkdirSync(config.cacheDir, { recursive: true })
  writeFileSync(
    berkasKunci(s),
    JSON.stringify({ pid: process.pid, jalan, mulai: new Date().toISOString() } satisfies IsiKunci),
  )
}

/** Lepas kunci bila masih milik proses ini. */
export function lepasKunci(s: string): void {
  const f = berkasKunci(s)
  if (!existsSync(f)) return
  try {
    const k = JSON.parse(readFileSync(f, 'utf8')) as IsiKunci
    if (k.pid === process.pid) rmSync(f, { force: true })
  } catch {
    rmSync(f, { force: true })
  }
}

/** Jalan yang sedang memegang kunci tenant (proses mana pun yang masih hidup): jangan dihapus. */
export function jalanTerkunci(): Set<string> {
  const out = new Set<string>()
  if (!existsSync(config.cacheDir)) return out
  for (const f of readdirSync(config.cacheDir))
    if (/^kunci-.*\.json$/.test(f))
      try {
        const k = JSON.parse(readFileSync(path.join(config.cacheDir, f), 'utf8')) as IsiKunci
        if (hidup(k.pid) && k.jalan) out.add(k.jalan)
      } catch {
        // Berkas kunci rusak: abaikan.
      }
  return out
}

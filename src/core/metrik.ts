// Metrik per tiket (docs/RANCANGAN-KERJA-V2.md R-9.3): lama per tahap dari riwayat, kerja ulang,
// dan token dari transkrip sesi Claude milik tiket. Bagian murni di atas; pembaca berkas di bawah.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { Kerja, Tahap } from './kerja.ts'
import { TAHAP } from './kerja.ts'

export interface Token {
  input: number
  output: number
  cacheTulis: number
  cacheBaca: number
}

export interface Metrik {
  key: string
  judul: string
  tahap: Tahap
  /** Milidetik per tahap (waktu kalender sejak masuk tahap itu sampai pindah). */
  durasi: Partial<Record<Tahap, number>>
  totalMs: number
  kerjaUlang: { tahapMundur: number; mintaUbah: number; gerbangCiGagal: boolean }
  /** Null bila tiket belum punya sesi Claude dari panel atau transkripnya tidak ditemukan. */
  token: Token | null
}

/** Lama tiap tahap dari riwayat; tahap terakhir dihitung sampai `kini` kecuali Selesai. */
export function durasiTahap(
  riwayat: { at: string; tahap: Tahap }[],
  kini: number,
): Partial<Record<Tahap, number>> {
  const out: Partial<Record<Tahap, number>> = {}
  const urut = [...riwayat].sort((a, b) => a.at.localeCompare(b.at))
  for (let i = 0; i < urut.length; i++) {
    const r = urut[i] as { at: string; tahap: Tahap }
    if (r.tahap === 'selesai') continue
    const akhir = i + 1 < urut.length ? Date.parse((urut[i + 1] as { at: string }).at) : kini
    out[r.tahap] = (out[r.tahap] ?? 0) + Math.max(0, akhir - Date.parse(r.at))
  }
  return out
}

/** Berapa kali tahap mundur (mis. Diverifikasi → Dikerjakan): ukuran kerja ulang. */
export function tahapMundur(riwayat: { at: string; tahap: Tahap }[]): number {
  const urut = [...riwayat].sort((a, b) => a.at.localeCompare(b.at))
  let n = 0
  for (let i = 1; i < urut.length; i++)
    if (
      TAHAP.indexOf((urut[i] as { tahap: Tahap }).tahap) <
      TAHAP.indexOf((urut[i - 1] as { tahap: Tahap }).tahap)
    )
      n++
  return n
}

/** Jumlah token dari baris transkrip JSONL Claude Code; pesan yang sama (id) dihitung sekali. */
export function jumlahToken(jsonl: string): Token {
  const t: Token = { input: 0, output: 0, cacheTulis: 0, cacheBaca: 0 }
  const sudah = new Set<string>()
  for (const baris of jsonl.split('\n')) {
    if (!baris.includes('"usage"')) continue
    let e: { message?: { id?: string; usage?: Record<string, number> } }
    try {
      e = JSON.parse(baris)
    } catch {
      continue
    }
    const u = e.message?.usage
    if (!u) continue
    const id = e.message?.id
    if (id) {
      if (sudah.has(id)) continue
      sudah.add(id)
    }
    t.input += u.input_tokens ?? 0
    t.output += u.output_tokens ?? 0
    t.cacheTulis += u.cache_creation_input_tokens ?? 0
    t.cacheBaca += u.cache_read_input_tokens ?? 0
  }
  return t
}

export function metrikKerja(k: Kerja, token: Token | null, kini = Date.now()): Metrik {
  const durasi = durasiTahap(k.riwayat, kini)
  return {
    key: k.key,
    judul: k.judul,
    tahap: k.tahap,
    durasi,
    totalMs: Object.values(durasi).reduce((a, b) => a + (b ?? 0), 0),
    kerjaUlang: {
      tahapMundur: tahapMundur(k.riwayat),
      mintaUbah: k.mintaUbah.length,
      gerbangCiGagal: k.gerbang?.ci?.hasil === 'gagal',
    },
    token,
  }
}

// ── Pembaca transkrip ──────────────────────────────────────────────────────

const DIR_PROYEK = path.join(os.homedir(), '.claude', 'projects')
const cache = new Map<string, { mtime: number; token: Token }>()

/** Token sesi Claude berdasarkan ID; dicari di semua folder proyek Claude Code, di-cache per mtime. */
export function tokenSesi(id: string | undefined | null): Token | null {
  if (!id || !/^[0-9a-f-]{36}$/.test(id) || !existsSync(DIR_PROYEK)) return null
  for (const d of readdirSync(DIR_PROYEK)) {
    const f = path.join(DIR_PROYEK, d, `${id}.jsonl`)
    if (!existsSync(f)) continue
    const mtime = statSync(f).mtimeMs
    const c = cache.get(f)
    if (c && c.mtime === mtime) return c.token
    const token = jumlahToken(readFileSync(f, 'utf8'))
    cache.set(f, { mtime, token })
    return token
  }
  return null
}

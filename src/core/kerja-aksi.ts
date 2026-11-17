// Aksi Kerja yang dipakai CLI (bun run kerja) dan panel: ambil dari Plane, target, potret, cek, catat,
// tulis ke Plane. Menulis ke Plane terlihat tim: pemanggil wajib sudah mendapat konfirmasi pengguna.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { config } from './config.ts'
import { type HasilGerbang, jalankanGerbang } from './gerbang.ts'
import {
  adaKerja,
  bacaKerja,
  dirKerja,
  type Fase,
  type HasilCek,
  type Kerja,
  kerjaDariTiket,
  komentarHtml,
  pindahTahap,
  setCek,
  simpanKerja,
  type Tahap,
  TargetSchema,
} from './kerja.ts'
import { PENTING_POTRET, periksaKesehatan } from './kesehatan.ts'
import { ambilTiket, komentarTiket, pindahStatusTiket } from './plane.ts'
import { potret } from './potret.ts'

export async function ambilKerja(key: string): Promise<Kerja> {
  const t = await ambilTiket(key)
  const { kerja, tiketMd } = kerjaDariTiket(t, adaKerja(key) ? bacaKerja(key) : null)
  simpanKerja(kerja)
  writeFileSync(path.join(dirKerja(key), 'tiket.md'), tiketMd)
  return kerja
}

export function setTahap(key: string, tahap: Tahap, catatan = ''): Kerja {
  const k = pindahTahap(bacaKerja(key), tahap, catatan)
  simpanKerja(k)
  return k
}

/** Target potret dari objek atau berkas JSON; divalidasi skema. */
export function setTarget(key: string, sumber: unknown): Kerja {
  const isi = typeof sumber === 'string' ? JSON.parse(readFileSync(sumber, 'utf8')) : sumber
  const r = TargetSchema.safeParse(isi)
  if (!r.success)
    throw new Error(
      `Target tidak sah:\n${r.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`,
    )
  const k = { ...bacaKerja(key), target: r.data }
  simpanKerja(k)
  return k
}

export async function potretKerja(
  key: string,
  fase: Fase,
  log?: (l: string) => void,
): Promise<Kerja> {
  // Tanpa web, API, atau DB, potret hanya merekam halaman galat dan menimpa bukti (R-7.7).
  const sehat = await periksaKesehatan({ hanya: PENTING_POTRET })
  const mati = sehat.cek.filter((c) => c.hasil === 'gagal')
  if (mati.length)
    throw new Error(
      `Potret ${fase} dibatalkan: ${mati.map((c) => `${c.nama} ${c.info}${c.saran ? ` (${c.saran})` : ''}`).join('; ')}`,
    )
  const hasil = await potret(bacaKerja(key), fase, log)
  // Baca ulang: kerja.json bisa berubah selama memotret (mis. hasil cek dicatat).
  const k = bacaKerja(key)
  const gagal = [...hasil.layar, ...hasil.db].filter((x) => x.galat).length
  const k2 = pindahTahap(
    { ...k, potret: { ...k.potret, [fase]: hasil } },
    k.tahap,
    `Potret ${fase}: ${hasil.layar.length} layar, ${hasil.db.length} query${gagal ? `, ${gagal} gagal` : ''}`,
  )
  simpanKerja(k2)
  return k2
}

export function catatKerja(
  key: string,
  o: { branch?: string; commit?: string[]; skenario?: string[]; worktree?: string },
): Kerja {
  const k = bacaKerja(key)
  const gabung = (a: string[], b: string[] = []) => [...new Set([...a, ...b])]
  const k2 = {
    ...k,
    worktree: o.worktree ? path.resolve(o.worktree) : k.worktree,
    branch: o.branch ?? k.branch,
    commit: gabung(k.commit, o.commit),
    skenario: gabung(k.skenario, o.skenario),
  }
  simpanKerja(k2)
  return k2
}

/** Worktree v2 sebuah kerja: opsi eksplisit, lalu kerja.json, lalu V2_REPO_DIR. */
export const worktreeKerja = (k: Kerja, dir?: string) =>
  path.resolve(dir ?? k.worktree ?? config.v2RepoDir)

/** Jalankan gerbang fokus/ci untuk sebuah kerja; hasil disimpan di kerja.json, log di kerja/<KEY>/gerbang/. */
export async function gerbangKerja(
  key: string,
  tingkat: 'fokus' | 'ci',
  o: { dir?: string; rinci?: (s: string) => void } = {},
): Promise<HasilGerbang> {
  const k = bacaKerja(key)
  const dir = worktreeKerja(k, o.dir)
  if (!existsSync(path.join(dir, '.git'))) throw new Error(`Worktree v2 tidak ditemukan: ${dir}`)
  const cap = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13)
  const h = await jalankanGerbang({
    dir,
    tingkat,
    logRel: `kerja/${key}/gerbang/${tingkat}-${cap}.log`,
    rinci: o.rinci,
  })
  const k2 = bacaKerja(key)
  simpanKerja({ ...k2, gerbang: { ...(k2.gerbang ?? {}), [tingkat]: h } })
  return h
}

/** Catat hasil verifikasi satu kriteria tiket. */
export function cekKerja(key: string, kriteria: string, hasil: HasilCek, bukti = ''): Kerja {
  const k = setCek(bacaKerja(key), kriteria, hasil, bukti)
  simpanKerja(k)
  return k
}

/** Kirim komentar dokumentasi ke tiket Plane. Hanya setelah dikonfirmasi pengguna. */
export async function komentarKePlane(key: string, catatan = ''): Promise<Kerja> {
  const k = bacaKerja(key)
  await komentarTiket(k.plane, komentarHtml(k, catatan))
  const at = new Date().toISOString()
  const k2 = pindahTahap(
    { ...k, plane: { ...k.plane, komentar_at: at } },
    k.tahap,
    'Komentar dokumentasi dikirim ke Plane',
  )
  simpanKerja(k2)
  return k2
}

/** Pindah status tiket di Plane. Hanya setelah dikonfirmasi pengguna. */
export async function statusKePlane(key: string, nama: string): Promise<Kerja> {
  const k = bacaKerja(key)
  const baru = await pindahStatusTiket(k.plane, nama)
  const at = new Date().toISOString()
  const k2 = pindahTahap(
    { ...k, plane: { ...k.plane, status: baru, status_baru: baru, status_at: at } },
    k.tahap,
    `Status Plane dipindah ke ${baru}`,
  )
  simpanKerja(k2)
  return k2
}

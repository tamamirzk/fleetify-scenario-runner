// Aksi Kerja yang dipakai CLI (bun run kerja) dan panel: ambil dari Plane, target, potret, catat,
// tulis ke Plane. Menulis ke Plane terlihat tim: pemanggil wajib sudah mendapat konfirmasi pengguna.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  adaKerja,
  bacaKerja,
  dirKerja,
  type Fase,
  type Kerja,
  kerjaDariTiket,
  komentarHtml,
  pindahTahap,
  simpanKerja,
  type Tahap,
  TargetSchema,
} from './kerja.ts'
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
  const hasil = await potret(bacaKerja(key), fase, log)
  // Baca ulang: kerja.json bisa berubah selama memotret (mis. AI mencatat commit).
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
  o: { branch?: string; commit?: string[]; skenario?: string[] },
): Kerja {
  const k = bacaKerja(key)
  const gabung = (a: string[], b: string[] = []) => [...new Set([...a, ...b])]
  const k2 = {
    ...k,
    branch: o.branch ?? k.branch,
    commit: gabung(k.commit, o.commit),
    skenario: gabung(k.skenario, o.skenario),
  }
  simpanKerja(k2)
  return k2
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

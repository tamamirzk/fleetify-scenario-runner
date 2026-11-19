// Pratinjau tiket Plane untuk laci di "Tugas saya": deskripsi tiket sebagai teks aman (tanpa HTML).
// Hanya membaca Plane (ambilTiket); hasilnya disimpan di memori beberapa menit supaya klik berulang
// pada kartu yang sama tidak memanggil Plane lagi.
import { htmlKeTeks } from './kerja.ts'
import { ambilTiket, type TiketPlane } from './plane.ts'

export interface Pratinjau {
  key: string
  judul: string
  status: string
  prioritas: string
  url: string
  /** Deskripsi sebagai teks polos (paragraf dan butir dipertahankan); '' bila tiket tanpa deskripsi. */
  deskripsi: string
  /** true bila deskripsi dipotong (terlalu panjang untuk laci). */
  dipotong: boolean
}

export const UMUR_PRATINJAU_MS = 5 * 60_000
export const BATAS_DESKRIPSI = 4000

/** Satu tiket → pratinjau: HTML dibuang jadi teks, dipotong di batas karakter. */
export function susunPratinjau(t: TiketPlane): Pratinjau {
  const teks = htmlKeTeks(t.deskripsiHtml)
  const dipotong = teks.length > BATAS_DESKRIPSI
  return {
    key: t.key,
    judul: t.judul,
    status: t.status,
    prioritas: t.prioritas,
    url: t.url,
    deskripsi: dipotong ? `${teks.slice(0, BATAS_DESKRIPSI).trimEnd()}…` : teks,
    dipotong,
  }
}

const simpanan = new Map<string, { at: number; data: Pratinjau }>()

/** Pratinjau dengan cache memori. `ambil` dan `kini` bisa diganti untuk tes. */
export async function pratinjauTiket(
  key: string,
  { ambil = ambilTiket, kini = Date.now(), segarkan = false } = {},
): Promise<Pratinjau> {
  const ada = simpanan.get(key)
  if (!segarkan && ada && kini - ada.at < UMUR_PRATINJAU_MS) return ada.data
  const data = susunPratinjau(await ambil(key))
  simpanan.set(key, { at: kini, data })
  return data
}

export const kosongkanPratinjau = () => simpanan.clear()

// "Butuh kamu" (docs/RANCANGAN-KERJA-V2.md R-5.2, R-6.4): apa yang menunggu Tams pada satu kerja,
// beserta satu tombol aksi utama. Bila yang dibutuhkan adalah AI, tombolnya menjalankan fase
// berikut. Fungsi murni: masukannya kerja.json + hasil gerbang catatan.
import type { PeriksaCatatan } from './catatan.ts'
import type { Kerja } from './kerja.ts'
import type { FaseSesi } from './sesi.ts'

export type AksiButuh =
  | { jenis: 'buka'; label: string }
  | { jenis: 'terminal'; label: string }
  | { jenis: 'fase'; label: string; fase: FaseSesi }

export interface ButuhKamu {
  key: string
  judul: string
  /** Kenapa tiket ini menunggu Tams (satu kalimat). */
  alasan: string
  /** Titik sentuh rancangan bila relevan: A setujui rencana, B review hasil, C serah. */
  titik?: 'A' | 'B' | 'C'
  aksi: AksiButuh
}

export function butuhKamu(
  k: Kerja,
  periksa: { brief: PeriksaCatatan; akhir: PeriksaCatatan },
): ButuhKamu | null {
  const dasar = { key: k.key, judul: k.judul }
  if (k.tahap === 'selesai' || k.ditunda) return null
  const tanya = k.pertanyaan.filter((p) => !p.jawaban).length
  if (tanya)
    return {
      ...dasar,
      alasan: `${tanya} pertanyaan menunggu jawabanmu`,
      aksi: { jenis: 'buka', label: 'Jawab' },
    }
  const s = k.sesi
  if (s?.status === 'bekerja') return null
  if (s?.status === 'menunggu')
    return {
      ...dasar,
      alasan: s.pesan ?? 'Claude menunggu kamu',
      aksi:
        s.mode === 'terminal'
          ? { jenis: 'terminal', label: 'Buka terminal' }
          : { jenis: 'buka', label: 'Lihat hasil' },
    }
  const awal = k.tahap === 'diambil' || k.tahap === 'dipelajari'
  if (awal && !periksa.brief.ok)
    return {
      ...dasar,
      alasan: 'Brief belum ada: jalankan fase Pahami',
      aksi: { jenis: 'fase', label: 'Jalankan Pahami', fase: 'pahami' },
    }
  if (awal)
    return {
      ...dasar,
      titik: 'A',
      alasan: 'Brief siap: setujui rencana',
      aksi: { jenis: 'fase', label: 'Setujui & Kerjakan', fase: 'kerjakan' },
    }
  if ((k.tahap === 'dikerjakan' || k.tahap === 'diverifikasi') && !periksa.akhir.ok)
    return {
      ...dasar,
      alasan: `Catatan akhir belum lengkap (${periksa.akhir.masalah.length} masalah): lanjutkan Kerjakan`,
      aksi: { jenis: 'fase', label: 'Lanjutkan Kerjakan', fase: 'kerjakan' },
    }
  if (k.tahap === 'diverifikasi' || (k.tahap === 'dikerjakan' && periksa.akhir.ok))
    return {
      ...dasar,
      titik: 'B',
      alasan: 'Hasil siap direview',
      aksi: { jenis: 'buka', label: 'Review' },
    }
  return null
}

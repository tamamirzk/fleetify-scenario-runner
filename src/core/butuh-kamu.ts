// Lajur Dashboard (docs/RANCANGAN-KERJA-V2.md R-5.2, R-6.4, R-9.1): tiap kerja ditempatkan di satu
// lajur — Butuh kamu (dengan satu aksi utama), AI sedang jalan, Menunggu pihak lain, Antre,
// Ditunda, atau Selesai. Fungsi murni: masukannya kerja.json + hasil gerbang catatan.
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
  /** Titik sentuh rancangan bila relevan: A setujui rencana, B review hasil, C serah, D staging. */
  titik?: 'A' | 'B' | 'C' | 'D'
  aksi: AksiButuh
}

export type Lajur = 'butuh' | 'ai' | 'pihak-lain' | 'antre' | 'ditunda' | 'selesai' | 'diam'

export interface PosisiLajur {
  lajur: Lajur
  key: string
  judul: string
  alasan: string
  butuh?: ButuhKamu
}

type Periksa = { brief: PeriksaCatatan; akhir: PeriksaCatatan }

export function butuhKamu(k: Kerja, periksa: Periksa): ButuhKamu | null {
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
  // Sesudah push: buat MR (C); setelah MR di-merge ke development, kirim Plane Code Complete (D).
  // Deploy dan cek staging tugas tim lain (K19).
  if (k.push) {
    if (k.merge)
      return {
        ...dasar,
        titik: 'D',
        alasan:
          'MR sudah di-merge ke development: ubah status Plane ke Code Complete lalu tandai selesai',
        aksi: { jenis: 'buka', label: 'Plane' },
      }
    if (!k.mr)
      return {
        ...dasar,
        titik: 'C',
        alasan: `Sudah di-push ke ${k.push.branch}: buat MR di GitLab lalu tempel link-nya`,
        aksi: { jenis: 'buka', label: 'Salin deskripsi MR' },
      }
    return null // MR menunggu review/merge: lajur pihak lain
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
  if (k.tahap === 'didokumentasikan' && k.commit.length) {
    const ci = k.gerbang?.ci
    return ci && ci.hasil !== 'gagal'
      ? {
          ...dasar,
          titik: 'C',
          alasan: `Gerbang CI ${ci.hasil}: push dari kartu Serahkan`,
          aksi: { jenis: 'buka', label: 'Push' },
        }
      : {
          ...dasar,
          titik: 'C',
          alasan: ci
            ? 'Gerbang CI gagal: jalankan fase Serahkan'
            : 'Siap diserahkan: merge development dan gerbang CI',
          aksi: { jenis: 'fase', label: 'Jalankan Serahkan', fase: 'serahkan' },
        }
  }
  return null
}

/** Lajur sebuah kerja untuk Dashboard. */
export function lajurKerja(k: Kerja, periksa: Periksa): PosisiLajur {
  const dasar = { key: k.key, judul: k.judul }
  if (k.tahap === 'selesai') return { ...dasar, lajur: 'selesai', alasan: 'Selesai' }
  if (k.ditunda) return { ...dasar, lajur: 'ditunda', alasan: k.ditunda.alasan ?? 'Ditunda' }
  const b = butuhKamu(k, periksa)
  if (b) return { ...dasar, lajur: 'butuh', alasan: b.alasan, butuh: b }
  if (k.sesi?.status === 'bekerja')
    return { ...dasar, lajur: 'ai', alasan: `Claude: ${k.sesi.fase} (${k.sesi.mode})` }
  if (k.push)
    return {
      ...dasar,
      lajur: 'pihak-lain',
      alasan: k.mr ? 'MR menunggu review/merge ke development' : 'Menunggu MR dibuat',
    }
  if (k.antre && !k.slot) return { ...dasar, lajur: 'antre', alasan: 'Menunggu slot kosong' }
  return { ...dasar, lajur: 'diam', alasan: 'Tidak ada langkah berikutnya yang jelas' }
}

import type { StepInfo } from './scenarios.ts'

export type RunStatus =
  | 'idle'
  | 'menyiapkan'
  | 'siap'
  | 'berjalan'
  | 'jeda'
  | 'selesai'
  | 'gagal'
  | 'dihentikan'
  | 'dibatalkan'

export type StepStatus = 'menunggu' | 'berjalan' | 'lulus' | 'gagal' | 'dihentikan' | 'dilompati'
export type AksiStatus = 'menunggu' | 'berjalan' | 'selesai' | 'gagal' | 'dihentikan'

export interface AksiResult {
  teks: string
  status: AksiStatus
  ms: number | null
}

export interface StepResult extends StepInfo {
  status: StepStatus
  ms: number | null
  error: string | null
  shot: string | null
  notes?: string[]
  aksi: AksiResult[]
  /** Pemeriksaan DB setelah langkah ini (docs/PEMERIKSAAN.md). */
  db?: DbLangkah
}

export const JENIS_TEMUAN = ['bug', 'skenario', 'catatan'] as const
export type JenisTemuan = (typeof JENIS_TEMUAN)[number]
export const LABEL_TEMUAN: Record<JenisTemuan, string> = {
  bug: 'Bug aplikasi',
  skenario: 'Skenario salah',
  catatan: 'Catatan',
}

export interface Finding {
  at: string
  jenis: JenisTemuan
  step_n: number | null
  step: string | null
  aksi: string | null
  persona: string | null
  url: string | null
  note: string
  /** Nama berkas di folder jalan. */
  screenshot: string | null
}

export type StatusPemeriksaan = 'lulus' | 'pelanggaran' | 'tidak_dikonfigurasi' | 'galat'

/** Satu invarian dengan baris pelanggarannya (baru, atau sudah ada sebelum skenario). */
export interface ItemPemeriksaan {
  id: string
  judul: string
  keterangan: string
  baris: Record<string, unknown>[]
  /** Langkah (1-based) tempat pelanggaran pertama muncul; 0 = sebelum langkah pertama (siapkan). */
  langkah?: number
  /** Langkah tempat pelanggaran hilang lagi (sementara: tidak konsisten di tengah rangkaian transaksi). */
  sembuh?: number
}

/** Perubahan kolom satu baris dokumen antara snapshot langkah sebelumnya dan langkah ini. */
export interface DiffDokumen {
  label: string
  tabel: string
  /** `dibuat` = baris baru muncul, `dihapus` = hilang, `berubah` = kolom berbeda. */
  jenis: 'dibuat' | 'dihapus' | 'berubah'
  perubahan: { kolom: string; dari: unknown; ke: unknown }[]
}

export type StatusDbLangkah = 'memeriksa' | 'ok' | 'pelanggaran' | 'galat' | 'dilewati'

/** Hasil Pemeriksaan untuk satu langkah (snapshot setelah langkah selesai). */
export interface DbLangkah {
  status: StatusDbLangkah
  /** Pelanggaran yang pertama muncul di langkah ini. */
  pelanggaran: ItemPemeriksaan[]
  /** Pelanggaran dari langkah sebelumnya yang hilang di langkah ini. */
  sembuh: ItemPemeriksaan[]
  dokumen: DiffDokumen[]
  galat: { id: string; pesan: string }[]
  durasiMs: number | null
}

/** Hasil lapisan Pemeriksaan (docs/PEMERIKSAAN.md): baseline sebelum siapkan vs akhir sebelum bersihkan. */
export interface HasilPemeriksaan {
  status: StatusPemeriksaan
  /** Pelanggaran yang ada di akhir tapi tidak di baseline. */
  baru: ItemPemeriksaan[]
  /** Pelanggaran yang sudah ada di baseline (data seed), bukan akibat skenario. */
  sudahAda: ItemPemeriksaan[]
  /** Invarian yang dilewati: dinonaktifkan skenario, atau tabelnya tidak ada di DB ini. */
  dilewati: { id: string; judul: string; alasan: string }[]
  /** Invarian yang SQL-nya gagal dijalankan. */
  galat: { id: string; judul: string; pesan: string }[]
  /** Jumlah invarian yang benar-benar dinilai. */
  diperiksa: number
  durasiMs: number
  /** Jumlah snapshot (baseline + per langkah) dan rata-rata lamanya. */
  snapshot?: { jumlah: number; rataMs: number }
  /** Database yang diperiksa (host:port/nama, tanpa kredensial), atau pesan bila tidak dikonfigurasi/galat. */
  pesan?: string
}

export interface RunResult {
  run_id: string
  scenario: string
  task: string
  path: string
  title: string
  estimasi: string
  /** Waktu ubah berkas JSON saat jalan dimulai. */
  file_mtime: string
  headed: boolean
  status: RunStatus
  started_at: string | null
  ended_at: string | null
  duration_ms: number | null
  from_step: number
  data_from: string | null
  current_step: number | null
  current_aksi: number | null
  last_shot: string | null
  error: string | null
  cleanup_error?: string
  trace?: string
  steps: StepResult[]
  findings: Finding[]
  pemeriksaan?: HasilPemeriksaan
}

import type { HasilPernyataan, PerubahanTabel } from '../pemeriksaan/jejak.ts'
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
  /** Pemeriksaan UI setelah langkah ini (docs/PEMERIKSAAN.md, bagian UI). */
  ui?: UiLangkah
  /** Request tulis (POST/PUT/PATCH/DELETE ke /api/v1) selama langkah ini, urut waktu. */
  requests?: RequestTulis[]
  /** Hasil pemeriksaan UI terstruktur langkah ini. */
  cek?: HasilCek[]
}

// ── Pemeriksaan UI terstruktur ─────────────────────────────────────────
export type JenisCek = 'terlihat' | 'tidak_terlihat' | 'nonaktif' | 'nilai' | 'manual' | 'langkah'

/** Hasil satu cek UI. `lulus: null` = tidak diperiksa otomatis (hanya teks "Harus terlihat"). */
export interface HasilCek {
  /** "<langkah>.<urut>", mis. 5.2; "<langkah>.0" untuk Harus terlihat tanpa cek otomatis. */
  id: string
  langkah: number
  jenis: JenisCek
  /** `cek` = field cek langkah; `aksi` = aksi pastikan* di langkah; `harus_terlihat`/`langkah` = sintetis. */
  sumber: 'cek' | 'aksi' | 'harus_terlihat' | 'langkah'
  judul: string
  diharapkan: string
  terlihat: string | null
  lulus: boolean | null
  lunak?: boolean
  /** Uraian teknis asli bila sasaran memakai id/selector (mis. "Periksa #mr-berhasil terlihat"). */
  teknis?: string
  /** Screenshot di folder jalan saat cek dinilai (gagal: screenshot khusus; lulus: akhir langkah). */
  screenshot: string | null
  /** Kotak elemen yang dinilai, relatif screenshot (0–1); null bila elemen tidak ditemukan. */
  bbox: { x: number; y: number; w: number; h: number } | null
  waktu: string
}

// ── Request tulis per langkah ────────────────────────────────────────────────
export interface RequestTulis {
  method: string
  /** Path untuk tampilan: UUID diganti `{id}`. */
  path: string
  /** Path asli (dengan UUID). */
  pathAsli: string
  status: number
  durasiMs: number | null
  /** Waktu selesai (ISO). */
  waktu: string
  /** `browser` = dari jendela skenario; `api` = aksi pustaka lewat klien API (di belakang layar). */
  sumber: 'browser' | 'api'
}

// ── Pemeriksaan UI ───────────────────────────────────────────────────────────
/** Satu pelanggaran statis dari check:design (berkas relatif terhadap Frontend/). */
export interface PelanggaranStatis {
  file: string
  line: number
  col: number
  rule: string
  message: string
  /** Satu baris kode pada posisi itu, bila terbaca. */
  cuplikan?: string
}

/** Pelanggaran statis dikelompokkan per (berkas, aturan) — satuan yang dipakai baseline. */
export interface KelompokStatis {
  file: string
  rule: string
  /** Pasal DESIGN.md yang dirujuk aturan. */
  pasal: string
  /** Jumlah pelanggaran saat ini dan jumlah di baseline. */
  jumlah: number
  baseline: number
  /** Kelebihan terhadap baseline (0 = semua sudah ada). */
  baru: number
  /** Semua baris pelanggaran untuk pasangan ini (baseline tidak menyimpan posisi). */
  baris: PelanggaranStatis[]
  /** Langkah tempat pertama muncul (ringkasan akhir). */
  langkah?: number
}

export interface TemuanDom {
  aturan: string
  pesan: string
  /** tag + kelas utama + teks ≤ 30 huruf. */
  selector: string
  bbox: { x: number; y: number; w: number; h: number }
  nilai: string
  /** Jumlah elemen serupa yang dilipat ke temuan ini (dedup per aturan, nilai, kelas). */
  jumlah: number
}

export type StatusUiLangkah =
  | 'memeriksa'
  | 'ok'
  | 'peringatan'
  | 'pelanggaran'
  | 'galat'
  | 'dilewati'
  | 'tidak_dikonfigurasi'

/** Hasil Pemeriksaan UI untuk satu langkah. `peringatan` = hanya temuan DOM; `pelanggaran` = ada statis baru. */
export interface UiLangkah {
  status: StatusUiLangkah
  url: string | null
  /** Pola rute dari PAGE_TABLE dan berkas halaman, bila cocok. */
  pattern: string | null
  page: string | null
  statis: {
    berkas: number
    baru: KelompokStatis[]
    sudahAda: KelompokStatis[]
    durasiMs: number
    /** Hasil dipakai ulang dari langkah lain dengan pola rute yang sama. */
    cache: boolean
  } | null
  dom: {
    temuan: TemuanDom[]
    /** Lama evaluasi di dalam halaman. */
    evalMs: number
    /** Lama seluruh pemeriksaan DOM termasuk screenshot bersorot. */
    durasiMs: number
    /** Jumlah elemen yang dinilai. */
    elemen: number
    terpotong: boolean
  } | null
  /** Screenshot langkah dengan kotak merah di temuan DOM. */
  shotUi: string | null
  galat: string[]
}

export type StatusPemeriksaanUi =
  | 'lulus'
  | 'peringatan'
  | 'pelanggaran'
  | 'tidak_dikonfigurasi'
  | 'galat'

export interface HasilPemeriksaanUi {
  status: StatusPemeriksaanUi
  /** Kelompok (berkas, aturan) yang jumlahnya melebihi baseline, dengan langkah pertama muncul. */
  baru: KelompokStatis[]
  /** Kelompok yang jumlahnya ≤ baseline (dilipat di panel). */
  sudahAda: KelompokStatis[]
  /** Ringkasan temuan DOM: per aturan, jumlah total dan langkah yang memuatnya. */
  dom: { aturan: string; jumlah: number; langkah: number[] }[]
  statis: { jumlah: number; rataMs: number; cache: number }
  /** Halaman yang dilewati karena `pemeriksaanUi.abaikanHalaman`. */
  dilewati: { langkah: number; url: string }[]
  galat: { langkah: number; pesan: string }[]
  domWaktu: { jumlah: number; rataEvalMs: number; rataMs: number }
  durasiMs: number
  pesan?: string
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

export type StatusPemeriksaan =
  | 'lulus'
  | 'pelanggaran'
  | 'tidak_dikonfigurasi'
  | 'dilewati'
  | 'galat'

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
  /** Jejak baris tenant (company_id): perubahan sejak snapshot sebelumnya. */
  perubahan?: PerubahanTabel[]
  /** Pernyataan data langkah ini. */
  pernyataan?: HasilPernyataan[]
  /** Waktu snapshot diambil (ISO). */
  waktu?: string
}

/** Perubahan data sebelum langkah pertama yang diputar: Siapkan (lewat API) atau Capai. */
export interface PraLangkah {
  label: 'Siapkan' | 'Capai'
  requests: RequestTulis[]
  db?: DbLangkah
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
  /** Alasan jejak baris (Transaksi database) tidak dicatat di jalan ini, mis. melewati batas baris. */
  jejakMati?: string
}

export interface RunResult {
  run_id: string
  scenario: string
  task: string
  /** Tenant persona jalan ini (slug, mis. mbl) dan origin web v2 lokal. */
  sasaran?: { web: string; tenant: string }
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
  /** Waktu screenshot terakhir diambil (ISO). */
  last_shot_at?: string | null
  /** Tampilan aplikasi yang dipakai (ukuran layar + skala) dan viewport CSS yang dihasilkan. */
  tampilan?: {
    ukuran: { w: number; h: number }
    skala: number
    viewport: { width: number; height: number }
  }
  error: string | null
  cleanup_error?: string
  trace?: string
  steps: StepResult[]
  /** Siapkan/Capai: request tulis dan jejak baris sebelum langkah pertama. */
  pra?: PraLangkah[]
  findings: Finding[]
  pemeriksaan?: HasilPemeriksaan
  pemeriksaanUi?: HasilPemeriksaanUi
  /** Laporan gabungan Markdown di folder jalan (laporan.md), ditulis di akhir jalan. */
  laporan?: string
}

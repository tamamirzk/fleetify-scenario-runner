// Data layar Laporan dari satu result.json: hasil cek UI per langkah, transaksi database (jejak baris
// per langkah + request tulis + pernyataan data), silang UI ↔ data, dan ringkasan. Murni, diuji Vitest;
// dipakai server (GET /api/runs/<id> → `laporan_data`) dan laporan.md.
import type { HasilPernyataan, Operasi, PerubahanTabel } from '../pemeriksaan/jejak.ts'
import type { DbLangkah, HasilCek, RequestTulis, RunResult, StepResult } from './run-types.ts'

/**
 * Satu "transaksi" laporan = perubahan data satu langkah (atau Siapkan/Capai) menurut jejak baris,
 * digabung dengan request tulis langkah itu. Status COMMIT/ROLLBACK tidak diketahui dari jejak baris,
 * jadi yang ditampilkan adalah request (jumlah + kelas status HTTP terburuk).
 */
export interface Transaksi {
  no: number
  waktu: string | null
  /** Nomor langkah; null untuk Siapkan/Capai. */
  langkah: number | null
  label: string
  /** layar = hanya request dari jendela; api = hanya aksi pustaka; layar+api; sistem = baris berubah
   * tanpa request tulis; tanpa = tidak ada request maupun baris berubah (hanya pernyataan data). */
  sumber: 'layar' | 'api' | 'layar+api' | 'sistem' | 'tanpa'
  tabel: string[]
  operasi: Operasi[]
  baris: number
  request: { jumlah: number; terburuk: '2xx' | '3xx' | '4xx' | '5xx' | null }
  requests: RequestTulis[]
  pernyataan: { cocok: number; total: number }
  hasilPernyataan: HasilPernyataan[]
  perubahan: PerubahanTabel[]
}

export type Silang =
  | 'data_benar_tampilan_salah'
  | 'tampilan_sesuai_data_salah'
  | 'data_dan_tampilan_salah'
  | null

export const TEKS_SILANG: Record<Exclude<Silang, null>, string> = {
  data_benar_tampilan_salah: 'Data benar, tampilan salah',
  tampilan_sesuai_data_salah: 'Tampilan sesuai, data salah',
  data_dan_tampilan_salah: 'Data dan tampilan salah',
}

export type StatusHasilLangkah =
  | 'lulus'
  | 'gagal'
  | 'peringatan'
  | 'tidak_diperiksa'
  | 'menunggu'
  | 'dilewati'
  | 'dihentikan'

export interface HasilUiLangkah {
  n: number
  judul: string
  status: StatusHasilLangkah
  /** Cek otomatis yang lulus / dinilai (cek tanpa penilaian otomatis tidak dihitung). */
  lulus: number
  total: number
  /** Nomor transaksi langkah ini (jejak baris), bila ada. */
  transaksi: number | null
  silang: Silang
}

export interface DataLaporan {
  cek: HasilCek[]
  langkah: HasilUiLangkah[]
  transaksi: Transaksi[]
  /** `tersedia` = jejak baris terbaca; selain itu alasan (dilewati, tidak dikonfigurasi, galat). */
  db: {
    status: 'tersedia' | 'dilewati' | 'tidak_dikonfigurasi' | 'galat'
    pesan: string | null
  }
  /** Jumlah baris berubah per tabel di seluruh jalan. */
  tabel: { tabel: string; baris: number }[]
  ringkasan: {
    hasil: RunResult['status']
    /** `lunak` = cek lunak yang tidak terpenuhi (tidak menggagalkan langkah). */
    ui: { lulus: number; total: number; gagal: number; lunak: number }
    db: { transaksi: number; baris: number; cocok: number; total: number }
    temuan: number
    durasiMs: number | null
    /** Teks silang utama (langkah pertama yang bertentangan), mis. "Data benar, tampilan salah". */
    silang: { langkah: number; jenis: Exclude<Silang, null>; teks: string } | null
  }
}

const kelasHttp = (s: number) => (s >= 500 ? '5xx' : s >= 400 ? '4xx' : s >= 300 ? '3xx' : '2xx')
const URUT_HTTP = ['2xx', '3xx', '4xx', '5xx'] as const

export function sumberTransaksi(
  requests: readonly RequestTulis[],
  pra: boolean,
  baris = 1,
): Transaksi['sumber'] {
  const layar = requests.some((r) => r.sumber === 'browser')
  const api = requests.some((r) => r.sumber === 'api')
  if (layar && api) return 'layar+api'
  if (layar) return 'layar'
  if (api || pra) return 'api'
  return baris > 0 ? 'sistem' : 'tanpa'
}

function transaksiDari(
  db: DbLangkah | undefined,
  requests: readonly RequestTulis[],
  o: { langkah: number | null; label: string; pra: boolean },
): Omit<Transaksi, 'no'> | null {
  const perubahan = db?.perubahan ?? []
  const pernyataan = db?.pernyataan ?? []
  if (!perubahan.length && !requests.length && !pernyataan.length) return null
  const ops = new Set<Operasi>()
  for (const t of perubahan) {
    if (t.insert) ops.add('INSERT')
    if (t.update) ops.add('UPDATE')
    if (t.delete) ops.add('DELETE')
  }
  const kelas = requests.map((r) => kelasHttp(r.status))
  return {
    waktu: db?.waktu ?? requests.at(-1)?.waktu ?? null,
    langkah: o.langkah,
    label: o.label,
    sumber: sumberTransaksi(
      requests,
      o.pra,
      perubahan.reduce((a, t) => a + t.baris.length, 0),
    ),
    tabel: perubahan.map((t) => t.tabel),
    operasi: (['INSERT', 'UPDATE', 'DELETE'] as const).filter((x) => ops.has(x)),
    baris: perubahan.reduce((a, t) => a + t.baris.length, 0),
    request: {
      jumlah: requests.length,
      terburuk: kelas.length ? (URUT_HTTP.filter((k) => kelas.includes(k)).at(-1) ?? null) : null,
    },
    requests: [...requests],
    pernyataan: { cocok: pernyataan.filter((p) => p.lulus).length, total: pernyataan.length },
    hasilPernyataan: pernyataan,
    perubahan,
  }
}

/**
 * Silang UI ↔ data satu langkah. "Data salah" = ada pernyataan data yang gagal atau pelanggaran invarian
 * baru di langkah itu; "data benar" butuh minimal satu pernyataan data dan semuanya lulus (tanpa
 * pernyataan, kebenaran data tidak diketahui → tidak ada silang).
 */
export function silangLangkah(s: StepResult): Silang {
  const uiGagal = (s.cek ?? []).some((c) => c.lulus === false && !c.lunak && c.jenis !== 'langkah')
  const uiLulus = (s.cek ?? []).some((c) => c.lulus === true) && !uiGagal
  const p = s.db?.pernyataan ?? []
  const dataSalah = p.some((x) => !x.lulus) || (s.db?.pelanggaran.length ?? 0) > 0
  const dataBenar = p.length > 0 && !dataSalah
  if (uiGagal && dataBenar) return 'data_benar_tampilan_salah'
  if (uiGagal && dataSalah) return 'data_dan_tampilan_salah'
  if (uiLulus && dataSalah) return 'tampilan_sesuai_data_salah'
  return null
}

const dinilai = (c: HasilCek) => c.lulus !== null

/** Status hasil satu langkah: cek gagal (bukan lunak) atau langkah gagal = gagal; cek lunak gagal = peringatan. */
export function statusHasil(s: StepResult): StatusHasilLangkah {
  const cek = s.cek ?? []
  if (s.status === 'gagal' || cek.some((c) => c.lulus === false && !c.lunak)) return 'gagal'
  if (cek.some((c) => c.lulus === false)) return 'peringatan'
  if (s.status === 'lulus') return cek.some(dinilai) ? 'lulus' : 'tidak_diperiksa'
  if (s.status === 'dilompati') return 'dilewati'
  if (s.status === 'dihentikan') return 'dihentikan'
  return 'menunggu'
}

function statusDb(r: RunResult): DataLaporan['db'] {
  const p = r.pemeriksaan
  if (p?.status === 'dilewati')
    return { status: 'dilewati', pesan: p.pesan ?? 'Pemeriksaan DB dilewati di jalan ini.' }
  if (p?.jejakMati)
    return { status: 'galat', pesan: `Transaksi database tidak dicatat: ${p.jejakMati}` }
  if (p?.status === 'tidak_dikonfigurasi')
    return { status: 'tidak_dikonfigurasi', pesan: p.pesan ?? 'Alamat DB lokal tidak diisi.' }
  const adaJejak = [...(r.pra ?? []).map((x) => x.db), ...r.steps.map((s) => s.db)].some(
    (d) => d?.perubahan !== undefined,
  )
  if (!adaJejak && p?.status === 'galat') return { status: 'galat', pesan: p.pesan ?? null }
  if (!adaJejak && !p)
    return { status: 'tidak_dikonfigurasi', pesan: 'Jalan ini tanpa Pemeriksaan DB.' }
  return { status: 'tersedia', pesan: null }
}

export function susunDataLaporan(r: RunResult): DataLaporan {
  const cek = r.steps.flatMap((s) => s.cek ?? [])
  const transaksi: Transaksi[] = []
  const tambah = (t: Omit<Transaksi, 'no'> | null) => {
    if (!t) return null
    const x = { ...t, no: transaksi.length + 1 }
    transaksi.push(x)
    return x.no
  }
  for (const p of r.pra ?? [])
    tambah(transaksiDari(p.db, p.requests, { langkah: null, label: p.label, pra: true }))
  const noLangkah = new Map<number, number | null>()
  for (const s of r.steps)
    noLangkah.set(
      s.n,
      tambah(
        transaksiDari(s.db, s.requests ?? [], { langkah: s.n, label: String(s.n), pra: false }),
      ),
    )
  const langkah = r.steps.map((s) => {
    const c = (s.cek ?? []).filter(dinilai)
    return {
      n: s.n,
      judul: s.title,
      status: statusHasil(s),
      lulus: c.filter((x) => x.lulus).length,
      total: c.length,
      transaksi: noLangkah.get(s.n) ?? null,
      silang: silangLangkah(s),
    }
  })
  const nilai = cek.filter(dinilai)
  const perTabel = new Map<string, number>()
  for (const t of transaksi)
    for (const p of t.perubahan)
      perTabel.set(p.tabel, (perTabel.get(p.tabel) ?? 0) + p.baris.length)
  const pernyataan = transaksi.flatMap((t) => t.hasilPernyataan)
  const s0 = langkah.find((l) => l.silang)
  return {
    cek,
    langkah,
    transaksi,
    db: statusDb(r),
    tabel: [...perTabel].map(([tabel, baris]) => ({ tabel, baris })),
    ringkasan: {
      hasil: r.status,
      ui: {
        lulus: nilai.filter((c) => c.lulus).length,
        total: nilai.length,
        gagal: nilai.filter((c) => c.lulus === false).length,
        lunak: nilai.filter((c) => c.lulus === false && c.lunak).length,
      },
      db: {
        transaksi: transaksi.length,
        baris: transaksi.reduce((a, t) => a + t.baris, 0),
        cocok: pernyataan.filter((p) => p.lulus).length,
        total: pernyataan.length,
      },
      temuan: r.findings.length,
      durasiMs: r.duration_ms,
      silang: s0?.silang ? { langkah: s0.n, jenis: s0.silang, teks: TEKS_SILANG[s0.silang] } : null,
    },
  }
}

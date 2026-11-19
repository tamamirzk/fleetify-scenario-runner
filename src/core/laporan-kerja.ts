// Laporan Kerja format 2 (docs/KERJA.md "Format laporan v2"): lima kartu berisi BUTIR YANG HANYA
// DITAMBAH (Masalah, Temuan, Keputusan, Yang dilakukan, Hasil). Tidak ada edit atau hapus butir:
// koreksi = butir baru yang menunjuk butir lama, dan butir lama tampil dicoret. Pengganti catatan.md
// untuk kerja yang dibuat sesudah fitur ini (kerja.json `format: 2`). Modul ini murni; penyimpanan
// ada di kerja-aksi.ts. (Bukan laporan.ts: itu laporan gabungan jalan skenario.)
import type { Keputusan, PeriksaCatatan } from './catatan.ts'

export const JENIS_TEMUAN = ['penyebab', 'sampingan', 'risiko', 'data-uji'] as const
export type JenisTemuan = (typeof JENIS_TEMUAN)[number]
export type Penulis = 'ai' | 'tams'

/** Butir umum: nomor urut per kartu, waktu, penulis, teks, dan (bila koreksi) nomor butir lama. */
export interface Butir {
  id: number
  at: string
  oleh: Penulis
  teks: string
  koreksi?: number
}
export interface Temuan extends Butir {
  jenis: JenisTemuan
  /** Teks panjang (tutorial uji / rincian data), hanya untuk data-uji; dibuka-tutup di panel. */
  rinci?: string
}
export interface Dilakukan extends Butir {
  /** Butir rencana (diisi di Pahami), tampil berlabel "Rencana". */
  rencana?: true
  /** SHA pendek commit yang memuat perubahan ini; ditautkan ke tab Kode. */
  commit?: string
}
export interface Masalah {
  ringkas: string
  penyebab?: string
  diubah_at: string
}
export interface BarisTabel {
  dilaporkan: string
  sebelum: string
  sesudah: string
  bukti: string
}
export interface Hasil {
  penyelesaian: string
  /** Kerja belum selesai: tampil berlabel "Sejauh ini". */
  sementara?: true
  belumDicakup?: string[]
  tabel?: BarisTabel[]
  disetujui?: { oleh: string; at: string }
  diubah_at: string
}

/** Bagian laporan format 2 di kerja.json (keputusan memakai kolom `keputusan` yang sudah ada). */
export interface LaporanKerja {
  masalah?: Masalah
  temuan: Temuan[]
  dilakukan: Dilakukan[]
  hasil?: Hasil
}
export const LAPORAN_KOSONG: LaporanKerja = { temuan: [], dilakukan: [] }

/** Laporan + keputusan + verifikasi: masukan render markdown (panen, deskripsi MR, --render). */
export interface LaporanLengkap extends LaporanKerja {
  keputusan: Keputusan[]
  verifikasi: { kriteria: string; hasil: string; bukti?: string }[]
}

const kini = () => new Date().toISOString()
const idBaru = (xs: { id: number }[]) => xs.reduce((m, x) => Math.max(m, x.id), 0) + 1
const bersih = (s: string | undefined) => (s ?? '').trim()

/** Nomor butir yang sudah dikoreksi (tampil dicoret). */
export const dicoret = (xs: { id: number; koreksi?: number }[]): Set<number> =>
  new Set(xs.flatMap((x) => (x.koreksi ? [x.koreksi] : [])))

/** Butir yang masih berlaku (belum dikoreksi). */
export const aktif = <T extends { id: number; koreksi?: number }>(xs: T[]): T[] => {
  const c = dicoret(xs)
  return xs.filter((x) => !c.has(x.id))
}

/** Koreksi harus menunjuk butir lain yang ada di kartu yang sama dan belum pernah dikoreksi. */
function periksaKoreksi(xs: { id: number; koreksi?: number }[], koreksi: number | undefined) {
  if (koreksi === undefined) return
  if (!Number.isInteger(koreksi) || koreksi < 1) throw new Error('--koreksi harus nomor butir')
  if (!xs.some((x) => x.id === koreksi)) throw new Error(`Butir #${koreksi} tidak ada di kartu ini`)
  if (dicoret(xs).has(koreksi)) throw new Error(`Butir #${koreksi} sudah dikoreksi`)
}

function dasar(
  xs: { id: number; koreksi?: number }[],
  teks: string,
  oleh: Penulis,
  koreksi?: number,
) {
  const t = bersih(teks)
  if (!t) throw new Error('Teks butir tidak boleh kosong')
  periksaKoreksi(xs, koreksi)
  const b: Butir = { id: idBaru(xs), at: kini(), oleh, teks: t }
  if (koreksi !== undefined) b.koreksi = koreksi
  return b
}

export function tambahTemuan(
  l: LaporanKerja,
  o: { teks: string; jenis: string; rinci?: string; koreksi?: number; oleh?: Penulis },
): LaporanKerja {
  if (!(JENIS_TEMUAN as readonly string[]).includes(o.jenis))
    throw new Error(`Jenis temuan: ${JENIS_TEMUAN.join(' | ')}`)
  const t: Temuan = {
    ...dasar(l.temuan, o.teks, o.oleh ?? 'ai', o.koreksi),
    jenis: o.jenis as JenisTemuan,
  }
  if (bersih(o.rinci)) {
    if (t.jenis !== 'data-uji') throw new Error('--rinci hanya untuk temuan jenis data-uji')
    t.rinci = bersih(o.rinci)
  }
  return { ...l, temuan: [...l.temuan, t] }
}

export function tambahDilakukan(
  l: LaporanKerja,
  o: { teks: string; rencana?: boolean; commit?: string; koreksi?: number; oleh?: Penulis },
): LaporanKerja {
  const d: Dilakukan = { ...dasar(l.dilakukan, o.teks, o.oleh ?? 'ai', o.koreksi) }
  if (o.rencana) d.rencana = true
  const sha = bersih(o.commit)
  if (sha) {
    if (!/^[0-9a-f]{7,40}$/i.test(sha)) throw new Error('--commit harus SHA git (7-40 heksa)')
    d.commit = sha.slice(0, 8)
  }
  return { ...l, dilakukan: [...l.dilakukan, d] }
}

/** Mengganti Masalah (satu blok, bukan daftar). `diganti` = ada blok lama yang ditimpa (catat riwayat). */
export function setMasalah(
  l: LaporanKerja,
  ringkas: string,
  penyebab?: string,
): { laporan: LaporanKerja; diganti: boolean } {
  const r = bersih(ringkas)
  if (!r) throw new Error('Ringkasan masalah tidak boleh kosong')
  // Tanpa --penyebab, penyebab lama dipertahankan; ringkasan saja yang diganti.
  const p = bersih(penyebab) || l.masalah?.penyebab
  const masalah: Masalah = { ringkas: r, ...(p ? { penyebab: p } : {}), diubah_at: kini() }
  return { laporan: { ...l, masalah }, diganti: !!l.masalah }
}

export function setHasil(
  l: LaporanKerja,
  o: {
    penyelesaian: string
    sementara?: boolean
    belum?: string[]
    tabel?: unknown
  },
): LaporanKerja {
  const p = bersih(o.penyelesaian)
  if (!p) throw new Error('Penyelesaian tidak boleh kosong')
  const hasil: Hasil = { penyelesaian: p, diubah_at: kini() }
  if (o.sementara) hasil.sementara = true
  const belum = (o.belum ?? []).map(bersih).filter(Boolean)
  if (belum.length) hasil.belumDicakup = belum
  // Persetujuan Tams menempel pada hasil yang disetujui; hasil yang ditulis ulang perlu disetujui lagi.
  const tabel = o.tabel === undefined ? l.hasil?.tabel : bacaTabel(o.tabel)
  if (tabel?.length) hasil.tabel = tabel
  return { ...l, hasil }
}

/** Tabel sebelum/sesudah dari JSON: larik {dilaporkan, sebelum, sesudah, bukti}, semua teks. */
export function bacaTabel(x: unknown): BarisTabel[] {
  if (!Array.isArray(x))
    throw new Error('Tabel harus larik JSON {dilaporkan, sebelum, sesudah, bukti}')
  return x.map((r, i) => {
    const o = (r ?? {}) as Record<string, unknown>
    const baris: Record<string, string> = {}
    for (const k of ['dilaporkan', 'sebelum', 'sesudah', 'bukti']) {
      if (typeof o[k] !== 'string') throw new Error(`Tabel baris ${i + 1}: "${k}" harus teks`)
      baris[k] = (o[k] as string).trim()
    }
    return baris as unknown as BarisTabel
  })
}

/** Persetujuan Tams atas Hasil (◆B). Tanpa hasil tertulis tidak ada yang disetujui. */
export function setujuiHasil(l: LaporanKerja, oleh = 'tams'): LaporanKerja {
  if (!l.hasil?.penyelesaian) throw new Error('Hasil belum ditulis: belum ada yang bisa disetujui')
  return { ...l, hasil: { ...l.hasil, disetujui: { oleh, at: kini() } } }
}

// ── Gerbang ────────────────────────────────────────────────────────────────

/**
 * Gerbang format 2. brief: Masalah.ringkas terisi + minimal satu temuan penyebab + minimal satu
 * butir dilakukan ber-rencana. akhir: Hasil.penyelesaian terisi dan tidak sementara; pertanyaan
 * atau minta-ubah terbuka dan kriteria yang belum dicek tetap menahan (sama dengan format lama).
 */
export function periksaLaporan(
  k: LaporanKerja & {
    pertanyaan: { jawaban: string | null }[]
    mintaUbah: { selesai: string | null }[]
    verifikasi: { hasil: string }[]
  },
  saat: 'brief' | 'akhir',
): PeriksaCatatan {
  const m: string[] = []
  if (saat === 'brief') {
    if (!bersih(k.masalah?.ringkas))
      m.push('Masalah belum ditulis (bun run kerja masalah KEY "ringkas" --penyebab "…")')
    if (!aktif(k.temuan).some((t) => t.jenis === 'penyebab'))
      m.push('belum ada temuan penyebab (kerja temuan KEY "…" --jenis penyebab)')
    if (!aktif(k.dilakukan).some((d) => d.rencana))
      m.push('belum ada butir rencana (kerja lakukan KEY "…" --rencana)')
  } else {
    if (!bersih(k.hasil?.penyelesaian))
      m.push('Hasil belum ditulis (kerja hasil KEY "penyelesaian")')
    else if (k.hasil?.sementara)
      m.push('Hasil masih "Sejauh ini": tulis ulang penyelesaian tanpa --sementara')
    const belum = k.verifikasi.filter((v) => v.hasil === 'belum').length
    if (belum) m.push(`${belum} kriteria belum dicek`)
    const tanya = k.pertanyaan.filter((p) => !p.jawaban).length
    if (tanya) m.push(`${tanya} pertanyaan belum dijawab`)
    const ubah = k.mintaUbah.filter((x) => !x.selesai).length
    if (ubah) m.push(`${ubah} permintaan ubah belum selesai`)
  }
  return { ok: !m.length, masalah: m }
}

// ── Markdown (panen, deskripsi MR, kerja catatan --render) ─────────────────

const tglPendek = (iso: string) =>
  new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short' })

const butirMd = (b: Butir, awalan = '') =>
  `- ${awalan}${b.teks}${b.koreksi ? ` _(mengoreksi #${b.koreksi})_` : ''}`
const tanpaCoret = <T extends { id: number; koreksi?: number }>(xs: T[]) => aktif(xs)

const LABEL_JENIS: Record<JenisTemuan, string> = {
  penyebab: 'Penyebab',
  sampingan: 'Sampingan',
  risiko: 'Risiko',
  'data-uji': 'Data uji',
}

/** Status satu baris untuk Hasil: kriteria x/y. */
export const ringkasKriteria = (v: { hasil: string }[]) =>
  `kriteria ${v.filter((x) => x.hasil === 'lulus').length}/${v.length} lulus`

/**
 * Lima bagian markdown laporan format 2 (butir yang sudah dikoreksi dibuang; tiap bagian kosong
 * dilewati). `judul` = tingkat judul (## untuk panen, ** untuk deskripsi MR).
 */
export function bagianLaporanMd(
  l: LaporanLengkap,
  o: { tinjauAi?: string; kepala?: (j: string) => string } = {},
): [string, string][] {
  const kepala = o.kepala ?? ((j: string) => j)
  const masalah = l.masalah
    ? [l.masalah.ringkas, l.masalah.penyebab ? `**Penyebab:** ${l.masalah.penyebab}` : '']
        .filter(Boolean)
        .join('\n\n')
    : ''
  const temuan = tanpaCoret(l.temuan)
    .map((t) => butirMd(t, `**${LABEL_JENIS[t.jenis]}.** `))
    .join('\n')
  const keputusan = l.keputusan
    .map(
      (k) =>
        `- ${k.apa}${k.alasan ? ` — ${k.alasan}` : ''}${k.oleh === 'ai' ? ` _(${o.tinjauAi ?? 'diambil AI, ditinjau Tams'})_` : ''}`,
    )
    .join('\n')
  const dilakukan = tanpaCoret(l.dilakukan)
    .map((d) => butirMd(d, d.rencana ? '_Rencana._ ' : '') + (d.commit ? ` (\`${d.commit}\`)` : ''))
    .join('\n')
  const h = l.hasil
  const hasil = h
    ? [
        `**${h.sementara ? 'Sejauh ini' : 'Penyelesaian'}.** ${h.penyelesaian}`,
        h.belumDicakup?.length
          ? `**Belum dicakup**\n\n${h.belumDicakup.map((x) => `- ${x}`).join('\n')}`
          : '',
        h.tabel?.length
          ? `| Dilaporkan | Sebelum | Sesudah | Bukti |\n|---|---|---|---|\n${h.tabel
              .map(
                (r) =>
                  `| ${[r.dilaporkan, r.sebelum, r.sesudah, r.bukti].map(selMd).join(' | ')} |`,
              )
              .join('\n')}`
          : '',
        l.verifikasi.length
          ? `${ringkasKriteria(l.verifikasi)}:\n\n${l.verifikasi
              .map(
                (v) =>
                  `- ${v.hasil === 'lulus' ? '✓' : v.hasil === 'gagal' ? '×' : '○'} ${v.kriteria}`,
              )
              .join('\n')}`
          : '',
        h.disetujui ? `_Disetujui ${h.disetujui.oleh}, ${tglPendek(h.disetujui.at)}._` : '',
      ]
        .filter(Boolean)
        .join('\n\n')
    : ''
  return (
    [
      ['Masalah', masalah],
      ['Temuan', temuan],
      ['Keputusan', keputusan],
      ['Yang dilakukan', dilakukan],
      ['Hasil', hasil],
    ] as [string, string][]
  )
    .filter(([, isi]) => isi.trim())
    .map(([j, isi]) => [kepala(j), isi.trim()])
}

const selMd = (s: string) => s.replace(/\|/g, '\\|').replace(/\n+/g, ' ')

/** Seluruh laporan sebagai markdown (`kerja catatan KEY --render` untuk kerja format 2). */
export const renderLaporanMd = (key: string, l: LaporanLengkap): string =>
  `${[`# ${key} · Laporan`, ...bagianLaporanMd(l, { kepala: (j) => `## ${j}` }).map(([j, i]) => `${j}\n\n${i}`)].join('\n\n')}\n`

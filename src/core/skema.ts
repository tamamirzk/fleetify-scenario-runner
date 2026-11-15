// Skema berkas skenario JSON (scenarios/<modul>/<slug>.json). Dokumentasi: docs/SKEMA-SKENARIO.md.
// Skema ini memeriksa bentuk; nama dan argumen aksi pustaka diperiksa terpisah (pustaka/index.ts).
import { z } from 'zod'
import { INVARIAN_IDS } from '../pemeriksaan/invarian.ts'
import { ATURAN_DOM } from '../pemeriksaan/ui-dom.ts'
import { ATURAN_STATIS } from '../pemeriksaan/ui-statis.ts'
import { PERSONA_IDS } from './personas.ts'

export const MODUL = ['material', 'approval', 'wo', 'pb', 'akses', 'lingkungan'] as const

const kalimat = z.string().trim().min(3)
const kebab = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'huruf kecil, angka, dan tanda hubung')
const persona = z.enum(PERSONA_IDS)
const ms = z.number().int().min(0).max(60_000)
/** Kunci data (`simpan`); dirujuk lewat placeholder {kunci.sub}. */
const kunci = z.string().regex(/^[a-z_][a-z0-9_]*$/i, 'huruf, angka, dan garis bawah')

/** Teks biasa (cocok sebagian, tanpa beda huruf besar) atau pola "/regex/flags". */
export const Teks = z.string().min(1)

export interface Sasaran {
  tombol?: string
  tautan?: string
  label?: string
  teks?: string
  combobox?: string
  kotakCentang?: string
  opsi?: string
  placeholder?: string
  peran?: string
  nama?: string
  dialog?: string | true
  baris?: string
  blok?: string | string[]
  kartuPersetujuan?: true
  dalam?: Sasaran
  persis?: boolean
  ke?: number | 'terakhir'
}

export const JENIS_SASARAN = [
  'tombol',
  'tautan',
  'label',
  'teks',
  'combobox',
  'kotakCentang',
  'opsi',
  'placeholder',
  'peran',
  'dialog',
  'baris',
  'blok',
  'kartuPersetujuan',
] as const

export const SasaranSchema: z.ZodType<Sasaran> = z.lazy(() =>
  z
    .object({
      tombol: Teks.optional(),
      tautan: Teks.optional(),
      label: Teks.optional(),
      teks: Teks.optional(),
      combobox: Teks.optional(),
      kotakCentang: Teks.optional(),
      opsi: Teks.optional(),
      placeholder: Teks.optional(),
      peran: z
        .string()
        .regex(/^[a-z]+$/, 'peran ARIA, mis. textbox')
        .optional(),
      nama: Teks.optional(),
      dialog: z.union([Teks, z.literal(true)]).optional(),
      baris: Teks.optional(),
      blok: z.union([Teks, z.array(Teks).min(1)]).optional(),
      kartuPersetujuan: z.literal(true).optional(),
      dalam: SasaranSchema.optional(),
      persis: z.boolean().optional(),
      ke: z.union([z.number().int().min(0), z.literal('terakhir')]).optional(),
    })
    .strict()
    .superRefine((s, ctx) => {
      const jenis = JENIS_SASARAN.filter((k) => s[k] !== undefined)
      if (jenis.length !== 1)
        ctx.addIssue({
          code: 'custom',
          message: `sasaran harus punya tepat satu dari: ${JENIS_SASARAN.join(', ')} (dapat ${jenis.join(', ') || 'tidak ada'})`,
        })
      if (s.nama !== undefined && s.peran === undefined)
        ctx.addIssue({ code: 'custom', message: '"nama" hanya dipakai bersama "peran"' })
    }),
)

/** `pastikanTerlihat: "teks"` sama dengan `{ teks: "teks" }`. */
const TeksAtauSasaran = z.union([Teks, SasaranSchema])
const opsional = z.boolean().optional()
const lunak = z.boolean().optional()
const batas = z.number().int().min(100).max(120_000).optional()

const aksiDasar = {
  buka: z.object({ buka: z.string().startsWith('/', 'rute diawali "/"') }).strict(),
  banner: z.object({ banner: kalimat, tahan: ms.optional() }).strict(),
  tahan: z.object({ tahan: ms }).strict(),
  klik: z
    .object({
      klik: SasaranSchema,
      tahan: ms.optional(),
      opsional,
      tangkap: z
        .object({
          url: Teks,
          metode: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).optional(),
          simpan: z.record(kunci, z.string().min(1)),
        })
        .strict()
        .optional(),
    })
    .strict(),
  isi: z.object({ isi: SasaranSchema, nilai: z.string(), tahan: ms.optional(), opsional }).strict(),
  pilih: z.object({ pilih: SasaranSchema, opsi: Teks, tahan: ms.optional() }).strict(),
  cari: z.object({ cari: SasaranSchema, ketik: z.string().min(1), opsi: Teks }).strict(),
  tunggu: z
    .object({ tunggu: SasaranSchema, hilang: z.boolean().optional(), batas, opsional })
    .strict(),
  tungguUrl: z.object({ tungguUrl: Teks, batas, opsional }).strict(),
  gulir: z.object({ gulir: SasaranSchema, opsional }).strict(),
  pastikanTerlihat: z.object({ pastikanTerlihat: TeksAtauSasaran, lunak, batas }).strict(),
  pastikanTidakTerlihat: z.object({ pastikanTidakTerlihat: TeksAtauSasaran, lunak }).strict(),
  pastikanNonaktif: z.object({ pastikanNonaktif: SasaranSchema, lunak }).strict(),
  sebagai: z.object({ sebagai: persona }).strict(),
  screenshot: z.object({ screenshot: kebab }).strict(),
  simpan: z
    .object({ simpan: kunci, dariUrl: Teks.optional(), dariTeks: Teks.optional(), batas })
    .strict()
    .refine((a) => (a.dariUrl === undefined) !== (a.dariTeks === undefined), {
      message: 'isi tepat satu dari dariUrl atau dariTeks',
    }),
  dokumen: z
    .object({
      dokumen: z.object({ label: kalimat, nomor: z.string().min(1), url: z.string() }).strict(),
    })
    .strict(),
}

/** Aksi pustaka: `{ "api": "nama", ...argumen, "simpan"?: "kunci" }`. Argumen diperiksa pustaka. */
const pustaka = (key: 'api' | 'layar' | 'siapkan') =>
  z.object({ [key]: kebab, simpan: kunci.optional() }).catchall(z.unknown())

export const JENIS_AKSI = [...Object.keys(aksiDasar), 'api', 'layar', 'siapkan'] as const
export type JenisAksi = keyof typeof aksiDasar | 'api' | 'layar' | 'siapkan'

/** Pilih skema berdasar kunci pertama yang dikenal, supaya pesan galat menunjuk aksi yang dimaksud. */
function aksiSchema(boleh: readonly JenisAksi[]) {
  const map: Record<string, z.ZodType> = {
    ...aksiDasar,
    api: pustaka('api'),
    layar: pustaka('layar'),
    siapkan: pustaka('siapkan'),
  }
  return z.custom<Record<string, unknown>>().superRefine((raw, ctx) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      ctx.addIssue({ code: 'custom', message: 'aksi harus berupa objek' })
      return
    }
    const jenis = cariJenis(raw)
    if (!jenis) {
      ctx.addIssue({
        code: 'custom',
        message: `aksi tidak dikenal (kunci: ${Object.keys(raw).join(', ')}); pakai salah satu: ${boleh.join(', ')}`,
      })
      return
    }
    if (!boleh.includes(jenis as JenisAksi)) {
      ctx.addIssue({
        code: 'custom',
        message: `aksi "${jenis}" tidak boleh di sini; yang boleh: ${boleh.join(', ')}`,
      })
      return
    }
    const r = (map[jenis] as z.ZodType).safeParse(raw)
    if (!r.success)
      for (const i of r.error.issues)
        ctx.addIssue({ code: 'custom', path: i.path, message: `${jenis}: ${i.message}` })
  })
}

const AKSI_LANGKAH = JENIS_AKSI.filter((k) => k !== 'siapkan') as JenisAksi[]
export const AksiSchema = aksiSchema(AKSI_LANGKAH)
const AksiApiSchema = aksiSchema(['api', 'dokumen'])
const AksiSiapkanSchema = aksiSchema(['siapkan', 'dokumen'])

export type Aksi = Record<string, unknown>

/**
 * Pemeriksaan UI terstruktur, dijalankan sesudah aksi langkah selesai. Tepat satu dari
 * `terlihat`, `tidakTerlihat`, atau `nilai` (+ `diharapkan`: teks elemen sama persis tanpa beda huruf
 * besar/spasi, atau pola "/regex/"). Gagal = langkah gagal, kecuali `lunak` (tercatat, jalan lanjut).
 */
export const CekSchema = z
  .object({
    id: z
      .string()
      .regex(/^\d+\.\d+$/, 'nomor cek "<langkah>.<urut>", mis. 5.2')
      .optional(),
    judul: kalimat.optional(),
    terlihat: TeksAtauSasaran.optional(),
    tidakTerlihat: TeksAtauSasaran.optional(),
    nilai: SasaranSchema.optional(),
    diharapkan: z.string().min(1).optional(),
    lunak,
    batas,
  })
  .strict()
  .superRefine((c, ctx) => {
    const jenis = (['terlihat', 'tidakTerlihat', 'nilai'] as const).filter(
      (k) => c[k] !== undefined,
    )
    if (jenis.length !== 1)
      ctx.addIssue({
        code: 'custom',
        message: `cek harus punya tepat satu dari terlihat, tidakTerlihat, nilai (dapat ${jenis.join(', ') || 'tidak ada'})`,
      })
    if ((c.nilai !== undefined) !== (c.diharapkan !== undefined))
      ctx.addIssue({
        code: 'custom',
        message: '"diharapkan" wajib bersama "nilai" (dan hanya dengannya)',
      })
  })
export type Cek = z.infer<typeof CekSchema>

const namaSql = z
  .string()
  .regex(/^[a-z_][a-z0-9_]*$/, 'nama tabel/kolom SQL huruf kecil, mis. stock_balances')

/**
 * Pernyataan data (v2, opsional): dinilai di snapshot DB baca-saja sesudah langkah, dibatasi tenant
 * (company_id). Bentuk terstruktur (bukan SQL bebas): baris `tabel` yang `cocok` (kolom → nilai/placeholder), lalu
 * `kolom` + `diharapkan` (semua baris cocok harus bernilai itu) atau `jumlah` (banyak baris).
 */
export const PernyataanSchema = z
  .object({
    id: z
      .string()
      .regex(/^\d+\.d\d+$/, 'nomor pernyataan "<langkah>.d<urut>", mis. 5.d1')
      .optional(),
    judul: kalimat,
    tabel: namaSql,
    cocok: z
      .record(namaSql, z.union([z.string(), z.number(), z.boolean(), z.null()]))
      .refine((r) => Object.keys(r).length > 0, 'cocok minimal satu kolom'),
    kolom: namaSql.optional(),
    diharapkan: z.string().min(1).optional(),
    jumlah: z.number().int().min(0).optional(),
  })
  .strict()
  .superRefine((p, ctx) => {
    const nilai = p.kolom !== undefined || p.diharapkan !== undefined
    if (nilai === (p.jumlah !== undefined))
      ctx.addIssue({ code: 'custom', message: 'isi kolom + diharapkan, atau jumlah (salah satu)' })
    if (nilai && (p.kolom === undefined || p.diharapkan === undefined))
      ctx.addIssue({ code: 'custom', message: '"kolom" dan "diharapkan" harus berpasangan' })
  })
export type Pernyataan = z.infer<typeof PernyataanSchema>

export const LangkahSchema = z
  .object({
    id: kebab,
    judul: kalimat,
    /** Paragraf penjelasan langkah untuk kartu deskripsi runner: apa yang dilakukan dan dibuktikan. */
    deskripsi: z.string().trim().min(10).optional(),
    harusTerlihat: kalimat,
    sebagai: persona.optional(),
    diBelakangLayar: z.boolean().optional(),
    /** Aksi API yang membawa data ke awal langkah ini. Tanpa `capai`, langkah hanya bisa
     * dimulai dengan data jalan yang berhenti tepat sebelumnya. `[]` = data siapkan cukup. */
    capai: z.array(AksiApiSchema).optional(),
    aksi: z.array(AksiSchema).min(1),
    /** Pemeriksaan UI terstruktur sesudah aksi. Aksi pastikan* di `aksi` juga tercatat sebagai cek. */
    cek: z.array(CekSchema).min(1).optional(),
    /** Pernyataan data sesudah langkah: dicek di DB lokal baca-saja, dibatasi tenant. */
    pernyataanData: z.array(PernyataanSchema).min(1).optional(),
  })
  .strict()

export const SkenarioSchema = z
  .object({
    $schema: z.string().optional(),
    slug: kebab,
    judul: kalimat,
    tujuan: z.string().trim().min(20),
    modul: z.enum(MODUL),
    /** Tiket Plane tertaut (FMS-123); tautan = TICKET_URL + kunci. Tanpa sinkron Plane/Jira. */
    tiket: z.array(z.string().regex(/^[A-Z]+-\d+$/, 'format FMS-123')),
    /** Pemilik skenario, untuk filter Pemilik. */
    pemilik: z.string().trim().min(2).optional(),
    /** Status tertulis: `draf` atau `siap` (bawaan). `ada_kegagalan` dihitung dari jalan terakhir. */
    status: z.enum(['draf', 'siap']).optional(),
    estimasi: z.string().regex(/^\d+ menit$/, 'format "<n> menit"'),
    persona: z.array(z.object({ siapa: persona, peran: kalimat }).strict()).min(1),
    /** Uraian data yang disiapkan, untuk ringkasan. */
    data: z.array(kalimat).min(1),
    setelan: z.array(kalimat),
    setelanMenetap: z.string().trim().min(10).optional(),
    prasyarat: z.array(kalimat),
    catatan: z.array(kalimat),
    pengecualian: z
      .array(
        z.object({ aturan: z.enum(['db-lewat-api']), alasan: z.string().trim().min(20) }).strict(),
      )
      .optional(),
    siapkan: z.array(AksiSiapkanSchema),
    langkah: z.array(LangkahSchema).min(1),
    /** Aksi API yang selalu berjalan di akhir (juga saat gagal atau dihentikan). */
    bersihkan: z.array(AksiApiSchema).optional(),
    /** Invarian Pemeriksaan yang dimatikan untuk skenario ini (docs/PEMERIKSAAN.md), dengan alasan. */
    pemeriksaan: z
      .object({
        nonaktif: z.array(z.enum(INVARIAN_IDS)).min(1),
        alasan: z.string().trim().min(20),
      })
      .strict()
      .optional(),
    /** Pemeriksaan UI (docs/PEMERIKSAAN.md): aturan yang dimatikan dan halaman yang dilewati, dengan alasan. */
    pemeriksaanUi: z
      .object({
        nonaktif: z.array(z.enum([...ATURAN_STATIS, ...ATURAN_DOM])).optional(),
        /** Awalan pathname yang tidak diperiksa, mis. "/tires/used" (prototipe). */
        abaikanHalaman: z.array(z.string().regex(/^\/[^\s?#]*$/, 'pathname diawali /')).optional(),
        alasan: z.string().trim().min(20).optional(),
      })
      .strict()
      .superRefine((p, ctx) => {
        if ((p.nonaktif?.length || p.abaikanHalaman?.length) && !p.alasan)
          ctx.addIssue({
            code: 'custom',
            path: ['alasan'],
            message:
              'alasan wajib (min. 20 huruf) bila ada aturan yang dinonaktifkan atau halaman yang diabaikan',
          })
      })
      .optional(),
  })
  .strict()

export type Skenario = z.infer<typeof SkenarioSchema>
export type Langkah = z.infer<typeof LangkahSchema>

const PUSTAKA_KEYS = ['api', 'layar', 'siapkan'] as const

/** Jenis aksi: kunci pustaka (api/layar/siapkan) bila ada, karena argumen pustaka boleh
 * bernama sama dengan aksi lain (mis. "sebagai", "simpan"); selain itu kunci pertama yang dikenal. */
function cariJenis(a: object): JenisAksi | undefined {
  const keys = Object.keys(a)
  return (PUSTAKA_KEYS.find((k) => keys.includes(k)) ??
    keys.find((k) => (JENIS_AKSI as readonly string[]).includes(k))) as JenisAksi | undefined
}

export function jenisAksi(a: Aksi): JenisAksi {
  const k = cariJenis(a)
  if (!k) throw new Error(`Aksi tidak dikenal: ${JSON.stringify(a)}`)
  return k
}

export interface MasalahSkema {
  path: string
  message: string
}

export function formatPath(path: readonly PropertyKey[]): string {
  return path.reduce<string>(
    (s, p) => (typeof p === 'number' ? `${s}[${p}]` : s ? `${s}.${String(p)}` : String(p)),
    '',
  )
}

// Skema berkas skenario JSON (scenarios/<task>/<slug>.json). Dokumentasi: docs/SKEMA-SKENARIO.md.
// Skema ini memeriksa bentuk; nama dan argumen aksi pustaka diperiksa terpisah (pustaka/index.ts).
import { z } from 'zod'
import { INVARIAN_IDS } from '../pemeriksaan/invarian.ts'
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

export const LangkahSchema = z
  .object({
    id: kebab,
    judul: kalimat,
    harusTerlihat: kalimat,
    sebagai: persona.optional(),
    diBelakangLayar: z.boolean().optional(),
    /** Aksi API yang membawa data ke awal langkah ini. Tanpa `capai`, langkah hanya bisa
     * dimulai dengan data jalan yang berhenti tepat sebelumnya. `[]` = data siapkan cukup. */
    capai: z.array(AksiApiSchema).optional(),
    aksi: z.array(AksiSchema).min(1),
  })
  .strict()

export const SkenarioSchema = z
  .object({
    $schema: z.string().optional(),
    slug: kebab,
    judul: kalimat,
    tujuan: z.string().trim().min(20),
    modul: z.enum(MODUL),
    tiket: z.array(z.string().regex(/^[A-Z]+-\d+$/, 'format FMS-123')),
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

// Pemeriksaan berkas skenario JSON: skema, aksi pustaka, dan aturan standar. Dipakai panel
// (status skema, berkas tidak valid tidak bisa diputar), check:scenarios, dan tes. Murni.
import { KUNCI_PUSTAKA, PUSTAKA, periksaAksiPustaka } from '../pustaka/index.ts'
import { PERSONA_IDS } from './personas.ts'
import { rujukan } from './placeholder.ts'
import {
  type Aksi,
  formatPath,
  jenisAksi,
  type MasalahSkema,
  type Skenario,
  SkenarioSchema,
} from './skema.ts'

export interface Masalah extends MasalahSkema {
  aturan: string
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
/** Kunci data bawaan yang selalu ada. */
const BAWAAN = new Set(['docs', 'stempel'])
const PERSONA = new Set<string>(PERSONA_IDS)

export interface HasilPeriksa {
  skenario: Skenario | null
  masalah: Masalah[]
}

/** Baris (1-based) untuk posisi karakter, supaya galat JSON bisa ditunjuk. */
function barisDari(raw: string, pos: number) {
  return raw.slice(0, pos).split('\n').length
}

/** Semua string di dalam nilai (rekursif), untuk mencari nama persona di argumen pustaka. */
function semuaTeks(v: unknown): string[] {
  if (typeof v === 'string') return [v]
  if (Array.isArray(v)) return v.flatMap(semuaTeks)
  if (v && typeof v === 'object') return Object.values(v).flatMap(semuaTeks)
  return []
}

export function periksaSkenario(raw: string, { slug }: { slug: string }): HasilPeriksa {
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch (e) {
    const m = (e as Error).message
    const pos = Number(m.match(/position (\d+)/)?.[1])
    return {
      skenario: null,
      masalah: [
        {
          aturan: 'json',
          path: Number.isFinite(pos) ? `baris ${barisDari(raw, pos)}` : '',
          message: `JSON tidak sah: ${m}`,
        },
      ],
    }
  }
  const parsed = SkenarioSchema.safeParse(json)
  if (!parsed.success)
    return {
      skenario: null,
      masalah: parsed.error.issues.map((i) => ({
        aturan: 'skema',
        path: formatPath(i.path),
        message: i.message,
      })),
    }
  const s = parsed.data
  const masalah: Masalah[] = []
  const tambah = (aturan: string, path: string, message: string) =>
    masalah.push({ aturan, path, message })

  if (s.slug !== slug)
    tambah('satu-berkas', 'slug', `slug "${s.slug}" harus sama dengan nama berkas "${slug}"`)

  raw.split('\n').forEach((l, i) => {
    if (UUID.test(l))
      tambah(
        'tanpa-id-tertulis',
        `baris ${i + 1}`,
        'id dari DB tertentu; cari lewat aksi pustaka dan simpan ke data',
      )
  })

  if (s.setelan.length > 0 && !s.bersihkan?.length && !s.setelanMenetap)
    tambah(
      'setelan-dikembalikan',
      'setelan',
      'setelan terisi: kembalikan di "bersihkan", atau isi "setelanMenetap" dengan alasan',
    )

  const dideklarasi = new Set<string>(s.persona.map((p) => p.siapa))
  const pakaiDb: string[] = []
  const tersimpan = new Set(BAWAAN)

  const periksaAksi = (aksi: Aksi, path: string) => {
    const jenis = jenisAksi(aksi)
    if (jenis in KUNCI_PUSTAKA) {
      for (const m of periksaAksiPustaka(aksi, jenis as keyof typeof KUNCI_PUSTAKA, path))
        tambah('pustaka', m.path, m.message)
      if (PUSTAKA[String(aksi[jenis])]?.pengecualianDb)
        pakaiDb.push(`${path} (${String(aksi[jenis])})`)
      for (const v of new Set(semuaTeks(aksi)))
        if (PERSONA.has(v) && !dideklarasi.has(v))
          tambah('persona', path, `persona ${v} belum ada di "persona"`)
    }
    if (jenis === 'sebagai' && !dideklarasi.has(String(aksi.sebagai)))
      tambah('persona', path, `persona ${String(aksi.sebagai)} belum ada di "persona"`)
    for (const r of rujukan(aksi))
      if (!tersimpan.has(r))
        tambah(
          'data-ada',
          path,
          `{${r}} dirujuk sebelum disimpan (simpan dulu dengan "simpan": "${r}")`,
        )
    if (typeof aksi.simpan === 'string') tersimpan.add(aksi.simpan)
    const tangkap = aksi.tangkap as { simpan?: Record<string, string> } | undefined
    for (const k of Object.keys(tangkap?.simpan ?? {})) tersimpan.add(k)
  }

  s.siapkan.forEach((a, i) => {
    periksaAksi(a, `siapkan[${i}]`)
  })
  const ids = new Set<string>()
  s.langkah.forEach((l, i) => {
    const at = `langkah[${i}]`
    if (ids.has(l.id)) tambah('langkah', `${at}.id`, `id "${l.id}" ganda`)
    ids.add(l.id)
    if (l.sebagai && !dideklarasi.has(l.sebagai))
      tambah('persona', `${at}.sebagai`, `persona ${l.sebagai} belum ada di "persona"`)
    l.capai?.forEach((a, j) => {
      periksaAksi(a, `${at}.capai[${j}]`)
    })
    l.aksi.forEach((a, j) => {
      periksaAksi(a, `${at}.aksi[${j}]`)
    })
  })
  s.bersihkan?.forEach((a, i) => {
    periksaAksi(a, `bersihkan[${i}]`)
  })

  const izinDb = s.pengecualian?.some((p) => p.aturan === 'db-lewat-api')
  if (pakaiDb.length && !izinDb)
    for (const p of pakaiDb)
      tambah(
        'db-lewat-api',
        p,
        'aksi ini menyentuh DB/proses luar; isi "pengecualian" db-lewat-api dengan alasan yang disepakati tim',
      )

  return { skenario: masalah.length ? null : s, masalah }
}

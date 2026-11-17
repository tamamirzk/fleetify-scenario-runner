// Kerja: monitoring dan dokumentasi satu tugas Plane, dari diambil sampai selesai. Disimpan lokal di
// kerja/<KEY>/ (di-ignore git): kerja.json (keadaan + hasil verifikasi), tiket.md (salinan tiket),
// catatan.md (apa yang diminta, di mana fiturnya di v2, kriteria), sebelum/ dan sesudah/ (screenshot
// halaman + snapshot DB baca-saja). Alur dan perintahnya: docs/KERJA.md.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import type { CekStaging, DataCatatan, Keputusan, MintaUbah, Pertanyaan } from './catatan.ts'
import { ROOT } from './config.ts'
import type { HasilGerbang } from './gerbang.ts'
import { PERSONA_IDS } from './personas.ts'
import type { Sesi } from './sesi.ts'

export const KERJA_DIR = path.join(ROOT, 'kerja')

export const TAHAP = [
  'diambil',
  'dipelajari',
  'dikerjakan',
  'diverifikasi',
  'didokumentasikan',
  'selesai',
] as const
export type Tahap = (typeof TAHAP)[number]
export const LABEL_TAHAP: Record<Tahap, string> = {
  diambil: 'Diambil',
  dipelajari: 'Dipelajari',
  dikerjakan: 'Dikerjakan (AI)',
  diverifikasi: 'Diverifikasi',
  didokumentasikan: 'Didokumentasikan',
  selesai: 'Selesai',
}
/** Nama tahap alur lama (sebelum 16 Nov 2026); kerja.json lama dipetakan saat dibaca. */
const TAHAP_LAMA: Record<string, Tahap> = {
  rencana: 'dipelajari',
  dokumentasi: 'didokumentasikan',
}
const tahapBaru = (t: string): Tahap => TAHAP_LAMA[t] ?? (t as Tahap)

export const HASIL_CEK = ['lulus', 'gagal', 'belum'] as const
export type HasilCek = (typeof HASIL_CEK)[number]
/** Satu kriteria tiket dan hasil pengecekannya. */
export interface Cek {
  kriteria: string
  hasil: HasilCek
  bukti?: string
  at: string
}
export const FASE = ['sebelum', 'sesudah'] as const
export type Fase = (typeof FASE)[number]

const KUNCI = /^[A-Z]+-\d+$/

/** Sasaran potret: halaman (dibuka sebagai persona) dan query DB (SELECT, $1 = company_id tenant). */
export const TargetSchema = z
  .object({
    layar: z
      .array(
        z
          .object({
            nama: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'kebab-case'),
            sebagai: z.enum(PERSONA_IDS),
            rute: z.string().startsWith('/', 'rute diawali "/"'),
            keterangan: z.string().optional(),
          })
          .strict(),
      )
      .default([]),
    db: z
      .array(
        z
          .object({
            nama: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'kebab-case'),
            sql: z
              .string()
              .trim()
              .refine((q) => /^(select|with)\b/i.test(q), 'hanya SELECT atau WITH')
              .refine((q) => !q.replace(/;\s*$/, '').includes(';'), 'satu pernyataan saja'),
            keterangan: z.string().optional(),
          })
          .strict(),
      )
      .default([]),
  })
  .strict()
export type Target = z.infer<typeof TargetSchema>

export interface HasilLayar {
  nama: string
  sebagai: string
  rute: string
  file: string | null
  galat?: string
}
export interface HasilDb {
  nama: string
  file: string | null
  baris: number
  galat?: string
}
export interface Potret {
  at: string
  layar: HasilLayar[]
  db: HasilDb[]
}

export interface Kerja {
  key: string
  judul: string
  url: string
  plane: {
    id: string
    projectId: string
    status: string
    komentar_at?: string
    status_baru?: string
    status_at?: string
  }
  tahap: Tahap
  diambil_at: string
  diperbarui_at: string
  riwayat: { at: string; tahap: Tahap; catatan: string }[]
  /** Hasil verifikasi per kriteria tiket. */
  verifikasi: Cek[]
  /** Rujukan kode v2 (opsional): branch dan commit tempat fiturnya dibangun. */
  branch: string | null
  commit: string[]
  target: Target
  potret: Partial<Record<Fase, Potret>>
  skenario: string[]
  /** Worktree v2 tempat tiket ini dikerjakan (dipakai gerbang). Kosong = V2_REPO_DIR. */
  worktree?: string
  /** Hasil gerbang terakhir per tingkat (src/core/gerbang.ts). */
  gerbang?: Partial<Record<'fokus' | 'ci', HasilGerbang>>
  /** Bagian data catatan (src/core/catatan.ts): dirender ke catatan, tidak bisa basi (R-8.1). */
  keputusan: Keputusan[]
  pertanyaan: Pertanyaan[]
  mintaUbah: MintaUbah[]
  cekStaging: CekStaging[]
  /** Sesi Claude tiket ini (src/core/sesi.ts). */
  sesi?: Sesi
  /** Tiket disisihkan Tams: tidak muncul di "Butuh kamu" sampai diaktifkan lagi. */
  ditunda?: { at: string; alasan?: string }
  /** Push terakhir dari panel (R-2.3): Tams yang membuat MR di GitLab. */
  push?: { at: string; branch: string; head: string; remote: string | null; jumlah: number }
  /** Link MR yang ditempel Tams. */
  mr?: string
  /** Slot kerja paralel yang dipakai (1–3); kosong = tidak memegang slot (R-7.1). */
  slot?: number | null
  /** Tiket menunggu slot kosong (lajur Antre); urutan menurut waktu. */
  antre?: { at: string }
  /** Kunci tiket pemegang slot bila tiket ini gabung klaster (branch dan DB yang sama). */
  klaster?: string
  /** Modul docs-site V2 tempat catatan dipanen (slug process_key, mis. fleet). */
  modul?: string
}

export const dirKerja = (key: string) => {
  if (!KUNCI.test(key)) throw new Error(`Kunci tiket tidak sah: ${key} (format FMS-87)`)
  return path.join(KERJA_DIR, key)
}

export function adaKerja(key: string) {
  return existsSync(path.join(dirKerja(key), 'kerja.json'))
}

export function bacaKerja(key: string): Kerja {
  const f = path.join(dirKerja(key), 'kerja.json')
  if (!existsSync(f)) throw new Error(`${key} belum diambil (bun run kerja ambil ${key})`)
  return normalkanKerja(JSON.parse(readFileSync(f, 'utf8')))
}

/** Kerja dari berkas: tahap lama dipetakan ke alur monitoring, kolom baru diberi nilai awal. */
export function normalkanKerja(raw: Kerja): Kerja {
  return {
    ...raw,
    tahap: tahapBaru(raw.tahap),
    riwayat: raw.riwayat.map((r) => ({ ...r, tahap: tahapBaru(r.tahap) })),
    verifikasi: raw.verifikasi ?? [],
    branch: raw.branch ?? null,
    commit: raw.commit ?? [],
    keputusan: raw.keputusan ?? [],
    pertanyaan: raw.pertanyaan ?? [],
    mintaUbah: raw.mintaUbah ?? [],
    cekStaging: raw.cekStaging ?? [],
  }
}

/** Bagian data catatan sebuah kerja. */
export const dataCatatan = (k: Kerja): DataCatatan => ({
  keputusan: k.keputusan,
  pertanyaan: k.pertanyaan,
  mintaUbah: k.mintaUbah,
  cekStaging: k.cekStaging,
})

/** Catat hasil satu kriteria (kriteria yang sama ditimpa, tidak peka huruf besar). */
export function setCek(k: Kerja, kriteria: string, hasil: HasilCek, bukti = ''): Kerja {
  const nama = kriteria.trim()
  if (!nama) throw new Error('Kriteria tidak boleh kosong')
  if (!HASIL_CEK.includes(hasil)) throw new Error(`Hasil cek: ${HASIL_CEK.join(' | ')}`)
  const cek: Cek = { kriteria: nama, hasil, at: new Date().toISOString() }
  if (bukti.trim()) cek.bukti = bukti.trim()
  const i = k.verifikasi.findIndex((c) => c.kriteria.toLowerCase() === nama.toLowerCase())
  const verifikasi = [...k.verifikasi]
  if (i >= 0) verifikasi[i] = cek
  else verifikasi.push(cek)
  return { ...k, verifikasi }
}

/** Jumlah kriteria per hasil. */
export const ringkasCek = (v: Cek[]) => ({
  total: v.length,
  lulus: v.filter((c) => c.hasil === 'lulus').length,
  gagal: v.filter((c) => c.hasil === 'gagal').length,
  belum: v.filter((c) => c.hasil === 'belum').length,
})

export function simpanKerja(k: Kerja) {
  const d = dirKerja(k.key)
  mkdirSync(d, { recursive: true })
  k.diperbarui_at = new Date().toISOString()
  writeFileSync(path.join(d, 'kerja.json'), `${JSON.stringify(k, null, 2)}\n`)
}

/** Semua kerja, terbaru diperbarui dulu. */
export function daftarKerja(): Kerja[] {
  if (!existsSync(KERJA_DIR)) return []
  return readdirSync(KERJA_DIR)
    .filter((d) => KUNCI.test(d) && existsSync(path.join(KERJA_DIR, d, 'kerja.json')))
    .map((d) => bacaKerja(d))
    .sort((a, b) => b.diperbarui_at.localeCompare(a.diperbarui_at))
}

/** Teks dari HTML deskripsi Plane (paragraf, baris, butir) untuk tiket.md. */
export function htmlKeTeks(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*li[^>]*>/gi, '\n- ')
    .replace(/<\/\s*(p|div|h[1-6]|li|ul|ol|blockquote|pre)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Kerja baru dari tiket Plane (atau segarkan salinan tiket bila sudah ada). */
export function kerjaDariTiket(
  t: {
    key: string
    id: string
    projectId: string
    judul: string
    deskripsiHtml: string
    status: string
    url: string
  },
  ada: Kerja | null,
): { kerja: Kerja; tiketMd: string } {
  const now = new Date().toISOString()
  const kerja: Kerja = ada
    ? { ...ada, judul: t.judul, url: t.url, plane: { ...ada.plane, status: t.status } }
    : {
        key: t.key,
        judul: t.judul,
        url: t.url,
        plane: { id: t.id, projectId: t.projectId, status: t.status },
        tahap: 'diambil',
        diambil_at: now,
        diperbarui_at: now,
        riwayat: [
          { at: now, tahap: 'diambil', catatan: `Diambil dari Plane (status ${t.status})` },
        ],
        verifikasi: [],
        branch: null,
        commit: [],
        target: { layar: [], db: [] },
        potret: {},
        skenario: [],
        keputusan: [],
        pertanyaan: [],
        mintaUbah: [],
        cekStaging: [],
      }
  const tiketMd = `# ${t.key} · ${t.judul}\n\nStatus Plane: ${t.status} · ${t.url}\n\n${htmlKeTeks(t.deskripsiHtml) || '(tanpa deskripsi)'}\n`
  return { kerja, tiketMd }
}

/** Pindah tahap (boleh maju atau mundur) dengan catatan di riwayat. */
export function pindahTahap(k: Kerja, tahap: Tahap, catatan = ''): Kerja {
  if (!TAHAP.includes(tahap)) throw new Error(`Tahap tidak dikenal: ${tahap}`)
  return {
    ...k,
    tahap,
    riwayat: [...k.riwayat, { at: new Date().toISOString(), tahap, catatan }],
  }
}

/** Isi berkas kerja (tiket.md, catatan.md) bila ada. catatan.md dulu bernama rencana.md. */
export function bacaBerkasKerja(key: string, nama: 'tiket.md' | 'catatan.md'): string | null {
  const calon = nama === 'catatan.md' ? ['catatan.md', 'rencana.md'] : [nama]
  for (const n of calon) {
    const f = path.join(dirKerja(key), n)
    if (existsSync(f)) return readFileSync(f, 'utf8')
  }
  return null
}

type Baris = Record<string, unknown>

/**
 * Beda dua snapshot query: baris dikenali dari kolom `id` bila ada, selain itu dari isinya.
 * Hasil: ditambah (hanya sesudah), dihapus (hanya sebelum), berubah (id sama, isi beda) dan
 * kolom yang berubah.
 */
export function bedaBaris(sebelum: Baris[], sesudah: Baris[]) {
  // Tanpa kolom id, baris dikenali lewat kolom yang bukan angka (mis. jenis + status pada query
  // hitungan), supaya "jumlah 28 → 30" tampil sebagai perubahan, bukan baris hilang + baris baru.
  // Bila kombinasi itu tidak unik di salah satu sisi, seluruh isi baris yang dipakai.
  const identitas = (b: Baris) =>
    JSON.stringify(Object.entries(b).filter(([, v]) => typeof v !== 'number'))
  const unik = (rows: Baris[]) => new Set(rows.map(identitas)).size === rows.length
  const pakaiIdentitas = unik(sebelum) && unik(sesudah)
  const kunci = (b: Baris) =>
    b.id !== undefined
      ? `id:${String(b.id)}`
      : pakaiIdentitas
        ? `k:${identitas(b)}`
        : JSON.stringify(b)
  const a = new Map(sebelum.map((b) => [kunci(b), b]))
  const z2 = new Map(sesudah.map((b) => [kunci(b), b]))
  const ditambah = [...z2].filter(([k]) => !a.has(k)).map(([, b]) => b)
  const dihapus = [...a].filter(([k]) => !z2.has(k)).map(([, b]) => b)
  const berubah: { baris: Baris; lama: Baris; kolom: string[] }[] = []
  for (const [k, b] of z2) {
    const lama = a.get(k)
    if (!lama) continue
    const kolom = [...new Set([...Object.keys(lama), ...Object.keys(b)])].filter(
      (c) => JSON.stringify(lama[c]) !== JSON.stringify(b[c]),
    )
    if (kolom.length) berubah.push({ baris: b, lama, kolom })
  }
  return { ditambah, dihapus, berubah }
}

/**
 * Beda sebelum/sesudah satu query dalam bentuk "Perubahan data" laporan skenario (diffHtml):
 * UPDATE (kolom lama → baru, baris dikenali lewat id), INSERT (baris baru), DELETE (baris hilang).
 */
export function perubahanQuery(nama: string, sebelum: Baris[], sesudah: Baris[]) {
  const beda = bedaBaris(sebelum, sesudah)
  // Kunci yang dibaca orang: id, atau nilai kolom bukan-angka (mis. "KM · NORMAL").
  const kunci = (b: Baris) =>
    b.id !== undefined
      ? String(b.id)
      : Object.values(b)
          .filter((v) => typeof v !== 'number' && v !== null)
          .map(String)
          .join(' · ')
  const semua = (b: Baris, arah: 'dari' | 'ke') =>
    Object.entries(b).map(([kolom, v]) => ({
      kolom,
      dari: arah === 'dari' ? v : null,
      ke: arah === 'ke' ? v : null,
    }))
  const baris = [
    ...beda.berubah.map((x) => ({
      operasi: 'UPDATE' as const,
      kunci: kunci(x.baris),
      kolom: x.kolom.map((kolom) => ({
        kolom,
        dari: x.lama[kolom] ?? null,
        ke: x.baris[kolom] ?? null,
      })),
    })),
    ...beda.ditambah.map((b) => ({
      operasi: 'INSERT' as const,
      kunci: kunci(b),
      kolom: semua(b, 'ke'),
    })),
    ...beda.dihapus.map((b) => ({
      operasi: 'DELETE' as const,
      kunci: kunci(b),
      kolom: semua(b, 'dari'),
    })),
  ]
  // Tanpa kolom id, nama kolom kuncinya (kolom bukan-angka) ikut tampil di kepala tiap perubahan.
  const contoh = sesudah[0] ?? sebelum[0]
  const kunciKolom =
    contoh && contoh.id === undefined
      ? Object.entries(contoh)
          .filter(([, v]) => typeof v !== 'number' && v !== null)
          .map(([k]) => k)
      : undefined
  return baris.length ? [{ tabel: nama, baris, sembunyiTabel: true, kunciKolom }] : []
}

/** Ringkasan untuk dashboard: jumlah per tahap. */
export function hitungTahap(kerja: Pick<Kerja, 'tahap'>[]): Record<Tahap, number> {
  const out = Object.fromEntries(TAHAP.map((t) => [t, 0])) as Record<Tahap, number>
  for (const k of kerja) out[k.tahap]++
  return out
}

const escHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

/** Komentar Plane: hasil verifikasi per kriteria, potret, skenario, rujukan kode (HTML sederhana). */
export function komentarHtml(k: Kerja, catatan = ''): string {
  const p = (f: Fase) => {
    const x = k.potret[f]
    if (!x) return 'belum'
    const ok = x.layar.filter((l) => l.file).length
    const dbOk = x.db.filter((d) => d.file).length
    return `${ok} layar, ${dbOk} query DB (${new Date(x.at).toLocaleString('id-ID')})`
  }
  const li = (s: string) => `<li>${s}</li>`
  // Rujukan berkas lokal (mis. "(verifikasi/1-x.png)") tak bisa dibuka tim; dibuang dari komentar.
  const tanpaBerkasLokal = (s: string) => s.replace(/\s*\([^)]*\.(png|json)[^)]*\)/g, '')
  const r = ringkasCek(k.verifikasi)
  const tanda = { lulus: '✓', gagal: '×', belum: '○' } as const
  return [
    `<p><strong>Verifikasi Scenario Runner · ${escHtml(k.key)}</strong></p>`,
    catatan ? `<p>${escHtml(catatan)}</p>` : '',
    r.total
      ? `<p>Kriteria: ${r.lulus} lulus, ${r.gagal} gagal${r.belum ? `, ${r.belum} belum dicek` : ''}.</p><ul>${k.verifikasi
          .map((c) =>
            li(
              `${tanda[c.hasil]} ${escHtml(c.kriteria)}${c.bukti ? ` — ${escHtml(tanpaBerkasLokal(c.bukti))}` : ''}`,
            ),
          )
          .join('')}</ul>`
      : '<p>Belum ada kriteria yang dicek.</p>',
    '<ul>',
    li(`Tahap: ${escHtml(LABEL_TAHAP[k.tahap])}`),
    li(`Potret sebelum: ${escHtml(p('sebelum'))}`),
    li(`Potret sesudah: ${escHtml(p('sesudah'))}`),
    k.skenario.length
      ? li(`Skenario: ${k.skenario.map((s) => `<code>${escHtml(s)}</code>`).join(', ')}`)
      : '',
    k.branch || k.commit.length
      ? li(
          `Kode v2: ${[k.branch ? `<code>${escHtml(k.branch)}</code>` : '', ...k.commit.map((c) => `<code>${escHtml(c)}</code>`)].filter(Boolean).join(' · ')}`,
        )
      : '',
    '</ul>',
    '<p>Screenshot dan snapshot DB tersimpan lokal di Scenario Runner (kerja/).</p>',
  ]
    .filter(Boolean)
    .join('')
}

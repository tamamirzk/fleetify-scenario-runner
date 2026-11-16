// Kerja: satu tiket Plane yang sedang dikerjakan, dari diambil sampai selesai. Disimpan lokal di
// kerja/<KEY>/ (di-ignore git): kerja.json (keadaan), tiket.md (salinan tiket), rencana.md (ditulis AI),
// sebelum/ dan sesudah/ (screenshot halaman + snapshot DB baca-saja). Alur dan perintahnya: docs/KERJA.md.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { ROOT } from './config.ts'
import { PERSONA_IDS } from './personas.ts'

export const KERJA_DIR = path.join(ROOT, 'kerja')

export const TAHAP = ['diambil', 'rencana', 'dikerjakan', 'dokumentasi', 'selesai'] as const
export type Tahap = (typeof TAHAP)[number]
export const LABEL_TAHAP: Record<Tahap, string> = {
  diambil: 'Diambil',
  rencana: 'Rencana & sebelum',
  dikerjakan: 'Dikerjakan',
  dokumentasi: 'Sesudah & skenario',
  selesai: 'Selesai',
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
  branch: string | null
  commit: string[]
  target: Target
  potret: Partial<Record<Fase, Potret>>
  skenario: string[]
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
  return JSON.parse(readFileSync(f, 'utf8')) as Kerja
}

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
        branch: null,
        commit: [],
        target: { layar: [], db: [] },
        potret: {},
        skenario: [],
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

/** Isi berkas kerja (tiket.md, rencana.md) bila ada. */
export function bacaBerkasKerja(key: string, nama: 'tiket.md' | 'rencana.md'): string | null {
  const f = path.join(dirKerja(key), nama)
  return existsSync(f) ? readFileSync(f, 'utf8') : null
}

type Baris = Record<string, unknown>

/**
 * Beda dua snapshot query: baris dikenali dari kolom `id` bila ada, selain itu dari isinya.
 * Hasil: ditambah (hanya sesudah), dihapus (hanya sebelum), berubah (id sama, isi beda) dan
 * kolom yang berubah.
 */
export function bedaBaris(sebelum: Baris[], sesudah: Baris[]) {
  const kunci = (b: Baris) => (b.id !== undefined ? `id:${String(b.id)}` : JSON.stringify(b))
  const a = new Map(sebelum.map((b) => [kunci(b), b]))
  const z2 = new Map(sesudah.map((b) => [kunci(b), b]))
  const ditambah = [...z2].filter(([k]) => !a.has(k)).map(([, b]) => b)
  const dihapus = [...a].filter(([k]) => !z2.has(k)).map(([, b]) => b)
  const berubah: { baris: Baris; kolom: string[] }[] = []
  for (const [k, b] of z2) {
    const lama = a.get(k)
    if (!lama) continue
    const kolom = [...new Set([...Object.keys(lama), ...Object.keys(b)])].filter(
      (c) => JSON.stringify(lama[c]) !== JSON.stringify(b[c]),
    )
    if (kolom.length) berubah.push({ baris: b, kolom })
  }
  return { ditambah, dihapus, berubah }
}

/** Ringkasan untuk dashboard: jumlah per tahap. */
export function hitungTahap(kerja: Pick<Kerja, 'tahap'>[]): Record<Tahap, number> {
  const out = Object.fromEntries(TAHAP.map((t) => [t, 0])) as Record<Tahap, number>
  for (const k of kerja) out[k.tahap]++
  return out
}

const escHtml = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

/** Komentar Plane untuk tahap dokumentasi: ringkasan kerja, potret, skenario, commit (HTML sederhana). */
export function komentarHtml(k: Kerja, catatan = ''): string {
  const p = (f: Fase) => {
    const x = k.potret[f]
    if (!x) return 'belum'
    const ok = x.layar.filter((l) => l.file).length
    const dbOk = x.db.filter((d) => d.file).length
    return `${ok} layar, ${dbOk} query DB (${new Date(x.at).toLocaleString('id-ID')})`
  }
  const li = (s: string) => `<li>${s}</li>`
  return [
    `<p><strong>Dokumentasi Scenario Runner · ${escHtml(k.key)}</strong></p>`,
    catatan ? `<p>${escHtml(catatan)}</p>` : '',
    '<ul>',
    li(`Tahap: ${escHtml(LABEL_TAHAP[k.tahap])}`),
    k.branch ? li(`Branch v2: <code>${escHtml(k.branch)}</code>`) : '',
    k.commit.length
      ? li(`Commit: ${k.commit.map((c) => `<code>${escHtml(c)}</code>`).join(', ')}`)
      : '',
    li(`Potret sebelum: ${escHtml(p('sebelum'))}`),
    li(`Potret sesudah: ${escHtml(p('sesudah'))}`),
    li(
      `Skenario: ${k.skenario.length ? k.skenario.map((s) => `<code>${escHtml(s)}</code>`).join(', ') : 'belum ada'}`,
    ),
    '</ul>',
    '<p>Screenshot dan snapshot DB tersimpan lokal di Scenario Runner (kerja/).</p>',
  ]
    .filter(Boolean)
    .join('')
}

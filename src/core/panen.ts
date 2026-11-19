// Panen dokumentasi ke docs-site fleetify-ops (docs/RANCANGAN-KERJA-V2.md R-8.3). Saat Serahkan,
// catatan kerja dipanen ke `database/v2/<modul>/progres-plane/<kunci>.md` (preseden folder
// progres-plane) dan indeksnya; halaman modul yang dikurasi (alur.md, status.md) tidak disentuh.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { type DataCatatan, pecahCatatan } from './catatan.ts'
import { ROOT } from './config.ts'

/** Docs-site fleetify-ops (bersaudara dengan scenario-runner di ~/work/fleetify/). */
export const DOCS_SITE = path.resolve(ROOT, '..', 'fleetify-ops', 'docs-site')
export const DIR_V2 = path.join(DOCS_SITE, 'database', 'v2')

/** Modul V2 (slug = process_key, lihat components/v2-manifest.js) dan kata kunci tebakan. */
export const MODUL_V2: { slug: string; kunci: RegExp }[] = [
  { slug: 'fleet', kunci: /\b(fleet|armada|meter|odometer|hour ?meter|unit|aset|asset)\b/i },
  { slug: 'scheduled-maintenance', kunci: /\b(perawatan berkala|preventive|pm\b|scheduled)/i },
  {
    slug: 'breakdown-maintenance',
    kunci: /\b(breakdown|adhoc|insidentil|tiket kerusakan|diagnos)/i,
  },
  { slug: 'tyre-management', kunci: /\b(ban|tyre|tire)\b/i },
  { slug: 'work-order', kunci: /\b(work ?order|wo\b|workshop|order)/i },
  { slug: 'approval', kunci: /\b(approval|persetujuan)\b/i },
  { slug: 'workflow', kunci: /\b(workflow|alur kerja)\b/i },
]

/** Tebak modul dari judul + tiket.md; null bila tidak yakin (pengguna memilih dengan --modul). */
export function tebakModul(judul: string, tiket: string | null): string | null {
  const bagian = `${judul}\n${tiket ?? ''}`
  // Judul tiket MBL berpola "[MBL] Fleet - …": bagian sebelum tanda hubung paling menentukan.
  const awal = judul.replace(/^\[[^\]]+\]\s*/, '').split(' - ')[0] ?? ''
  for (const m of MODUL_V2) if (m.kunci.test(awal)) return m.slug
  const cocok = MODUL_V2.filter((m) => m.kunci.test(bagian))
  return cocok.length === 1 ? (cocok[0]?.slug ?? null) : null
}

const isiBagian = (md: string | null, jenis: string) =>
  pecahCatatan(md)
    .bagian.filter((b) => b.jenis === jenis)
    .map((b) => b.isi.replace(/<!--[\s\S]*?-->/g, '').trim())
    .filter(Boolean)
    .join('\n\n')

export interface SumberPanen {
  key: string
  judul: string
  url: string
  branch: string | null
  commit: string[]
  mr?: string
  tahap: string
  md: string | null
  data: DataCatatan
  verifikasi: { kriteria: string; hasil: string }[]
}

/** Isi berkas panen satu tiket (markdown docs-site). Murni; `tanggal` = YYYY-MM-DD. */
export function isiPanen(s: SumberPanen, tanggal: string): string {
  const meta = [
    // Kerja tanpa tiket Plane (mis. bug dari chat) tidak punya URL: jangan tulis tautan kosong.
    ['Tiket', s.url ? `[${s.key}](${s.url})` : `${s.key} (tanpa tiket Plane)`],
    ['Branch', s.branch ? `\`${s.branch}\`` : '—'],
    ['Commit', s.commit.length ? s.commit.map((c) => `\`${c.slice(0, 8)}\``).join(', ') : '—'],
    ['MR', s.mr ? `[${s.mr.replace(/^https?:\/\//, '')}](${s.mr})` : '—'],
    ['Tahap', s.tahap],
    ['Dipanen', `${tanggal} dari scenario-runner \`kerja/${s.key}/\``],
  ]
  const keputusan = [
    isiBagian(s.md, 'keputusan'),
    s.data.keputusan
      .map(
        (k) =>
          `- ${k.apa}${k.alasan ? ` — ${k.alasan}` : ''}${k.oleh === 'ai' ? ' _(diambil AI, ditinjau Tams)_' : ''}`,
      )
      .join('\n'),
  ]
    .filter(Boolean)
    .join('\n\n')
  const bagian: [string, string][] = [
    ['Masalah & penyebab', isiBagian(s.md, 'masalah')],
    ['Keputusan', keputusan],
    ['Yang dikerjakan', isiBagian(s.md, 'dikerjakan')],
    ['Perlu diperhatikan', isiBagian(s.md, 'perhatian')],
    [
      'Verifikasi (lokal)',
      s.verifikasi
        .map(
          (v) => `- ${v.hasil === 'lulus' ? '✓' : v.hasil === 'gagal' ? '×' : '○'} ${v.kriteria}`,
        )
        .join('\n'),
    ],
    [
      'Catatan untuk tim staging',
      s.data.cekStaging.map((c) => `- [${c.selesai ? 'x' : ' '}] ${c.teks}`).join('\n'),
    ],
  ]
  return `# ${s.key} · ${s.judul}

> Dipanen otomatis dari catatan kerja Scenario Runner. Sunting sumbernya (\`kerja/${s.key}/catatan.md\`
> dan \`kerja.json\`), lalu panen ulang: \`bun run kerja panen ${s.key} --tulis\`.

| | |
|---|---|
${meta.map(([k, v]) => `| ${k} | ${v} |`).join('\n')}

${bagian
  .filter(([, isi]) => isi.trim())
  .map(([j, isi]) => `## ${j}\n\n${isi.trim()}`)
  .join('\n\n')}
`
}

/** Indeks progres-plane hasil panen: satu baris per tiket, dari baris judul tiap berkas. */
export function isiIndeks(modul: string, berkas: { nama: string; judul: string }[]): string {
  return `# Progres tiket Plane — ${modul}

> Daftar berkas hasil panen \`bun run kerja panen\`. Dibuat ulang tiap panen; jangan disunting.

${berkas.map((b) => `- [${b.judul}](./${b.nama})`).join('\n')}
`
}

export const namaBerkasPanen = (key: string) => `${key.toLowerCase()}.md`

/**
 * Tulis berkas panen dan indeksnya, lalu jalankan `npm run check-v2`. Mengembalikan jalur
 * relatif fleetify-ops dan hasil cek. Tanpa `tulis` hanya mengembalikan rencana (pratinjau).
 */
export function panen(s: SumberPanen, modul: string, o: { tulis: boolean; tanggal: string }) {
  if (!existsSync(path.join(DIR_V2, modul, 'status.md')))
    throw new Error(`Modul docs-site tidak ada: database/v2/${modul}`)
  const dir = path.join(DIR_V2, modul, 'progres-plane')
  const file = path.join(dir, namaBerkasPanen(s.key))
  const isi = isiPanen(s, o.tanggal)
  const lama = existsSync(file) ? readFileSync(file, 'utf8') : null
  const rel = path.relative(path.dirname(DOCS_SITE), file)
  if (!o.tulis) return { rel, berubah: lama !== isi, baru: lama === null, isi, cek: null }
  mkdirSync(dir, { recursive: true })
  writeFileSync(file, isi)
  const daftar = readdirSync(dir)
    .filter((f) => /^[a-z]+-\d+\.md$/.test(f))
    .sort((a, b) => Number(a.split('-')[1]?.split('.')[0]) - Number(b.split('-')[1]?.split('.')[0]))
    .map((f) => ({
      nama: f,
      judul: readFileSync(path.join(dir, f), 'utf8').split('\n')[0]?.replace(/^#\s*/, '') ?? f,
    }))
  writeFileSync(path.join(dir, '00-indeks-kerja.md'), isiIndeks(modul, daftar))
  const c = spawnSync('npm', ['run', '--silent', 'check-v2'], { cwd: DOCS_SITE, encoding: 'utf8' })
  return {
    rel,
    berubah: lama !== isi,
    baru: lama === null,
    isi,
    cek: { ok: c.status === 0, keluaran: `${c.stdout}${c.stderr}`.trim() },
  }
}

// Membaca skenario dari scenarios/<task>/<slug>.json. Tiap pembacaan membaca ulang berkas,
// jadi perubahan dari AI langsung terlihat tanpa menyalakan ulang panel.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { config, ROOT } from './config.ts'
import { personaName } from './personas.ts'
import { type Masalah, periksaSkenario } from './rules.ts'
import type { Langkah, Skenario } from './skema.ts'

export const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/
export const TASK = /^[A-Za-z0-9][A-Za-z0-9_-]*$/

export interface BerkasSkenario {
  slug: string
  task: string
  /** Relatif ke akar repo, mis. scenarios/pengadaan/pinjaman-alat.json */
  path: string
  abs: string
  mtime: string
  raw: string
  skenario: Skenario | null
  masalah: Masalah[]
}

function bacaBerkas(task: string, file: string): BerkasSkenario {
  const abs = path.join(config.scenariosDir, task, file)
  const slug = file.replace(/\.json$/, '')
  const raw = readFileSync(abs, 'utf8')
  const hasil = SLUG.test(slug)
    ? periksaSkenario(raw, { slug })
    : {
        skenario: null,
        masalah: [{ aturan: 'satu-berkas', path: '', message: 'nama berkas harus kebab-case' }],
      }
  // Folder = modul (Project › Modul): berkas di scenarios/<modul>/ harus ber-"modul" sama.
  if (hasil.skenario && hasil.skenario.modul !== task) {
    hasil.masalah = [
      ...hasil.masalah,
      {
        aturan: 'modul-folder',
        path: 'modul',
        message: `berkas di scenarios/${task}/ harus ber-"modul": "${task}" (tertulis "${hasil.skenario.modul}"); pindahkan berkas atau ubah modul`,
      },
    ]
    hasil.skenario = null
  }
  return {
    slug,
    task,
    path: path.relative(ROOT, abs),
    abs,
    mtime: statSync(abs).mtime.toISOString(),
    raw,
    ...hasil,
  }
}

/** Semua berkas skenario. Slug ganda antar-task ditandai tidak valid. */
export function bacaSemua(): BerkasSkenario[] {
  const dir = config.scenariosDir
  if (!existsSync(dir)) return []
  const out: BerkasSkenario[] = []
  for (const task of readdirSync(dir).sort()) {
    const tdir = path.join(dir, task)
    if (!TASK.test(task) || !statSync(tdir).isDirectory()) continue
    for (const f of readdirSync(tdir).sort()) if (f.endsWith('.json')) out.push(bacaBerkas(task, f))
  }
  const hitung = new Map<string, number>()
  for (const b of out) hitung.set(b.slug, (hitung.get(b.slug) ?? 0) + 1)
  for (const b of out)
    if ((hitung.get(b.slug) ?? 0) > 1) {
      b.masalah.push({
        aturan: 'slug-unik',
        path: 'slug',
        message: `slug "${b.slug}" dipakai di lebih dari satu task`,
      })
      b.skenario = null
    }
  periksaAlur(out)
  return out
}

/**
 * Aturan `alur` lintas berkas: satu alur lurus per grup; belok merujuk alur lurus di grup yang
 * sama dan langkah yang ada. Pelanggaran dicatat sebagai masalah standar (check:scenarios gagal),
 * tapi skenario tetap bisa diputar.
 */
export function periksaAlur(semua: BerkasSkenario[]): void {
  const lurus = new Map<string, BerkasSkenario[]>()
  for (const b of semua)
    if (b.skenario?.alur?.jenis === 'lurus') lurus.set(b.task, [...(lurus.get(b.task) ?? []), b])
  for (const [task, bs] of lurus)
    if (bs.length > 1)
      for (const b of bs)
        b.masalah.push({
          aturan: 'alur',
          path: 'alur',
          message: `grup ${task} punya ${bs.length} alur lurus (${bs.map((x) => x.slug).join(', ')}); hanya boleh satu`,
        })
  for (const b of semua) {
    const a = b.skenario?.alur
    if (a?.jenis !== 'belok') continue
    const induk = semua.find((x) => x.slug === a.dari)
    const msg = !induk?.skenario
      ? `alur.dari "${a.dari}" tidak ada atau tidak valid`
      : induk.task !== b.task
        ? `alur.dari "${a.dari}" ada di grup ${induk.task}, bukan ${b.task}`
        : induk.skenario.alur?.jenis !== 'lurus'
          ? `alur.dari "${a.dari}" bukan alur lurus`
          : a.langkah > induk.skenario.langkah.length
            ? `alur.langkah ${a.langkah} melebihi ${induk.skenario.langkah.length} langkah "${a.dari}"`
            : null
    if (msg) b.masalah.push({ aturan: 'alur', path: 'alur', message: msg })
  }
}

/** Info alur untuk kartu panel: belok membawa judul langkah alur lurus tempat ia menyimpang. */
export function infoAlur(
  b: BerkasSkenario,
  semua: BerkasSkenario[],
):
  | { jenis: 'lurus' }
  | { jenis: 'belok'; dari: string; langkah: number; judul: string | null }
  | null {
  const a = b.skenario?.alur
  if (!a) return null
  if (a.jenis === 'lurus') return { jenis: 'lurus' }
  const induk = semua.find((x) => x.slug === a.dari)?.skenario
  return { ...a, judul: induk?.langkah[a.langkah - 1]?.judul ?? null }
}

export function bacaSatu(slug: string): BerkasSkenario {
  if (!SLUG.test(slug)) throw new Error(`Nama skenario tidak sah: ${slug}`)
  const b = bacaSemua().find((x) => x.slug === slug)
  if (!b) throw new Error(`Skenario ${slug} tidak ada di scenarios/<task>/`)
  return b
}

/** Skenario valid atau galat berisi masalah pertama. */
export function muatSkenario(slug: string): BerkasSkenario & { skenario: Skenario } {
  const b = bacaSatu(slug)
  if (!b.skenario) {
    const m = b.masalah[0]
    throw new Error(
      `Skenario ${slug} tidak valid: ${m?.path ? `${m.path}: ` : ''}${m?.message ?? ''}`,
    )
  }
  return b as BerkasSkenario & { skenario: Skenario }
}

export interface StepInfo {
  n: number
  id: string
  title: string
  /** Paragraf deskripsi; null bila belum diisi (jalan versi lama: tidak ada). */
  deskripsi?: string | null
  expect: string
  who: string | null
  who_name: string | null
  /** Bisa dimulai dari sini tanpa data jalan lain. */
  reach: boolean
  belakang: boolean
}

export const stepInfo = (s: Langkah, i: number): StepInfo => ({
  n: i + 1,
  id: s.id,
  title: s.judul,
  deskripsi: s.deskripsi ?? null,
  expect: s.harusTerlihat,
  who: s.sebagai ?? null,
  who_name: s.sebagai ? personaName(s.sebagai) : null,
  reach: !!s.capai,
  belakang: !!s.diBelakangLayar,
})

/** Urutan dalam grup: alur lurus, lalu belok menurut langkah beloknya, lalu skenario lepas. */
export function urutAlur<T extends { slug: string; skenario: Skenario | null }>(bs: T[]): T[] {
  const kunci = (b: T): [number, number] => {
    const a = b.skenario?.alur
    if (a?.jenis === 'lurus') return [0, 0]
    if (a?.jenis === 'belok') return [1, a.langkah]
    return [2, 0]
  }
  return [...bs].sort((x, y) => {
    const [a1, a2] = kunci(x)
    const [b1, b2] = kunci(y)
    return a1 - b1 || a2 - b2 || x.slug.localeCompare(y.slug)
  })
}

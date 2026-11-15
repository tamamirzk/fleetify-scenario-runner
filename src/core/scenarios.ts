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
  /** Relatif ke akar repo, mis. scenarios/material/pinjaman-alat.json */
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
  return out
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

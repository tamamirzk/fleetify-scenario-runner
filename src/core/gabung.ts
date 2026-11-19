// Gabungkan untuk MR (docs/RANCANGAN-KERJA-V2.md K20): tiket yang sudah disetujui dari branch
// masing-masing digabung (merge --no-ff) ke satu branch dari origin/development di worktree
// khusus `v2-gabung`, lalu gerbang CI, push, dan satu MR. Satu gabungan aktif pada satu waktu.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { config } from './config.ts'
import type { HasilGerbang } from './gerbang.ts'
import { KERJA_DIR, type Kerja } from './kerja.ts'

export type StatusTiketGabung = 'menunggu' | 'tergabung' | 'konflik' | 'dikeluarkan'

export interface TiketGabung {
  key: string
  branch: string
  status: StatusTiketGabung
  /** Berkas yang konflik saat merge (bila status konflik). */
  konflik?: string[]
}

export interface Gabungan {
  /** Nama branch gabungan, mis. feat/gabung-2026-11-18. */
  branch: string
  dibuat: string
  /** origin/development saat gabungan dibuat. */
  base: string
  tiket: TiketGabung[]
  gerbangCi?: HasilGerbang
  push?: { at: string; head: string; jumlah: number }
  mr?: string
  merge?: { at: string; head: string }
}

/** Worktree gabungan di sebelah repo v2 (di tes: repo temp lewat V2_REPO_DIR). */
export const WORKTREE_GABUNG = () => path.join(path.dirname(config.v2RepoDir), 'v2-gabung')
const BERKAS = () => path.join(KERJA_DIR, '_gabung.json')
const DIR_ARSIP = () => path.join(KERJA_DIR, '_gabung-arsip')

export const namaGabunganBawaan = (tanggal: string) => `feat/gabung-${tanggal}`

/** Calon: sudah disetujui (Didokumentasikan), punya commit dan branch, belum di-push/di-merge. */
export function calonGabung(semua: Kerja[], aktif: Gabungan | null): Kerja[] {
  const sudah = new Set(
    aktif?.tiket.filter((t) => t.status !== 'dikeluarkan').map((t) => t.key) ?? [],
  )
  return semua.filter(
    (k) =>
      k.tahap === 'didokumentasikan' &&
      !k.ditunda &&
      k.commit.length > 0 &&
      !!k.branch &&
      !k.push &&
      !k.merge &&
      !sudah.has(k.key),
  )
}

/** Langkah berikutnya gabungan untuk Tams (dipakai Butuh kamu dan kartu Workspace). */
export function langkahGabungan(g: Gabungan): { alasan: string; siapPush: boolean } {
  const konflik = g.tiket.find((t) => t.status === 'konflik')
  if (g.merge) return { alasan: 'MR gabungan sudah di-merge ke development', siapPush: false }
  if (konflik)
    return {
      alasan: `Konflik saat menggabung ${konflik.key}: keluarkan tiketnya atau minta AI menyelesaikan`,
      siapPush: false,
    }
  if (g.tiket.some((t) => t.status === 'menunggu'))
    return { alasan: 'Penggabungan belum selesai: lanjutkan', siapPush: false }
  if (!g.tiket.some((t) => t.status === 'tergabung'))
    return {
      alasan: 'Tidak ada tiket tergabung: batalkan gabungan atau buat yang baru',
      siapPush: false,
    }
  if (g.push)
    return g.mr
      ? { alasan: 'MR gabungan menunggu review/merge', siapPush: false }
      : { alasan: 'Sudah di-push: buat MR di GitLab lalu tempel link-nya', siapPush: false }
  if (!g.gerbangCi) return { alasan: 'Semua tiket tergabung: jalankan gerbang CI', siapPush: false }
  if (g.gerbangCi.hasil === 'gagal')
    return {
      alasan: 'Gerbang CI gabungan gagal: perbaiki atau keluarkan tiket penyebabnya',
      siapPush: false,
    }
  return { alasan: `Gerbang CI ${g.gerbangCi.hasil}: push branch gabungan`, siapPush: true }
}

// ── Penyimpanan ─────────────────────────────────────────────────────────────

export function bacaGabungan(): Gabungan | null {
  const f = BERKAS()
  return existsSync(f) ? (JSON.parse(readFileSync(f, 'utf8')) as Gabungan) : null
}

export function simpanGabungan(g: Gabungan | null) {
  mkdirSync(KERJA_DIR, { recursive: true })
  if (g === null) rmSync(BERKAS(), { force: true })
  else writeFileSync(BERKAS(), `${JSON.stringify(g, null, 2)}\n`)
}

/** Arsipkan gabungan yang sudah selesai (merge) ke kerja/_gabung-arsip/<branch>.json. */
export function arsipkanGabungan(g: Gabungan) {
  mkdirSync(DIR_ARSIP(), { recursive: true })
  writeFileSync(
    path.join(DIR_ARSIP(), `${g.branch.replace(/\//g, '__')}.json`),
    `${JSON.stringify(g, null, 2)}\n`,
  )
}

// ── Git ────────────────────────────────────────────────────────────────────

function jalan(args: string[], cwd?: string) {
  const r = spawnSync(args[0] as string, args.slice(1), { cwd, encoding: 'utf8' })
  return { kode: r.status ?? 1, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() }
}
const git = (dir: string, ...a: string[]) => jalan(['git', '-C', dir, ...a])

/** Siapkan worktree v2-gabung (dibuat bila belum ada; dependency dipasang oleh langkah install gerbang CI, bukan di sini agar panel tidak menunggu). */
export function siapkanWorktreeGabung(): string {
  const w = WORKTREE_GABUNG()
  if (!existsSync(path.join(w, '.git'))) {
    git(config.v2RepoDir, 'fetch', '-q', 'origin', 'development')
    const a = git(config.v2RepoDir, 'worktree', 'add', '--detach', w, 'origin/development')
    if (a.kode !== 0) throw new Error(`worktree v2-gabung gagal dibuat: ${a.err}`)
  }
  if (git(w, 'status', '--porcelain').out)
    throw new Error('Worktree v2-gabung punya perubahan yang belum di-commit')
  return w
}

/** Gabung satu branch tiket; konflik → merge dibatalkan, berkas konflik dikembalikan. */
export function gabungSatu(dir: string, t: TiketGabung, judul: string): TiketGabung {
  const m = git(dir, 'merge', '--no-ff', '-m', `Merge ${t.branch} (${t.key}: ${judul})`, t.branch)
  if (m.kode === 0) return { ...t, status: 'tergabung', konflik: undefined }
  const konflik = git(dir, 'diff', '--name-only', '--diff-filter=U').out.split('\n').filter(Boolean)
  git(dir, 'merge', '--abort')
  if (!konflik.length)
    throw new Error(
      `git merge ${t.branch} gagal: ${(m.err || m.out).split('\n').slice(-2).join(' ')}`,
    )
  return { ...t, status: 'konflik', konflik }
}

/** Gabung semua tiket berstatus menunggu, berurutan; berhenti di konflik pertama. */
export function lanjutkanGabung(g: Gabungan, judul: (key: string) => string): Gabungan {
  const dir = WORKTREE_GABUNG()
  const tiket = [...g.tiket]
  for (let i = 0; i < tiket.length; i++) {
    const t = tiket[i] as TiketGabung
    if (t.status !== 'menunggu') continue
    tiket[i] = gabungSatu(dir, t, judul(t.key))
    if (tiket[i]?.status === 'konflik') break
  }
  // Commit baru di branch gabungan membuat hasil gerbang CI lama tidak berlaku.
  return { ...g, tiket, gerbangCi: undefined }
}

/** Buat gabungan baru: branch dari origin/development, lalu gabung tiket satu per satu. */
export function mulaiGabungan(
  branch: string,
  tiket: { key: string; branch: string }[],
  judul: (key: string) => string,
): Gabungan {
  if (!/^[\w./-]+$/.test(branch) || branch.startsWith('-'))
    throw new Error(`Nama branch tidak sah: ${branch}`)
  if (['main', 'master', 'development', 'staging'].includes(branch))
    throw new Error(`Branch ${branch} tidak boleh dipakai`)
  if (!tiket.length) throw new Error('Pilih minimal satu tiket')
  const dir = siapkanWorktreeGabung()
  git(dir, 'fetch', '-q', 'origin', 'development')
  if (git(dir, 'rev-parse', '--verify', '-q', `refs/heads/${branch}`).kode === 0)
    throw new Error(`Branch ${branch} sudah ada; pakai nama lain`)
  // --no-track: branch gabungan tidak boleh melacak origin/development (seperti branch slot).
  const sw = git(dir, 'switch', '-q', '-c', branch, '--no-track', 'origin/development')
  if (sw.kode !== 0) throw new Error(`git switch -c ${branch} gagal: ${sw.err}`)
  const g: Gabungan = {
    branch,
    dibuat: new Date().toISOString(),
    base: git(dir, 'rev-parse', 'HEAD').out,
    tiket: tiket.map((t) => ({ key: t.key, branch: t.branch, status: 'menunggu' })),
  }
  try {
    return lanjutkanGabung(g, judul)
  } catch (e) {
    // Gagal di tengah (bukan konflik): jangan tinggalkan branch setengah jadi.
    git(dir, 'merge', '--abort')
    git(dir, 'switch', '-q', '--detach', 'origin/development')
    git(dir, 'branch', '-D', branch)
    throw e
  }
}

export const headGabung = () => git(WORKTREE_GABUNG(), 'rev-parse', 'HEAD').out

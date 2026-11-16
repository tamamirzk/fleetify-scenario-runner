// Perubahan kode v2 per tiket untuk halaman Kerja: commit yang dicatat (`bun run kerja catat
// --commit`) dibaca langsung dari repo git v2 lokal — pesan, berkas, jumlah baris, dan diff.
// Hanya membaca (git show / rev-list); tidak pernah mengubah repo.
import { existsSync } from 'node:fs'
import type { Kerja } from './kerja.ts'

export const SHA = /^[0-9a-f]{7,40}$/
const NAMA_BRANCH = /^[A-Za-z0-9._/-]+$/
/** Batas diff per berkas dan per commit, supaya halaman tetap ringan. */
export const BATAS_DIFF_BERKAS = 120_000
export const BATAS_DIFF_COMMIT = 600_000

export interface BerkasBerubah {
  path: string
  tambah: number | null
  hapus: number | null
  diff: string
  terpotong: boolean
}
export interface CommitKode {
  sha: string
  judul: string
  isi: string
  penulis: string
  tanggal: string
  berkas: BerkasBerubah[]
  galat?: string
}
export interface KodeKerja {
  repo: string
  branch: string | null
  commits: CommitKode[]
  /** Commit di branch setelah commit terakhir yang dicatat (belum tercatat di kerja). */
  belumDicatat: number | null
  /** Branch sudah ada di remote origin (menurut ref lokal, tanpa fetch); null bila tak diketahui. */
  diRemote: boolean | null
  /** Commit branch yang belum ada di origin/<branch>; null bila branch belum ada di remote. */
  belumDiPush: number | null
  galat?: string
}

/** `git --numstat`: "tambah<TAB>hapus<TAB>path"; berkas biner memakai "-". */
export function bacaNumstat(teks: string) {
  return teks
    .split('\n')
    .filter((b) => b.trim())
    .map((b) => {
      const [t, h, ...p] = b.split('\t')
      const angka = (x?: string) => (x === undefined || x === '-' ? null : Number(x))
      return { path: p.join('\t'), tambah: angka(t), hapus: angka(h) }
    })
}

/** Pecah patch gabungan per berkas (kunci = path sesudah, "b/…"). */
export function pisahDiff(patch: string): Map<string, string> {
  const out = new Map<string, string>()
  const bagian = patch.split(/^(?=diff --git )/m).filter((b) => b.startsWith('diff --git '))
  for (const b of bagian) {
    const m = b.match(/^diff --git a\/(.+?) b\/(.+)$/m)
    if (m?.[2]) out.set(m[2], b)
  }
  return out
}

type Jalan = (args: string[]) => { ok: boolean; out: string; err: string }
const gitBun =
  (repo: string): Jalan =>
  (args) => {
    const r = Bun.spawnSync(['git', '-C', repo, ...args], { stdout: 'pipe', stderr: 'pipe' })
    return { ok: r.exitCode === 0, out: r.stdout.toString(), err: r.stderr.toString().trim() }
  }

/** Satu commit: pesan, berkas (numstat) dan diff per berkas, dipotong bila terlalu besar. */
export function bacaCommit(git: Jalan, sha: string): CommitKode {
  if (!SHA.test(sha))
    return { sha, judul: '', isi: '', penulis: '', tanggal: '', berkas: [], galat: 'SHA tidak sah' }
  const meta = git(['show', '-s', '--format=%H%x00%s%x00%b%x00%an%x00%aI', sha])
  if (!meta.ok)
    return {
      sha,
      judul: '',
      isi: '',
      penulis: '',
      tanggal: '',
      berkas: [],
      galat: `Commit tidak ditemukan di repo v2 (mungkin sudah di-amend atau di-rebase): ${meta.err.split('\n')[0]}`,
    }
  const [penuh, judul, isi, penulis, tanggal] = meta.out.replace(/\n$/, '').split('\0')
  const angka = bacaNumstat(git(['show', '--format=', '--numstat', '--find-renames', sha]).out)
  const patch = git(['show', '--format=', '--patch', '--find-renames', sha]).out
  const perBerkas = pisahDiff(patch)
  let sisa = BATAS_DIFF_COMMIT
  const berkas = angka.map((a) => {
    const kunci = a.path.includes(' => ')
      ? a.path.replace(/\{.*? => (.*?)\}/, '$1').replace(/^.* => /, '')
      : a.path
    const d = perBerkas.get(kunci) ?? ''
    const batas = Math.max(0, Math.min(BATAS_DIFF_BERKAS, sisa))
    const terpotong = d.length > batas
    sisa -= Math.min(d.length, batas)
    return { ...a, diff: terpotong ? d.slice(0, batas) : d, terpotong }
  })
  return {
    sha: penuh ?? sha,
    judul: judul ?? '',
    isi: (isi ?? '').trim(),
    penulis: penulis ?? '',
    tanggal: tanggal ?? '',
    berkas,
  }
}

export function kodeKerja(
  k: Pick<Kerja, 'branch' | 'commit'>,
  repo: string,
  git: Jalan = gitBun(repo),
): KodeKerja {
  const dasar = {
    repo,
    branch: k.branch,
    commits: [] as CommitKode[],
    belumDicatat: null,
    diRemote: null,
    belumDiPush: null,
  }
  if (!k.commit.length) return dasar
  if (!existsSync(repo))
    return { ...dasar, galat: `Repo v2 tidak ditemukan: ${repo} (atur V2_REPO_DIR)` }
  const commits = k.commit.map((c) => bacaCommit(git, c))
  let belumDicatat: number | null = null
  let diRemote: boolean | null = null
  let belumDiPush: number | null = null
  const terakhir = k.commit.at(-1)
  if (k.branch && NAMA_BRANCH.test(k.branch)) {
    if (terakhir && SHA.test(terakhir)) {
      const r = git(['rev-list', '--count', `${terakhir}..refs/heads/${k.branch}`])
      if (r.ok) belumDicatat = Number(r.out.trim())
    }
    const remote = `refs/remotes/origin/${k.branch}`
    const ada = git(['rev-parse', '--verify', '--quiet', remote])
    diRemote = ada.ok
    if (ada.ok) {
      const r = git(['rev-list', '--count', `${remote}..refs/heads/${k.branch}`])
      if (r.ok) belumDiPush = Number(r.out.trim())
    }
  }
  return { ...dasar, commits, belumDicatat, diRemote, belumDiPush }
}

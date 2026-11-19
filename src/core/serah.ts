// Serahkan (docs/RANCANGAN-KERJA-V2.md R-2.2, R-2.3, R-4.2, R-8.4): syarat push, keadaan git
// worktree, push biasa ke satu branch (Tams yang membuat MR di GitLab), dan deskripsi MR yang
// disusun dari catatan. Syarat murni di atas; git (node:child_process, bisa diuji) di bawah.
import { spawnSync } from 'node:child_process'
import { type DataCatatan, pecahCatatan } from './catatan.ts'
import type { HasilGerbang } from './gerbang.ts'

/** Branch bersama yang tidak boleh di-push langsung dari alur Kerja. */
export const BRANCH_TERLARANG = ['main', 'master', 'development', 'staging']

export interface KeadaanGit {
  head: string
  branch: string | null
  bersih: boolean
  /** upstream branch kerja (mis. origin/feat/x) atau null bila belum pernah di-push. */
  upstream: string | null
  /** Commit yang akan terkirim: terhadap upstream, atau terhadap origin/development. */
  akanDipush: { sha: string; judul: string }[]
  /** URL remote origin tanpa kredensial. */
  remote: string | null
}

/** Syarat tombol Push (R-4.2): semua harus terpenuhi; alasan ditampilkan apa adanya. */
export function syaratPush(o: {
  git: KeadaanGit
  gerbangCi?: HasilGerbang | null
  gerbangBerjalan?: boolean
}): { boleh: boolean; alasan: string[] } {
  const a: string[] = []
  const g = o.git
  if (!g.branch) a.push('worktree tidak sedang di sebuah branch (detached HEAD)')
  else if (BRANCH_TERLARANG.includes(g.branch))
    a.push(`branch ${g.branch} tidak boleh di-push dari alur Kerja`)
  if (!g.bersih) a.push('ada perubahan yang belum di-commit')
  if (!g.akanDipush.length) a.push('tidak ada commit baru untuk di-push')
  if (o.gerbangBerjalan) a.push('gerbang CI sedang berjalan')
  else if (!o.gerbangCi) a.push('gerbang CI belum dijalankan')
  else {
    if (o.gerbangCi.hasil === 'gagal') a.push('gerbang CI gagal')
    if (o.gerbangCi.head !== g.head)
      a.push('ada commit baru sejak gerbang CI terakhir: jalankan ulang')
  }
  return { boleh: !a.length, alasan: a }
}

/** URL remote tanpa user:password@ (mis. token di URL https). */
export const tanpaKredensial = (url: string) => url.replace(/\/\/[^/@]+@/, '//')

// ── Deskripsi MR (R-8.4) ───────────────────────────────────────────────────

export interface TiketMr {
  key: string
  judul: string
  url: string
  md: string | null
  data: DataCatatan
  verifikasi: { kriteria: string; hasil: string }[]
}

const bagian = (md: string | null, jenis: string) =>
  pecahCatatan(md)
    .bagian.filter((b) => b.jenis === jenis)
    .map((b) => b.isi.replace(/<!--[\s\S]*?-->/g, '').trim())
    .filter(Boolean)
    .join('\n\n')

/**
 * Deskripsi MR untuk satu branch (bisa beberapa tiket se-klaster): masalah, yang dikerjakan,
 * keputusan, verifikasi, commit, langkah setelah deploy, dan hasil gerbang CI. Tams menyalinnya
 * ke GitLab; AI tidak membuat MR (R-2.2).
 */
export function deskripsiMr(o: {
  tiket: TiketMr[]
  branch: string
  commit: { sha: string; judul: string }[]
  gerbangCi?: HasilGerbang | null
}): { judul: string; isi: string } {
  const kunci = o.tiket.map((t) => t.key)
  const judul = `${kunci.join(' · ')} — ${o.tiket.length === 1 ? (o.tiket[0]?.judul ?? '') : o.branch}`
  const out: string[] = [`## ${judul}`]
  for (const t of o.tiket) {
    const kepala = o.tiket.length > 1 ? `### ${t.key} · ${t.judul}\n\n` : ''
    const isi = [
      t.url ? `Tiket: ${t.url}` : 'Tiket: — (tanpa tiket Plane)',
      bagian(t.md, 'masalah') && `**Masalah & penyebab**\n\n${bagian(t.md, 'masalah')}`,
      bagian(t.md, 'dikerjakan') && `**Yang dikerjakan**\n\n${bagian(t.md, 'dikerjakan')}`,
      t.data.keputusan.length &&
        `**Keputusan**\n\n${t.data.keputusan.map((k) => `- ${k.apa}${k.alasan ? ` — ${k.alasan}` : ''}${k.oleh === 'ai' ? ' _(diambil AI, sudah ditinjau)_' : ''}`).join('\n')}`,
      t.verifikasi.length &&
        `**Verifikasi (lokal)**\n\n${t.verifikasi.map((v) => `- ${v.hasil === 'lulus' ? '✓' : v.hasil === 'gagal' ? '×' : '○'} ${v.kriteria}`).join('\n')}`,
    ]
      .filter(Boolean)
      .join('\n\n')
    out.push(`${kepala}${isi}`)
  }
  if (o.commit.length)
    out.push(
      `### Commit\n\n${o.commit.map((c) => `- \`${c.sha.slice(0, 8)}\` ${c.judul}`).join('\n')}`,
    )
  // Serah-terima: deploy dan cek staging dikerjakan tim lain (K19).
  const staging = o.tiket.flatMap((t) => t.data.cekStaging.map((c) => c.teks))
  const unik = [...new Set(staging)]
  if (unik.length)
    out.push(`### Catatan untuk tim staging\n\n${unik.map((c) => `- [ ] ${c}`).join('\n')}`)
  const g = o.gerbangCi
  if (g) {
    const catatan = g.langkah
      .filter((l) => l.hasil !== 'lulus')
      .map(
        (l) =>
          `- ${l.hasil === 'peringatan' ? '!' : '×'} ${l.judul}${l.ringkas ? `: ${l.ringkas}` : ''}`,
      )
    out.push(
      `### Pengujian\n\nGerbang CI lokal (langkah \`.gitlab-ci.yml\`): **${g.hasil}**, ${g.langkah.filter((l) => l.hasil === 'lulus').length}/${g.langkah.length} langkah, commit \`${g.head.slice(0, 8)}\`.${catatan.length ? `\n\n${catatan.join('\n')}` : ''}`,
    )
  }
  return { judul, isi: `${out.join('\n\n')}\n` }
}

// ── Git ────────────────────────────────────────────────────────────────────

function git(dir: string, args: string[]) {
  const r = spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' })
  return { kode: r.status ?? 1, out: (r.stdout ?? '').trim(), err: (r.stderr ?? '').trim() }
}

export function keadaanGit(dir: string): KeadaanGit {
  const head = git(dir, ['rev-parse', 'HEAD']).out
  const b = git(dir, ['symbolic-ref', '--short', '-q', 'HEAD'])
  const upstream = git(dir, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])
  const dasar = upstream.kode === 0 ? upstream.out : 'origin/development'
  const log = git(dir, ['log', '--format=%H%x09%s', `${dasar}..HEAD`])
  const remote = git(dir, ['remote', 'get-url', 'origin'])
  return {
    head,
    branch: b.kode === 0 && b.out ? b.out : null,
    bersih: git(dir, ['status', '--porcelain']).out === '',
    upstream: upstream.kode === 0 ? upstream.out : null,
    akanDipush: log.out
      ? log.out.split('\n').map((l) => {
          const [sha = '', ...j] = l.split('\t')
          return { sha, judul: j.join('\t') }
        })
      : [],
    remote: remote.kode === 0 ? tanpaKredensial(remote.out) : null,
  }
}

/** Push biasa (tanpa force) ke origin; -u bila branch belum punya upstream. */
export function pushBranch(dir: string, branch: string, adaUpstream: boolean) {
  const r = git(dir, ['push', ...(adaUpstream ? [] : ['-u']), 'origin', branch])
  return { ok: r.kode === 0, keluaran: `${r.out}\n${r.err}`.trim() }
}

const fetchTerakhir = new Map<string, number>()

/**
 * Apakah commit push sudah ada di origin/development (MR di-merge, K19)? `git fetch` dibatasi
 * sekali per 3 menit per repo supaya Dashboard tetap cepat.
 */
export function sudahDiMerge(dir: string, head: string, kini = Date.now()): boolean {
  const akar = git(dir, ['rev-parse', '--git-common-dir']).out || dir
  if (kini - (fetchTerakhir.get(akar) ?? 0) > 180_000) {
    git(dir, ['fetch', '-q', 'origin', 'development'])
    fetchTerakhir.set(akar, kini)
  }
  return git(dir, ['merge-base', '--is-ancestor', head, 'origin/development']).kode === 0
}

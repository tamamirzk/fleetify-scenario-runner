// Perubahan kode v2 per tiket: baca numstat/diff git, status push, dan tampilan di halaman Kerja.
import { describe, expect, it } from 'vitest'
import { barisDiff, perubahanKode } from '../panel/js/kerja.js'
import { ROOT } from '../src/core/config.ts'
import { bacaNumstat, kodeKerja, pisahDiff } from '../src/core/kode.ts'

const PATCH = `diff --git a/Backend/a.ts b/Backend/a.ts
index 1..2 100644
--- a/Backend/a.ts
+++ b/Backend/a.ts
@@ -1,2 +1,3 @@
 lama
-hapus <x>
+tambah
+lagi
diff --git a/Frontend/b.png b/Frontend/b.png
Binary files differ
`

/** git palsu: jawaban per awalan argumen. */
const gitPalsu = (jawab: Record<string, string | null>) => (args: string[]) => {
  const kunci = Object.keys(jawab).find((k) => args.join(' ').startsWith(k))
  const out = kunci ? jawab[kunci] : null
  return out === null || out === undefined
    ? { ok: false, out: '', err: 'fatal: bad object' }
    : { ok: true, out, err: '' }
}

describe('kode v2 per tiket', () => {
  it('numstat: angka, dan "-" untuk berkas biner', () => {
    expect(bacaNumstat('3\t1\tBackend/a.ts\n-\t-\tFrontend/b.png\n')).toEqual([
      { path: 'Backend/a.ts', tambah: 3, hapus: 1 },
      { path: 'Frontend/b.png', tambah: null, hapus: null },
    ])
  })

  it('patch dipecah per berkas', () => {
    const m = pisahDiff(PATCH)
    expect([...m.keys()]).toEqual(['Backend/a.ts', 'Frontend/b.png'])
    expect(m.get('Backend/a.ts')).toContain('+tambah')
  })

  it('commit dibaca; branch belum di remote; commit yang hilang dilaporkan', () => {
    const git = gitPalsu({
      'show -s --format=%H%x00%s%x00%b%x00%an%x00%aI abc1234':
        'abc1234ffff\0feat: FMS-1 x\0isi\0Tams\0' + '2026-11-16T10:00:00+07:00\n',
      'show --format= --numstat --find-renames abc1234':
        '2\t1\tBackend/a.ts\n-\t-\tFrontend/b.png\n',
      'show --format= --patch --find-renames abc1234': PATCH,
      'rev-list --count abc1234..refs/heads/feat/fms-1': '1\n',
      'rev-parse --verify --quiet refs/remotes/origin/feat/fms-1': null,
    })
    const d = kodeKerja({ branch: 'feat/fms-1', commit: ['abc1234', 'dead999'] }, ROOT, git)
    expect(d.commits[0]).toMatchObject({ judul: 'feat: FMS-1 x', penulis: 'Tams' })
    expect(d.commits[0]?.berkas.map((b) => b.path)).toEqual(['Backend/a.ts', 'Frontend/b.png'])
    expect(d.commits[1]?.galat).toMatch(/tidak ditemukan/)
    expect(d).toMatchObject({ diRemote: false, belumDiPush: null })
    expect(kodeKerja({ branch: null, commit: ['zz'] }, ROOT, git).commits[0]?.galat).toMatch(/SHA/)
    expect(kodeKerja({ branch: null, commit: [] }, ROOT, git).commits).toEqual([])
  })

  it('tampilan: ringkasan, status push, diff berkelas dan ter-escape', () => {
    const h = perubahanKode({
      branch: 'feat/fms-1',
      diRemote: false,
      belumDiPush: null,
      belumDicatat: 1,
      commits: [
        {
          sha: 'abc1234ffff',
          judul: 'feat: x',
          isi: '',
          penulis: 'Tams',
          tanggal: '2026-11-16T10:00:00+07:00',
          berkas: [{ path: 'Backend/a.ts', tambah: 2, hapus: 1, diff: PATCH, terpotong: false }],
        },
      ],
    })
    expect(h).toContain('1 commit · 1 berkas')
    expect(h).toContain('belum di-push')
    expect(h).toContain('1 commit lebih baru')
    expect(h).toContain('<code>abc1234f</code>')
    const b = barisDiff(PATCH)
    expect(b).toContain('<span class="tambah">+tambah</span>')
    expect(b).toContain('<span class="hapus">-hapus &lt;x&gt;</span>')
    expect(b).not.toContain('index 1..2')
    expect(perubahanKode({ commits: [], branch: null })).toContain('Belum ada commit tercatat')
  })
})

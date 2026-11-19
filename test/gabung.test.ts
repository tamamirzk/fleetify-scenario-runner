// Gabungkan untuk MR (K20). Fungsi murni + integrasi git di repo SEMENTARA: repo "v2" buatan tes
// dengan origin palsu (repo bare temp). Tidak ada yang menyentuh repo v2 sungguhan, kerja/ nyata,
// maupun remote mana pun: V2_REPO_DIR dan RUNNER_KERJA_DIR diarahkan ke folder temp sebelum modul
// dimuat (vi.hoisted), sehingga worktree gabungan jatuh di <temp>/v2-gabung.
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

const T = vi.hoisted(() => {
  const fs = process.getBuiltinModule('node:fs')
  const os = process.getBuiltinModule('node:os')
  const pth = process.getBuiltinModule('node:path')
  const base = fs.realpathSync(fs.mkdtempSync(pth.join(os.tmpdir(), 'gabung-tes-')))
  process.env.V2_REPO_DIR = pth.join(base, 'v2')
  process.env.RUNNER_KERJA_DIR = pth.join(base, 'kerja')
  return { base }
})

import { butuhGabungan, lajurKerja } from '../src/core/butuh-kamu.ts'
import {
  arsipkanGabungan,
  bacaGabungan,
  calonGabung,
  type Gabungan,
  headGabung,
  langkahGabungan,
  mulaiGabungan,
  namaGabunganBawaan,
  simpanGabungan,
  WORKTREE_GABUNG,
} from '../src/core/gabung.ts'
import type { HasilGerbang } from '../src/core/gerbang.ts'
import { bacaKerja, type Kerja, simpanKerja } from '../src/core/kerja.ts'
import {
  batalkanGabungan,
  buatGabungan,
  calonGabungKerja,
  keadaanGabungan,
  keadaanSerah,
  keluarkanDariGabungan,
  lanjutGabungan,
  periksaMergeSemua,
  pushGabungan,
  simpanLinkMrGabungan,
} from '../src/core/kerja-aksi.ts'
import { kerjaLokal } from '../src/core/kerja-lokal.ts'

const V2 = path.join(T.base, 'v2')
const ORIGIN = path.join(T.base, 'origin.git')
const T0 = '2026-11-19T00:00:00.000Z'

function git(dir: string, ...a: string[]) {
  const r = spawnSync('git', ['-C', dir, ...a], { encoding: 'utf8' })
  if (r.status !== 0) throw new Error(`git ${a.join(' ')}: ${r.stderr}`)
  return r.stdout.trim()
}
const tulis = (dir: string, f: string, isi: string) => writeFileSync(path.join(dir, f), isi)

/** Repo v2 sementara: development + tiket-a (bersih), tiket-b dan tiket-c (konflik satu sama lain). */
function siapkanRepo() {
  mkdirSync(V2, { recursive: true })
  spawnSync('git', ['init', '-q', '--bare', ORIGIN])
  git(V2, 'init', '-q', '-b', 'development')
  git(V2, 'config', 'user.email', 'tes@example.com')
  git(V2, 'config', 'user.name', 'Tes')
  git(V2, 'config', 'commit.gpgsign', 'false')
  tulis(V2, 'a.txt', 'dasar\n')
  git(V2, 'add', '.')
  git(V2, 'commit', '-q', '-m', 'dasar')
  git(V2, 'remote', 'add', 'origin', ORIGIN)
  git(V2, 'push', '-q', '-u', 'origin', 'development')
  const cabang = (nama: string, f: string, isi: string) => {
    git(V2, 'switch', '-q', '-c', nama, 'development')
    tulis(V2, f, isi)
    git(V2, 'add', '.')
    git(V2, 'commit', '-q', '-m', `kerja ${nama}`)
    git(V2, 'switch', '-q', 'development')
  }
  cabang('feat/tiket-a', 'fa.txt', 'a\n')
  cabang('feat/tiket-b', 'a.txt', 'sisi b\n')
  cabang('feat/tiket-c', 'a.txt', 'sisi c\n')
}

/** Kerja yang sudah disetujui dan siap digabung. */
function kerja(key: string, branch: string, o: Partial<Kerja> = {}): Kerja {
  const k: Kerja = {
    ...kerjaLokal(key, `Judul ${key}`, 'tes', T0),
    tahap: 'didokumentasikan',
    branch,
    commit: ['abc12345'],
    ...o,
  } as Kerja
  simpanKerja(k)
  return k
}

const ci = (head: string, hasil: HasilGerbang['hasil'] = 'lulus'): HasilGerbang => ({
  tingkat: 'ci',
  hasil,
  at: T0,
  head,
  detik: 1,
  langkah: [{ id: 'x', judul: 'Langkah', hasil: 'lulus', detik: 1 }],
  log: 'x.log',
  catatan: [],
})

beforeAll(() => {
  mkdirSync(path.join(T.base, 'kerja'), { recursive: true })
  siapkanRepo()
})
afterAll(() => rmSync(T.base, { recursive: true, force: true }))

describe('gabungan: fungsi murni', () => {
  const k = (key: string, o: Partial<Kerja> = {}) =>
    ({
      ...kerjaLokal(key, key, 'x', T0),
      tahap: 'didokumentasikan',
      branch: `feat/${key}`,
      commit: ['a'],
      ...o,
    }) as Kerja

  it('calon: hanya yang disetujui, punya commit+branch, belum push/merge, tidak ditunda', () => {
    const semua = [
      k('FMS-1'),
      k('FMS-2', { tahap: 'dikerjakan' }),
      k('FMS-3', { commit: [] }),
      k('FMS-4', { branch: null }),
      k('FMS-5', { push: { at: T0, branch: 'x', head: 'h', remote: null, jumlah: 1 } }),
      k('FMS-6', { ditunda: { at: T0 } as Kerja['ditunda'] }),
      k('FMS-7', { merge: { at: T0, head: 'h' } }),
      k('BUG-1'),
    ]
    expect(calonGabung(semua, null).map((x) => x.key)).toEqual(['FMS-1', 'BUG-1'])
    const aktif = { tiket: [{ key: 'FMS-1', status: 'tergabung' }] } as Gabungan
    expect(calonGabung(semua, aktif).map((x) => x.key)).toEqual(['BUG-1'])
    const keluar = { tiket: [{ key: 'FMS-1', status: 'dikeluarkan' }] } as Gabungan
    expect(calonGabung(semua, keluar).map((x) => x.key)).toEqual(['FMS-1', 'BUG-1'])
  })

  it('langkah berikutnya mengikuti keadaan', () => {
    const g = (o: Partial<Gabungan>, ...st: string[]): Gabungan =>
      ({
        branch: 'feat/gabung-x',
        dibuat: T0,
        base: 'b',
        tiket: st.map((s, i) => ({ key: `FMS-${i}`, branch: 'b', status: s })),
        ...o,
      }) as Gabungan
    expect(langkahGabungan(g({}, 'tergabung', 'konflik')).alasan).toContain('Konflik')
    expect(langkahGabungan(g({}, 'menunggu')).alasan).toContain('lanjutkan')
    expect(langkahGabungan(g({}, 'tergabung'))).toMatchObject({ siapPush: false })
    expect(langkahGabungan(g({}, 'tergabung')).alasan).toContain('gerbang CI')
    expect(langkahGabungan(g({ gerbangCi: ci('h', 'gagal') }, 'tergabung')).siapPush).toBe(false)
    expect(langkahGabungan(g({ gerbangCi: ci('h') }, 'tergabung')).siapPush).toBe(true)
    expect(langkahGabungan(g({ gerbangCi: ci('h') }, 'dikeluarkan')).siapPush).toBe(false)
    const dipush = g({ gerbangCi: ci('h'), push: { at: T0, head: 'h', jumlah: 1 } }, 'tergabung')
    expect(langkahGabungan(dipush).alasan).toContain('buat MR')
    expect(langkahGabungan({ ...dipush, mr: 'https://x/mr/1' }).alasan).toContain('review')
    expect(langkahGabungan({ ...dipush, merge: { at: T0, head: 'h' } }).alasan).toContain(
      'di-merge',
    )
    expect(namaGabunganBawaan('2026-11-19')).toBe('feat/gabung-2026-11-19')
  })

  it('butir Butuh kamu: gabungan aktif, calon ≥ 2, atau tidak ada', () => {
    expect(butuhGabungan(null, 1)).toBeNull()
    expect(butuhGabungan(null, 2)?.alasan).toContain('2 tiket siap digabung')
    const g = { branch: 'feat/g', tiket: [{ key: 'A-1', status: 'konflik' }] } as Gabungan
    expect(butuhGabungan(g, 5)?.alasan).toContain('Konflik')
    const menunggu = {
      ...g,
      tiket: [{ key: 'A-1', status: 'tergabung' }],
      push: { at: T0, head: 'h', jumlah: 1 },
      mr: 'https://x',
    } as Gabungan
    expect(butuhGabungan(menunggu, 0)).toBeNull()
    expect(butuhGabungan({ ...menunggu, merge: { at: T0, head: 'h' } }, 0)).toBeNull()
  })

  it('lajur Dashboard: tiket di gabungan aktif tidak jadi butir ◆C sendiri', () => {
    const periksa = { brief: { ok: true, masalah: [] }, akhir: { ok: true, masalah: [] } } as never
    const kk = k('FMS-1', { gerbang: undefined })
    expect(lajurKerja(kk, periksa).lajur).toBe('butuh')
    expect(lajurKerja(kk, periksa, 'feat/gabung-x')).toMatchObject({
      lajur: 'diam',
      alasan: 'Masuk gabungan feat/gabung-x',
    })
  })
})

describe('gabungan: integrasi git di repo sementara', () => {
  it('worktree gabungan jatuh di sebelah repo temp, bukan repo v2 sungguhan', () => {
    expect(WORKTREE_GABUNG()).toBe(path.join(T.base, 'v2-gabung'))
  })

  it('mulai: bersih tergabung, konflik berhenti + merge dibatalkan, tanpa track', () => {
    const g = mulaiGabungan(
      'feat/gabung-uji',
      [
        { key: 'FMS-1', branch: 'feat/tiket-a' },
        { key: 'FMS-2', branch: 'feat/tiket-b' },
        { key: 'FMS-3', branch: 'feat/tiket-c' },
      ],
      (k) => `Judul ${k}`,
    )
    expect(g.tiket.map((t) => t.status)).toEqual(['tergabung', 'tergabung', 'konflik'])
    expect(g.tiket[2]?.konflik).toEqual(['a.txt'])
    const w = WORKTREE_GABUNG()
    // merge dibatalkan: worktree bersih, tanpa merge setengah jalan
    expect(git(w, 'status', '--porcelain')).toBe('')
    expect(existsSync(path.join(V2, '.git', 'worktrees', 'v2-gabung', 'MERGE_HEAD'))).toBe(false)
    expect(git(w, 'log', '--format=%s', '-3')).toContain('Merge feat/tiket-b (FMS-2: Judul FMS-2)')
    // --no-track: tidak ada upstream
    expect(spawnSync('git', ['-C', w, 'rev-parse', '--abbrev-ref', '@{u}']).status).not.toBe(0)
    expect(git(w, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('feat/gabung-uji')
    // dasar dari origin/development
    expect(git(w, 'merge-base', 'HEAD', 'origin/development')).toBe(g.base)
    // repo v2 utama tak tersentuh: tetap di development, branch gabungan hanya di worktree
    expect(git(V2, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('development')
    expect(headGabung()).toBe(git(w, 'rev-parse', 'HEAD'))
  })

  it('nama branch sah dan tidak terlarang; branch yang sudah ada ditolak', () => {
    const jalan = (b: string) => () =>
      mulaiGabungan(b, [{ key: 'FMS-1', branch: 'feat/tiket-a' }], () => '')
    expect(jalan('-x')).toThrow(/tidak sah/)
    expect(jalan('development')).toThrow(/tidak boleh/)
    expect(jalan('feat/gabung-uji')).toThrow(/sudah ada/)
    expect(() => mulaiGabungan('feat/kosong', [], () => '')).toThrow(/minimal satu/)
  })

  it('alur lengkap lewat kerja-aksi: buat → konflik → keluarkan → gerbang → push (antrean slot) → merge', () => {
    // bersihkan sisa uji sebelumnya: batalkan branch uji agar worktree kembali bersih
    git(WORKTREE_GABUNG(), 'switch', '-q', '--detach', 'origin/development')
    git(WORKTREE_GABUNG(), 'branch', '-D', 'feat/gabung-uji')

    kerja('FMS-1', 'feat/tiket-a', {
      slot: 1,
      url: 'https://plane/FMS-1',
      plane: { id: 'x', projectId: 'p', status: 'Todo' },
    })
    kerja('FMS-2', 'feat/tiket-b', { slot: 2 })
    kerja('FMS-3', 'feat/tiket-c', { slot: 2 })
    kerja('FMS-4', 'feat/tiket-x', { tahap: 'dikerjakan' })
    expect(
      calonGabungKerja()
        .map((k) => k.key)
        .sort(),
    ).toEqual(['FMS-1', 'FMS-2', 'FMS-3'])
    expect(() => buatGabungan('feat/gabung-hari-ini', ['FMS-4'])).toThrow(/Bukan calon/)

    const g = buatGabungan('feat/gabung-hari-ini', ['FMS-1', 'FMS-2', 'FMS-3'])
    expect(g.tiket.map((t) => t.status)).toEqual(['tergabung', 'tergabung', 'konflik'])
    expect(bacaGabungan()?.branch).toBe('feat/gabung-hari-ini')
    expect(() => buatGabungan('feat/lain', ['FMS-1'])).toThrow(/gabungan aktif/)
    expect(bacaKerja('FMS-1').riwayat.at(-1)?.catatan).toContain(
      'Masuk gabungan feat/gabung-hari-ini',
    )

    // kartu Serah tiket tergabung: Push per tiket ditolak, dengan alasan
    const serah = keadaanSerah('FMS-1')
    expect(serah.syarat.boleh).toBe(false)
    expect(serah.syarat.alasan[0]).toContain('di-push lewat gabungan feat/gabung-hari-ini')
    expect(serah.gabungan).toMatchObject({ branch: 'feat/gabung-hari-ini', status: 'tergabung' })

    // konflik: push belum boleh; keluarkan FMS-3 → kembali jadi calon
    let s = keadaanGabungan()
    expect('syarat' in s && s.syarat?.boleh).toBe(false)
    expect('langkah' in s && s.langkah?.alasan).toContain('Konflik')
    expect(() => keluarkanDariGabungan('FMS-1')).toThrow(/sudah tergabung/)
    const g2 = keluarkanDariGabungan('FMS-3')
    expect(g2.tiket.map((t) => t.status)).toEqual(['tergabung', 'tergabung', 'dikeluarkan'])
    expect(calonGabungKerja().map((k) => k.key)).toEqual(['FMS-3'])

    // deskripsi MR gabungan: format 2 (lima kartu) untuk semua tiket tergabung, tanda tanpa Plane
    s = keadaanGabungan()
    if (!('mr' in s) || !s.mr) throw new Error('mr kosong')
    expect(s.mr.judul).toContain('FMS-1 · FMS-2')
    expect(s.mr.isi).toContain('### FMS-1 · Judul FMS-1')
    expect(s.mr.isi).toContain('Tiket: https://plane/FMS-1')
    expect(s.mr.isi).toContain('### FMS-2 · Judul FMS-2')
    expect(s.mr.isi).toContain('Tiket: — (tanpa tiket Plane)')
    expect(s.mr.isi).not.toContain('FMS-3')

    // gerbang CI lulus (disuntik; gerbang sungguhan tak dijalankan di tes), lalu push disuntik
    const w = WORKTREE_GABUNG()
    simpanGabungan({ ...(bacaGabungan() as Gabungan), gerbangCi: ci(git(w, 'rev-parse', 'HEAD')) })
    s = keadaanGabungan()
    expect('syarat' in s && s.syarat?.boleh).toBe(true)
    const dipush: string[] = []
    const antre: [number, string[]][] = []
    pushGabungan({
      pushBranch: (dir, branch) => {
        dipush.push(`${path.basename(dir)}:${branch}`)
        return { ok: true, keluaran: '' }
      },
      setelahLepas: (n, pelepas) => antre.push([n, pelepas]),
    })
    expect(dipush).toEqual(['v2-gabung:feat/gabung-hari-ini'])
    // slot 1 (FMS-1) dan slot 2 (FMS-2) masing-masing satu kali, FMS-3 (dikeluarkan) tak ikut
    expect(antre).toEqual([
      [1, ['FMS-1']],
      [2, ['FMS-2']],
    ])
    expect(bacaKerja('FMS-1').slot).toBeNull()
    expect(bacaKerja('FMS-2').push?.branch).toBe('feat/gabung-hari-ini')
    expect(bacaKerja('FMS-3').push).toBeUndefined()
    expect(bacaKerja('FMS-3').slot).toBe(2)
    expect(() => pushGabungan({ pushBranch: () => ({ ok: true, keluaran: '' }) })).toThrow(
      /Push ditolak/,
    )

    // link MR gabungan tersalin ke semua tiket tergabung
    expect(() => simpanLinkMrGabungan('ftp://x')).toThrow(/https/)
    simpanLinkMrGabungan('https://gitlab/mr/9')
    expect(bacaKerja('FMS-1').mr).toBe('https://gitlab/mr/9')
    expect(bacaKerja('FMS-3').mr).toBeUndefined()
    expect(batalkanGabunganDitolak()).toMatch(/sudah di-push/)

    // deteksi merge: belum ada di origin/development → tidak ada yang berubah
    expect(periksaMergeSemua(() => false)).toEqual([])
    expect(bacaGabungan()?.merge).toBeUndefined()
    // merge terjadi: gabungan ditandai, lalu tiap tiket tergabung tercatat (tanpa FMS-3)
    const diMerge = periksaMergeSemua((_dir, head) => head === bacaGabungan()?.push?.head)
    expect(diMerge.sort()).toEqual(['FMS-1', 'FMS-2'])
    expect(bacaGabungan()?.merge?.head).toBe(bacaGabungan()?.push?.head)
    expect(bacaKerja('FMS-1').merge).toBeTruthy()
    expect(bacaKerja('FMS-3').merge).toBeUndefined()
    expect(langkahGabungan(bacaGabungan() as Gabungan).alasan).toContain('di-merge')
  })

  it('gabungan selesai tidak menghalangi gabungan baru dan diarsipkan', () => {
    const lama = bacaGabungan() as Gabungan
    const g = buatGabungan('feat/gabung-berikut', ['FMS-3'])
    expect(g.tiket[0]?.status).toBe('tergabung')
    const arsip = path.join(T.base, 'kerja', '_gabung-arsip', 'feat__gabung-hari-ini.json')
    expect(JSON.parse(readFileSync(arsip, 'utf8')).branch).toBe(lama.branch)
    expect(bacaGabungan()?.branch).toBe('feat/gabung-berikut')
    // arsipkanGabungan langsung (idempoten)
    arsipkanGabungan(lama)
  })

  it('lanjut setelah konflik diselesaikan manual: tiket ditandai tergabung', () => {
    // bangun gabungan baru: tiket-b bersih, tiket-c konflik, lalu selesaikan konflik di worktree
    git(WORKTREE_GABUNG(), 'switch', '-q', '--detach', 'origin/development')
    simpanGabungan(null)
    kerja('FMS-8', 'feat/tiket-b')
    kerja('FMS-9', 'feat/tiket-c')
    const g = buatGabungan('feat/gabung-konflik', ['FMS-8', 'FMS-9'])
    expect(g.tiket.map((t) => t.status)).toEqual(['tergabung', 'konflik'])
    const w = WORKTREE_GABUNG()
    spawnSync('git', ['-C', w, 'merge', '--no-ff', '-m', 'selesai manual', 'feat/tiket-c'])
    tulis(w, 'a.txt', 'sisi b dan c\n')
    git(w, 'add', '.')
    git(w, 'commit', '-q', '-m', 'Merge feat/tiket-c (FMS-9): konflik diselesaikan')
    const g2 = lanjutGabungan()
    expect(g2.tiket.map((t) => t.status)).toEqual(['tergabung', 'tergabung'])
    expect(g2.gerbangCi).toBeUndefined()
  })

  it('batalkan: worktree kembali ke development, branch gabungan dihapus, berkas hilang', () => {
    batalkanGabungan()
    expect(bacaGabungan()).toBeNull()
    expect(existsSync(path.join(T.base, 'kerja', '_gabung.json'))).toBe(false)
    expect(
      spawnSync('git', ['-C', V2, 'rev-parse', '--verify', '-q', 'feat/gabung-konflik']).status,
    ).not.toBe(0)
    expect(git(WORKTREE_GABUNG(), 'status', '--porcelain')).toBe('')
  })
})

function batalkanGabunganDitolak(): string {
  try {
    batalkanGabungan()
    return 'tidak ditolak'
  } catch (e) {
    return (e as Error).message
  }
}

import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { DATA_CATATAN_KOSONG, tambahCekStaging, tambahKeputusan } from '../src/core/catatan.ts'
import type { HasilGerbang } from '../src/core/gerbang.ts'
import {
  deskripsiMr,
  type KeadaanGit,
  keadaanGit,
  pushBranch,
  syaratPush,
  tanpaKredensial,
} from '../src/core/serah.ts'
import { LARANG_UMUM } from '../src/core/sesi.ts'

const git: KeadaanGit = {
  head: 'abc123',
  branch: 'feat/fms-9',
  bersih: true,
  upstream: null,
  akanDipush: [{ sha: 'abc123', judul: 'feat: x' }],
  remote: 'git@gitlab.com:x/v2.git',
}
const ci = (o: Partial<HasilGerbang> = {}): HasilGerbang => ({
  tingkat: 'ci',
  hasil: 'lulus',
  at: '2026-11-17T04:00:00Z',
  head: 'abc123',
  detik: 180,
  langkah: [{ id: 'be-check', judul: 'Backend: biome', hasil: 'lulus', detik: 2 }],
  log: 'x.log',
  catatan: [],
  ...o,
})

describe('syarat push (R-4.2)', () => {
  it('boleh bila CI hijau atau peringatan pada HEAD yang sama', () => {
    expect(syaratPush({ git, gerbangCi: ci() })).toEqual({ boleh: true, alasan: [] })
    expect(syaratPush({ git, gerbangCi: ci({ hasil: 'peringatan' }) }).boleh).toBe(true)
  })

  it('ditolak: CI merah, belum jalan, sedang jalan, atau commit baru sejak CI', () => {
    expect(syaratPush({ git, gerbangCi: ci({ hasil: 'gagal' }) }).alasan).toEqual([
      'gerbang CI gagal',
    ])
    expect(syaratPush({ git, gerbangCi: null }).alasan).toEqual(['gerbang CI belum dijalankan'])
    expect(syaratPush({ git, gerbangCi: ci(), gerbangBerjalan: true }).alasan).toEqual([
      'gerbang CI sedang berjalan',
    ])
    expect(syaratPush({ git, gerbangCi: ci({ head: 'lama' }) }).alasan).toEqual([
      'ada commit baru sejak gerbang CI terakhir: jalankan ulang',
    ])
  })

  it('ditolak: branch bersama, detached, kotor, atau tanpa commit baru', () => {
    expect(
      syaratPush({ git: { ...git, branch: 'development' }, gerbangCi: ci() }).alasan[0],
    ).toContain('tidak boleh')
    expect(syaratPush({ git: { ...git, branch: null }, gerbangCi: ci() }).alasan[0]).toContain(
      'detached',
    )
    expect(syaratPush({ git: { ...git, bersih: false }, gerbangCi: ci() }).alasan).toEqual([
      'ada perubahan yang belum di-commit',
    ])
    expect(syaratPush({ git: { ...git, akanDipush: [] }, gerbangCi: ci() }).alasan).toEqual([
      'tidak ada commit baru untuk di-push',
    ])
  })

  it('sesi AI tidak bisa memanggil API panel (push) lewat curl', () => {
    expect(LARANG_UMUM).toEqual(
      expect.arrayContaining(['Bash(curl *:5800*)', 'Bash(wget *:5800*)']),
    )
  })

  it('kredensial di URL remote disembunyikan', () => {
    expect(tanpaKredensial('https://user:tok@gitlab.com/x/v2.git')).toBe(
      'https://gitlab.com/x/v2.git',
    )
  })
})

describe('deskripsi MR (R-8.4)', () => {
  const md =
    '## Masalah & penyebab\nMeter diganti.\n## Yang dikerjakan\nTabel baru.\n## Rencana\nrahasia rencana'
  it('satu tiket: masalah, yang dikerjakan, keputusan, verifikasi, commit, setelah deploy, pengujian', () => {
    const data = tambahCekStaging(
      tambahKeputusan(DATA_CATATAN_KOSONG, 'Odometer tetap total', 'ai'),
      'sync-rbac --apply',
    )
    const { judul, isi } = deskripsiMr({
      tiket: [
        {
          key: 'FMS-9',
          judul: 'Ganti meter',
          url: 'https://plane/x/FMS-9',
          md,
          data,
          verifikasi: [{ kriteria: 'Total berlanjut', hasil: 'lulus' }],
        },
      ],
      branch: 'feat/fms-9',
      commit: [{ sha: 'abc12345678', judul: 'feat: x' }],
      gerbangCi: ci({
        hasil: 'peringatan',
        langkah: [
          {
            id: 'fe-test',
            judul: 'Frontend: tes',
            hasil: 'peringatan',
            detik: 9,
            ringkas: 'sama dengan development',
          },
        ],
      }),
    })
    expect(judul).toBe('FMS-9 — Ganti meter')
    for (const bagian of [
      'Meter diganti.',
      'Tabel baru.',
      '- Odometer tetap total _(diambil AI, sudah ditinjau)_',
      '- ✓ Total berlanjut',
      '`abc12345` feat: x',
      '- [ ] sync-rbac --apply',
      '**peringatan**',
      '! Frontend: tes: sama dengan development',
    ])
      expect(isi).toContain(bagian)
    expect(isi).not.toContain('rahasia rencana')
  })

  it('klaster: satu deskripsi untuk beberapa tiket se-branch, cek staging tidak berulang', () => {
    const data = tambahCekStaging(DATA_CATATAN_KOSONG, 'migrasi')
    const t = (key: string) => ({
      key,
      judul: `J ${key}`,
      url: `u/${key}`,
      md,
      data,
      verifikasi: [],
    })
    const { judul, isi } = deskripsiMr({
      tiket: [t('FMS-1'), t('FMS-2')],
      branch: 'feat/meter',
      commit: [],
    })
    expect(judul).toBe('FMS-1 · FMS-2 — feat/meter')
    expect(isi).toContain('### FMS-1 · J FMS-1')
    expect(isi.match(/- \[ \] migrasi/g)).toHaveLength(1)
  })
})

describe('git: keadaan dan push ke remote sementara', () => {
  const tmp = mkdtempSync(path.join(os.tmpdir(), 'serah-'))
  const remote = path.join(tmp, 'remote.git')
  const kerja = path.join(tmp, 'kerja')
  const g = (dir: string, ...a: string[]) =>
    spawnSync('git', ['-C', dir, ...a], { encoding: 'utf8' })
  afterAll(() => rmSync(tmp, { recursive: true, force: true }))

  it('commit yang akan dikirim dihitung dari development, push memasang upstream, lalu kosong', () => {
    spawnSync('git', ['init', '-q', '--bare', remote])
    spawnSync('git', ['init', '-q', '-b', 'development', kerja])
    g(kerja, 'config', 'user.email', 'uji@contoh.test')
    g(kerja, 'config', 'user.name', 'Uji')
    g(kerja, 'commit', '-q', '--allow-empty', '-m', 'awal')
    g(kerja, 'remote', 'add', 'origin', remote)
    g(kerja, 'push', '-q', 'origin', 'development')
    g(kerja, 'fetch', '-q', 'origin')
    g(kerja, 'switch', '-q', '-c', 'feat/fms-9')
    writeFileSync(path.join(kerja, 'a.txt'), 'x')
    g(kerja, 'add', 'a.txt')
    g(kerja, 'commit', '-q', '-m', 'feat: fms-9')

    const k1 = keadaanGit(kerja)
    expect(k1).toMatchObject({ branch: 'feat/fms-9', bersih: true, upstream: null })
    expect(k1.akanDipush.map((c) => c.judul)).toEqual(['feat: fms-9'])

    expect(pushBranch(kerja, 'feat/fms-9', false).ok).toBe(true)
    const k2 = keadaanGit(kerja)
    expect(k2.upstream).toBe('origin/feat/fms-9')
    expect(k2.akanDipush).toEqual([])
    expect(g(remote, 'rev-parse', 'feat/fms-9').stdout.trim()).toBe(k2.head)
  })
})

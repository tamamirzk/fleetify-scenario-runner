import { describe, expect, it } from 'vitest'
import {
  berkasGagalVitest,
  CI_ENV,
  cakupanTesFrontend,
  hitungVitest,
  langkahCi,
  langkahFokus,
  ringkasGerbang,
  sidikCi,
  simpulkan,
} from '../src/core/gerbang.ts'
import { nilaiKomputer, nilaiPrisma, ringkasKesehatan } from '../src/core/kesehatan.ts'

describe('gerbang: langkah', () => {
  it('ci mengulang kelima job .gitlab-ci.yml, termasuk cek sinkron openapi', () => {
    const l = langkahCi('abc', ['Backend/src/x.ts'])
    expect(l.map((x) => x.id)).toEqual([
      'konflik',
      'be-install',
      'be-prisma',
      'be-check',
      'be-typecheck',
      'be-openapi',
      'be-test',
      'fe-install',
      'fe-client',
      'fe-check',
      'fe-typecheck',
      'fe-test',
    ])
    expect(l.find((x) => x.id === 'be-openapi')?.cmd).toContain(
      'git diff --exit-code -- ../Frontend/openapi.json',
    )
    expect(l.find((x) => x.id === 'fe-client')?.cmd).toBe(
      'OPENAPI_SPEC=openapi.json bun run gen:client',
    )
    expect(CI_ENV.NODE_ENV).toBe('test')
  })

  it('tes frontend penuh bila berkas pemicu berubah (mis. i18n), selain itu --changed', () => {
    expect(cakupanTesFrontend(['Frontend/src/shared/i18n/locales/id.json'])).toBe('penuh')
    expect(cakupanTesFrontend(['Frontend/openapi.json'])).toBe('penuh')
    expect(cakupanTesFrontend(['Frontend/src/modules/fleet/x.tsx'])).toBe('terkait')
    const fe = langkahCi('base1', ['Frontend/src/modules/fleet/x.tsx']).find(
      (x) => x.id === 'fe-test',
    )
    expect(fe?.cmd).toContain('--changed base1')
  })

  it('fokus hanya proyek yang berubah; perubahan backend ikut memeriksa tipe frontend', () => {
    expect(langkahFokus('b', ['README.md'])).toEqual([])
    const be = langkahFokus('b', ['Backend/src/a.ts']).map((x) => x.id)
    expect(be).toEqual([
      'be-check',
      'be-typecheck',
      'be-openapi',
      'be-test',
      'fe-client',
      'fe-typecheck',
    ])
    const prisma = langkahFokus('b', ['Backend/prisma/schema/fleet.prisma']).map((x) => x.id)
    expect(prisma[0]).toBe('be-prisma')
    const fe = langkahFokus('b', ["Frontend/src/a b'c.tsx"])
    expect(fe.map((x) => x.id)).toEqual(['fe-client', 'fe-check', 'fe-typecheck', 'fe-test'])
    expect(fe[1]?.cmd).toContain(`'src/a b'\\''c.tsx'`)
  })

  it('sidik CI berubah bila isinya berubah', () => {
    expect(sidikCi('a')).not.toBe(sidikCi('b'))
    expect(sidikCi('a')).toHaveLength(12)
  })
})

describe('gerbang: membaca keluaran vitest', () => {
  const keluaran = `
 FAIL  src/shared/hooks/__tests__/useMediaSrc.test.tsx > useMediaSrc > aborts
 FAIL  src/shared/hooks/__tests__/useMediaSrc.test.tsx > useMediaSrc > reports
\u001b[31m FAIL \u001b[39m src/shared/lib/__tests__/mediaCompression.test.ts > x
 Test Files  2 failed | 509 passed (511)
      Tests  91 failed | 63991 passed (64082)`

  it('berkas gagal unik dan terurut, kode warna diabaikan', () => {
    expect(berkasGagalVitest(keluaran)).toEqual([
      'src/shared/hooks/__tests__/useMediaSrc.test.tsx',
      'src/shared/lib/__tests__/mediaCompression.test.ts',
    ])
  })

  it('angka tes', () => {
    expect(hitungVitest(keluaran)).toEqual({ gagal: 91, lulus: 63991 })
    expect(hitungVitest('      Tests  12 passed (12)')).toEqual({ gagal: 0, lulus: 12 })
    expect(hitungVitest('tidak ada')).toBeNull()
  })
})

describe('gerbang: vonis dan ringkasan', () => {
  const l = (hasil: 'lulus' | 'gagal' | 'peringatan' | 'dilewati') => ({
    id: hasil,
    judul: hasil,
    hasil,
    detik: 1,
  })

  it('gagal/dilewati menolak; peringatan saja tidak', () => {
    expect(simpulkan([l('lulus'), l('peringatan')])).toBe('peringatan')
    expect(simpulkan([l('lulus'), l('dilewati')])).toBe('gagal')
    expect(simpulkan([l('lulus')])).toBe('lulus')
  })

  it('satu baris vonis lalu hanya yang tidak lulus', () => {
    const teks = ringkasGerbang({
      tingkat: 'ci',
      hasil: 'gagal',
      at: '',
      head: '62b36f19abcdef',
      detik: 372,
      log: 'kerja/X/gerbang/ci.log',
      catatan: ['2 berkas belum di-commit'],
      langkah: [
        { id: 'a', judul: 'Backend: biome', hasil: 'lulus', detik: 9 },
        {
          id: 'b',
          judul: 'Backend: openapi sinkron',
          hasil: 'gagal',
          detik: 4,
          ringkas: 'diff --git a/Frontend/openapi.json',
        },
      ],
    })
    expect(teks.split('\n')).toEqual([
      '× gerbang ci 1/2 · 6m12s · 62b36f19 · log: kerja/X/gerbang/ci.log',
      '  × Backend: openapi sinkron: diff --git a/Frontend/openapi.json',
      '  ! 2 berkas belum di-commit',
    ])
  })
})

describe('kesehatan', () => {
  it('Prisma: client lama, server lama, atau segar', () => {
    expect(nilaiPrisma({ skemaTerbaru: 5000, client: 1000, serverMulai: null }).hasil).toBe('gagal')
    const server = nilaiPrisma({ skemaTerbaru: 1000, client: 9000, serverMulai: 2000 })
    expect(server.info).toContain('sebelum client terakhir')
    expect(nilaiPrisma({ skemaTerbaru: 1000, client: 9000, serverMulai: 9500 }).hasil).toBe('lulus')
    expect(nilaiPrisma({ skemaTerbaru: 1, client: null, serverMulai: null }).saran).toContain(
      'db:generate',
    )
  })

  it('komputer hanya memberi peringatan', () => {
    const c = nilaiKomputer({ diskSisaGiB: 17, memoriBebasPersen: 10, beban: 15, cpu: 8 })
    expect(c.map((x) => x.hasil)).toEqual(['peringatan', 'peringatan', 'peringatan'])
    expect(
      nilaiKomputer({ diskSisaGiB: 80, memoriBebasPersen: 50, beban: 2, cpu: 8 }).every(
        (x) => x.hasil === 'lulus',
      ),
    ).toBe(true)
  })

  it('ringkasan: vonis lalu yang bermasalah beserta saran', () => {
    const teks = ringkasKesehatan({
      at: '',
      cek: [
        {
          id: 'postgres',
          nama: 'Postgres',
          hasil: 'gagal',
          info: 'Connection refused',
          saran: 'colima start',
        },
        { id: 'web', nama: 'Web', hasil: 'lulus', info: 'HTTP 200' },
      ],
    })
    expect(teks.split('\n')).toEqual([
      '× kesehatan 1/2',
      '  × Postgres: Connection refused → colima start',
    ])
  })
})

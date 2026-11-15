// Hapus riwayat (bagian B): pagar path, ukuran, hapus jalan / trace, jalan aktif, pemilihan, retensi,
// dan dialog konfirmasi panel.
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { isiKonfirmasi, lebihLama, ringkasHapus } from '../panel/js/riwayat.js'
import {
  daftarJalanDisk,
  hapusJalan,
  hapusTrace,
  type InfoJalan,
  jalurJalan,
  normalRetensi,
  pilihLebihLama,
  pilihSimpan,
  RETENSI_BAWAAN,
  rencanaRetensi,
} from '../src/core/riwayat.ts'

let akar: string
let runs: string
let luar: string
const buat = (runId: string, o: { trace?: number; status?: string; temuan?: number } = {}) => {
  const dir = path.join(runs, runId)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    path.join(dir, 'result.json'),
    JSON.stringify({
      title: runId,
      status: o.status ?? 'selesai',
      started_at: `${runId.split('/')[1]?.slice(0, 10)}T10:00:00Z`,
      trace: o.trace ? 'trace.zip' : undefined,
      findings: Array.from({ length: o.temuan ?? 0 }, () => ({})),
    }),
  )
  writeFileSync(path.join(dir, '01-a.png'), Buffer.alloc(1000))
  if (o.trace) writeFileSync(path.join(dir, 'trace.zip'), Buffer.alloc(o.trace))
  return dir
}

beforeEach(() => {
  akar = mkdtempSync(path.join(tmpdir(), 'sr-riwayat-'))
  runs = path.join(akar, 'runs')
  luar = path.join(akar, 'luar')
  mkdirSync(runs)
  mkdirSync(luar)
})
afterEach(() => rmSync(akar, { recursive: true, force: true }))

describe('pagar path', () => {
  it('id tidak sah dan .. ditolak', () => {
    buat('pinjaman-alat/2026-11-14T10-00-00')
    expect(() => jalurJalan(runs, '../luar/2026-11-14T10-00-00')).toThrow(/tidak sah/)
    expect(() => jalurJalan(runs, 'pinjaman-alat')).toThrow(/tidak sah/)
    expect(() => jalurJalan(runs, '/etc/2026-11-14T10-00-00')).toThrow(/tidak sah/)
    expect(() => jalurJalan(runs, 'pinjaman-alat/2026-11-14T10-00-01')).toThrow(/tidak ada/)
    expect(jalurJalan(runs, 'pinjaman-alat/2026-11-14T10-00-00')).toBe(
      path.join(runs, 'pinjaman-alat/2026-11-14T10-00-00'),
    )
  })
  it('symlink yang menunjuk ke luar runs/ ditolak dan isinya tidak tersentuh', () => {
    mkdirSync(path.join(luar, '2026-11-14T10-00-00'), { recursive: true })
    writeFileSync(path.join(luar, '2026-11-14T10-00-00', 'penting.txt'), 'jangan dihapus')
    symlinkSync(luar, path.join(runs, 'jahat'))
    expect(() => hapusJalan(runs, 'jahat/2026-11-14T10-00-00')).toThrow(/luar folder runs|symlink/)
    expect(existsSync(path.join(luar, '2026-11-14T10-00-00', 'penting.txt'))).toBe(true)
    // Folder jalan yang sendiri berupa symlink ke dalam runs/ juga tidak dihapus.
    buat('pinjaman-alat/2026-11-14T10-00-00')
    mkdirSync(path.join(runs, 'penyesuaian-wo'))
    symlinkSync(
      path.join(runs, 'pinjaman-alat/2026-11-14T10-00-00'),
      path.join(runs, 'penyesuaian-wo/2026-11-14T10-00-00'),
    )
    expect(() => hapusJalan(runs, 'penyesuaian-wo/2026-11-14T10-00-00')).toThrow(/symlink/)
  })
})

describe('hapus', () => {
  it('ukuran, hapus jalan (folder skenario kosong ikut hilang), jalan aktif ditolak', () => {
    buat('pinjaman-alat/2026-11-14T10-00-00', { trace: 5000 })
    buat('penyesuaian-wo/2026-11-14T11-00-00')
    const d = daftarJalanDisk(runs)
    expect(d.map((j) => [j.run_id, j.ukuran, j.punya_trace])).toEqual([
      ['penyesuaian-wo/2026-11-14T11-00-00', expect.any(Number), false],
      ['pinjaman-alat/2026-11-14T10-00-00', expect.any(Number), true],
    ])
    expect(d[1]?.ukuran).toBeGreaterThan(6000)
    expect(() =>
      hapusJalan(
        runs,
        'pinjaman-alat/2026-11-14T10-00-00',
        new Set(['pinjaman-alat/2026-11-14T10-00-00']),
      ),
    ).toThrow(/sedang berjalan/)
    expect(hapusJalan(runs, 'pinjaman-alat/2026-11-14T10-00-00')).toBeGreaterThan(6000)
    expect(existsSync(path.join(runs, 'pinjaman-alat'))).toBe(false)
  })
  it('hapus trace saja: laporan dan screenshot tetap, result.json ditandai', () => {
    const dir = buat('pinjaman-alat/2026-11-14T10-00-00', { trace: 5000 })
    expect(hapusTrace(runs, 'pinjaman-alat/2026-11-14T10-00-00')).toBe(5000)
    expect(existsSync(path.join(dir, 'trace.zip'))).toBe(false)
    expect(existsSync(path.join(dir, '01-a.png'))).toBe(true)
    const r = JSON.parse(readFileSync(path.join(dir, 'result.json'), 'utf8'))
    expect(r.trace).toBeUndefined()
    expect(r.trace_dihapus.byte).toBe(5000)
    expect(daftarJalanDisk(runs)[0]?.trace_dihapus).toBe(true)
  })
})

const j = (run_id: string, o: Partial<InfoJalan> = {}): InfoJalan => ({
  run_id,
  scenario: run_id.split('/')[0] ?? '',
  title: run_id,
  status: 'selesai',
  started_at: `${run_id.split('/')[1]?.slice(0, 10)}T10:00:00Z`,
  ended_at: null,
  ukuran: 1000,
  ukuran_trace: 800,
  punya_trace: true,
  trace_dihapus: false,
  temuan: 0,
  ...o,
})

describe('pemilihan dan retensi', () => {
  const list = Array.from({ length: 6 }, (_, i) =>
    j(`pinjaman-alat/2026-11-${String(10 + i).padStart(2, '0')}T10-00-00`),
  )
  it('lebih lama dari N hari; simpan N terbaru per skenario', () => {
    expect(pilihLebihLama(list, 3, Date.parse('2026-11-16T08:00:00Z'))).toEqual([
      'pinjaman-alat/2026-11-10T10-00-00',
      'pinjaman-alat/2026-11-11T10-00-00',
      'pinjaman-alat/2026-11-12T10-00-00',
    ])
    expect(pilihSimpan(list, 4).sort()).toEqual([
      'pinjaman-alat/2026-11-10T10-00-00',
      'pinjaman-alat/2026-11-11T10-00-00',
    ])
  })
  it('retensi: hapus di luar simpan, trace di luar N kecuali gagal; jalan bertemuan dan aktif tidak disentuh', () => {
    const l = [...list]
    l[1] = { ...l[1], status: 'gagal' } as InfoJalan // 2026-11-11, gagal
    l[0] = { ...l[0], temuan: 2 } as InfoJalan // 2026-11-10, bertemuan
    const r = rencanaRetensi(
      l,
      { aktif: true, simpan: 4, trace: 2, traceGagal: true },
      new Set(['pinjaman-alat/2026-11-15T10-00-00']),
    )
    expect(r.hapus).toEqual(['pinjaman-alat/2026-11-11T10-00-00'])
    expect(r.hapusTrace.sort()).toEqual([
      'pinjaman-alat/2026-11-12T10-00-00',
      'pinjaman-alat/2026-11-13T10-00-00',
    ])
    expect(rencanaRetensi(l, { ...RETENSI_BAWAAN, aktif: false })).toEqual({
      hapus: [],
      hapusTrace: [],
    })
  })
  it('setelan retensi dinormalkan (bawaan 10/3, trace ≤ simpan)', () => {
    expect(normalRetensi({})).toEqual({ aktif: true, simpan: 10, trace: 3, traceGagal: true })
    expect(normalRetensi({ simpan: 2, trace: 9 })).toMatchObject({ simpan: 2, trace: 2 })
    expect(normalRetensi({ simpan: -1, aktif: false }).simpan).toBe(10)
  })
})

describe('panel: konfirmasi hapus', () => {
  it('peringatan khusus untuk jalan bertemuan; jalan aktif dilewati', () => {
    const items = [
      j('pinjaman-alat/2026-11-10T10-00-00', { temuan: 1 }),
      j('pinjaman-alat/2026-11-11T10-00-00'),
      j('pinjaman-alat/2026-11-12T10-00-00'),
    ]
    const h = isiKonfirmasi(items, 'jalan', new Set(['pinjaman-alat/2026-11-12T10-00-00']))
    expect(h).toContain('Hapus <b>2 jalan</b>')
    expect(h).toContain('1 jalan punya temuan tercatat')
    expect(h).toContain('docs/TEMUAN.md tetap ada')
    expect(h).toContain('1 jalan dilewati karena sedang berjalan')
    expect(ringkasHapus(items, 'trace').byte).toBe(2400)
    expect(isiKonfirmasi([j('a/2026-11-10T10-00-00', { punya_trace: false })], 'trace')).toContain(
      'tidak punya trace',
    )
  })
  it('lebih lama dari N hari (panel)', () => {
    const items = [j('pinjaman-alat/2026-10-01T10-00-00'), j('pinjaman-alat/2026-11-14T10-00-00')]
    expect(
      lebihLama(items, 30, Date.parse('2026-11-15T00:00:00Z')).map((x: InfoJalan) => x.run_id),
    ).toEqual(['pinjaman-alat/2026-10-01T10-00-00'])
  })
})

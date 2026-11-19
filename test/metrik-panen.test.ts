import { describe, expect, it } from 'vitest'
import { tabelMetrik } from '../panel/js/dasbor.js'
import { DATA_CATATAN_KOSONG, tambahCekStaging, tambahKeputusan } from '../src/core/catatan.ts'
import { durasiTahap, jumlahToken, tahapMundur } from '../src/core/metrik.ts'
import { isiIndeks, isiPanen, namaBerkasPanen, tebakModul } from '../src/core/panen.ts'

const J = 3_600_000

describe('metrik per tiket (R-9.3)', () => {
  const r = [
    { at: '2026-11-16T00:00:00Z', tahap: 'diambil' as const },
    { at: '2026-11-16T01:00:00Z', tahap: 'dipelajari' as const },
    { at: '2026-11-16T03:00:00Z', tahap: 'dikerjakan' as const },
    { at: '2026-11-16T06:00:00Z', tahap: 'diverifikasi' as const },
    { at: '2026-11-16T07:00:00Z', tahap: 'dikerjakan' as const },
    { at: '2026-11-16T08:00:00Z', tahap: 'selesai' as const },
  ]

  it('lama per tahap dijumlahkan; Selesai tidak dihitung; tahap aktif sampai kini', () => {
    expect(durasiTahap(r, Date.parse('2026-11-17T00:00:00Z'))).toEqual({
      diambil: J,
      dipelajari: 2 * J,
      dikerjakan: 4 * J,
      diverifikasi: J,
    })
    expect(durasiTahap(r.slice(0, 2), Date.parse('2026-11-16T05:00:00Z'))).toEqual({
      diambil: J,
      dipelajari: 4 * J,
    })
  })

  it('kerja ulang: tahap mundur dihitung', () => {
    expect(tahapMundur(r)).toBe(1)
  })

  it('token dari transkrip: pesan yang sama dihitung sekali, baris rusak diabaikan', () => {
    const baris = (id: string, i: number, o: number) =>
      JSON.stringify({
        message: {
          id,
          usage: {
            input_tokens: i,
            output_tokens: o,
            cache_read_input_tokens: 100,
            cache_creation_input_tokens: 10,
          },
        },
      })
    const jsonl = [
      baris('m1', 5, 50),
      baris('m1', 5, 50),
      baris('m2', 7, 70),
      '{rusak "usage"',
      '{"type":"user"}',
    ].join('\n')
    expect(jumlahToken(jsonl)).toEqual({ input: 12, output: 120, cacheBaca: 200, cacheTulis: 20 })
  })

  it('tabel Statistik: lama, total, kerja ulang, token atau –', () => {
    const h = tabelMetrik([
      {
        key: 'FMS-9',
        judul: 'J',
        tahap: 'dikerjakan',
        durasi: { dipelajari: 2 * J, dikerjakan: 30 * J },
        totalMs: 32 * J,
        kerjaUlang: { tahapMundur: 1, mintaUbah: 2, gerbangCiGagal: false },
        token: { input: 1000, output: 4000, cacheBaca: 2_000_000, cacheTulis: 0 },
      },
    ])
    for (const x of [
      'href="#/kerja/FMS-9"',
      '2.0 j',
      '1.3 h',
      'mundur 1 · minta ubah 2',
      '2.0 jt masuk · 4 rb keluar',
      'kerja di chat VS Code tidak terhubung',
    ])
      expect(h).toContain(x)
    expect(tabelMetrik([])).toContain('Belum ada kerja')
  })
})

describe('panen ke docs-site (R-8.3)', () => {
  it('modul ditebak dari awal judul MBL; ragu → null', () => {
    expect(tebakModul('[MBL] Fleet - Membedakan Input Odometer', null)).toBe('fleet')
    expect(tebakModul('[MBL] Workshop - Konfigurasi Pemeriksaan Order', null)).toBe('work-order')
    expect(tebakModul('Sesuatu yang lain', 'tidak ada kata kunci')).toBeNull()
    expect(namaBerkasPanen('FMS-105')).toBe('fms-105.md')
  })

  it('isi: meta, masalah, keputusan (tulisan + data), yang dikerjakan, verifikasi, cek staging; rencana tidak ikut', () => {
    const md =
      '## Masalah & penyebab\nMeter diganti.\n## Rencana\nrahasia\n## Keputusan\nOdometer tetap total.\n## Yang dikerjakan\nTabel baru.\n## Perlu diperhatikan\n<!-- p -->\nMigrasi besar.'
    const data = tambahCekStaging(
      tambahKeputusan(DATA_CATATAN_KOSONG, 'Merge, bukan rebase', 'ai'),
      'sync-rbac',
    )
    const isi = isiPanen(
      {
        key: 'FMS-9',
        judul: 'Ganti meter',
        url: 'https://plane/x',
        branch: 'feat/x',
        commit: ['abc12345678'],
        mr: 'https://gitlab.com/x/-/merge_requests/1',
        tahap: 'Didokumentasikan',
        md,
        data,
        verifikasi: [{ kriteria: 'Total', hasil: 'lulus' }],
      },
      '2026-11-17',
    )
    for (const x of [
      '# FMS-9 · Ganti meter',
      '| MR | [gitlab.com/x/-/merge_requests/1]',
      '`abc12345`',
      'Meter diganti.',
      'Odometer tetap total.',
      '- Merge, bukan rebase _(diambil AI, ditinjau Tams)_',
      'Tabel baru.',
      'Migrasi besar.',
      '- ✓ Total',
      '- [ ] sync-rbac',
      'bun run kerja panen FMS-9 --tulis',
    ])
      expect(isi).toContain(x)
    expect(isi).not.toContain('rahasia')
    expect(isi).not.toContain('<!--')
  })

  it('kerja tanpa tiket Plane: tanpa tautan kosong', () => {
    const isi = isiPanen(
      {
        key: 'FMS-0',
        judul: 'Bug dari chat',
        url: '',
        branch: null,
        commit: [],
        tahap: 'Dikerjakan',
        md: null,
        data: DATA_CATATAN_KOSONG,
        verifikasi: [],
      },
      '2026-11-17',
    )
    expect(isi).toContain('| Tiket | FMS-0 (tanpa tiket Plane) |')
    expect(isi).not.toContain('[FMS-0]()')
  })

  it('indeks menautkan berkas per tiket', () => {
    expect(isiIndeks('fleet', [{ nama: 'fms-105.md', judul: 'FMS-105 · Meter' }])).toContain(
      '- [FMS-105 · Meter](./fms-105.md)',
    )
  })
})

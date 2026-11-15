// Transaksi database: jejak baris per tenant, pernyataan data, susunan transaksi laporan, silang.
import { describe, expect, it } from 'vitest'
import { silangLangkah, sumberTransaksi, susunDataLaporan } from '../src/core/laporan-data.ts'
import type {
  DbLangkah,
  HasilCek,
  RequestTulis,
  RunResult,
  StepResult,
} from '../src/core/run-types.ts'
import { PernyataanSchema } from '../src/core/skema.ts'
import {
  cocokNilaiDb,
  diffJejak,
  kunciBaris,
  nilaiPernyataan,
  sqlPernyataan,
  susunSnapshot,
} from '../src/pemeriksaan/jejak.ts'

describe('jejak baris', () => {
  const pk = { tool_loans: ['id'], links: [] as string[] }
  const a = susunSnapshot(
    [
      { t: 'tool_loans', j: { id: 'L1', company_id: 'T', returned_qty: 0, status: 'dipinjam' } },
      { t: 'tool_loans', j: { id: 'L2', company_id: 'T', returned_qty: 0, status: 'dipinjam' } },
      { t: 'links', j: { a: 1, b: 2 } },
    ],
    pk,
  )
  const b = susunSnapshot(
    [
      {
        t: 'tool_loans',
        j: { id: 'L1', company_id: 'T', returned_qty: 1, status: 'kembali_sebagian' },
      },
      { t: 'tool_loans', j: { id: 'L3', company_id: 'T', returned_qty: 0, status: 'dipinjam' } },
      { t: 'links', j: { a: 1, b: 2 } },
    ],
    pk,
  )

  it('kunci = kunci primer; tanpa kunci primer = isi baris', () => {
    expect(kunciBaris({ id: 'x', n: 1 }, ['id'])).toBe('x')
    expect(kunciBaris({ a: 1 }, [])).toBe('{"a":1}')
  })

  it('INSERT, UPDATE (kolom lama → baru), DELETE per tabel; tabel tanpa perubahan dilewati', () => {
    const d = diffJejak(a, b)
    expect(d).toHaveLength(1)
    const t = d[0]
    expect(t).toMatchObject({ tabel: 'tool_loans', insert: 1, update: 1, delete: 1 })
    const up = t?.baris.find((x) => x.operasi === 'UPDATE')
    expect(up?.kolom).toEqual([
      { kolom: 'returned_qty', dari: 0, ke: 1 },
      { kolom: 'status', dari: 'dipinjam', ke: 'kembali_sebagian' },
    ])
    // company_id (kolom tenant) tidak ditampilkan di baris baru/hapus.
    expect(t?.baris.find((x) => x.operasi === 'INSERT')?.kolom.map((k) => k.kolom)).not.toContain(
      'company_id',
    )
    expect(diffJejak(b, b)).toEqual([])
  })
})

describe('pernyataan data', () => {
  it('skema: kolom+diharapkan atau jumlah', () => {
    const dasar = { judul: 'Sisa pinjaman = 1', tabel: 'tool_loans', cocok: { id: '{p.id}' } }
    expect(
      PernyataanSchema.safeParse({ ...dasar, kolom: 'returned_qty', diharapkan: '1' }).success,
    ).toBe(true)
    expect(PernyataanSchema.safeParse({ ...dasar, jumlah: 2 }).success).toBe(true)
    expect(PernyataanSchema.safeParse({ ...dasar, kolom: 'x' }).success).toBe(false)
    expect(
      PernyataanSchema.safeParse({ ...dasar, jumlah: 1, kolom: 'x', diharapkan: '1' }).success,
    ).toBe(false)
    expect(PernyataanSchema.safeParse({ ...dasar, tabel: 'drop table', jumlah: 1 }).success).toBe(
      false,
    )
    expect(PernyataanSchema.safeParse({ ...dasar, cocok: {}, jumlah: 1 }).success).toBe(false)
  })

  it('SQL baca-saja dibatasi tenant dan berparameter; nama tidak sah ditolak', () => {
    const q = sqlPernyataan({
      id: '5.d1',
      judul: 'x',
      tabel: 'tool_loans',
      cocok: { id: 'L1', closed_at: null },
      kolom: 'returned_qty',
      diharapkan: '1',
    })
    expect(q?.sql).toBe(
      'SELECT t.returned_qty::text AS v FROM tool_loans t WHERE t.company_id = $1::uuid AND t.id::text = $2::text AND t.closed_at IS NULL LIMIT 50',
    )
    expect(q?.params).toEqual(['L1', null])
    expect(
      sqlPernyataan({ id: 'a', judul: 'x', tabel: 'a;b', cocok: { id: 1 }, jumlah: 1 }),
    ).toBeNull()
  })

  it('penilaian: angka sebagai angka, pola, jumlah baris, tanpa baris', () => {
    expect(cocokNilaiDb('1.000', '1')).toBe(true)
    expect(cocokNilaiDb('OPEN', 'open')).toBe(true)
    expect(cocokNilaiDb('PR-2026-0001', '/^PR-/')).toBe(true)
    expect(cocokNilaiDb(null, '1')).toBe(false)
    const p = {
      id: '5.d1',
      judul: 'Sisa',
      tabel: 't',
      cocok: { id: 1 },
      kolom: 'q',
      diharapkan: '1',
    }
    expect(nilaiPernyataan(p, 5, ['1'])).toMatchObject({ lulus: true, terlihat: '1' })
    expect(nilaiPernyataan(p, 5, ['2'])).toMatchObject({ lulus: false, terlihat: '2' })
    expect(nilaiPernyataan(p, 5, [])).toMatchObject({
      lulus: false,
      terlihat: 'tidak ada baris yang cocok',
    })
    expect(nilaiPernyataan({ ...p, jumlah: 2 }, 5, ['2'])).toMatchObject({
      lulus: true,
      diharapkan: '2 baris',
    })
  })
})

const rq = (sumber: RequestTulis['sumber'], status = 200): RequestTulis => ({
  method: 'POST',
  path: '/x',
  pathAsli: '/x',
  status,
  durasiMs: 10,
  waktu: '2026-11-14T10:00:00Z',
  sumber,
})
const db = (extra: Partial<DbLangkah> = {}): DbLangkah => ({
  status: 'ok',
  pelanggaran: [],
  sembuh: [],
  dokumen: [],
  galat: [],
  durasiMs: 30,
  waktu: '2026-11-14T10:00:05Z',
  ...extra,
})
const perubahan = (tabel: string, n: number) => ({
  tabel,
  insert: 0,
  update: n,
  delete: 0,
  baris: Array.from({ length: n }, (_, i) => ({
    kunci: `${i}`,
    operasi: 'UPDATE' as const,
    kolom: [{ kolom: 'q', dari: 0, ke: 1 }],
  })),
})
const cekUi = (lulus: boolean): HasilCek => ({
  id: '5.1',
  langkah: 5,
  jenis: 'nilai',
  sumber: 'cek',
  judul: 'Sisa',
  diharapkan: 'sisa 1',
  terlihat: lulus ? 'sisa 1' : 'sisa 2',
  lulus,
  screenshot: null,
  bbox: null,
  waktu: '',
})
const pernyataan = (lulus: boolean) => ({
  id: '5.d1',
  judul: 'Sisa = 1',
  langkah: 5,
  lulus,
  diharapkan: '1',
  terlihat: lulus ? '1' : '2',
})

describe('transaksi laporan', () => {
  it('sumber dari request: layar, api, layar+api, sistem; Siapkan = api', () => {
    expect(sumberTransaksi([rq('browser')], false)).toBe('layar')
    expect(sumberTransaksi([rq('api')], false)).toBe('api')
    expect(sumberTransaksi([rq('api'), rq('browser')], false)).toBe('layar+api')
    expect(sumberTransaksi([], false)).toBe('sistem')
    expect(sumberTransaksi([], false, 0)).toBe('tanpa')
    expect(sumberTransaksi([], true)).toBe('api')
  })

  const step = (n: number, extra: Partial<StepResult> = {}) =>
    ({ n, title: `L${n}`, status: 'lulus', cek: [], ...extra }) as unknown as StepResult

  it('nomor urut, tabel, operasi, baris, request terburuk, pernyataan; langkah tanpa apa pun dilewati', () => {
    const r = {
      status: 'gagal',
      findings: [],
      duration_ms: 1,
      sasaran: { nama: 'lokal' },
      pemeriksaan: { status: 'lulus' },
      pra: [
        { label: 'Siapkan', requests: [rq('api')], db: db({ perubahan: [perubahan('items', 2)] }) },
      ],
      steps: [
        step(1),
        step(2, { requests: [rq('browser'), rq('browser', 422)], db: db({ perubahan: [] }) }),
        step(5, {
          status: 'gagal',
          cek: [cekUi(false)],
          requests: [rq('browser')],
          db: db({
            perubahan: [perubahan('tool_loans', 1), perubahan('stock_ledger', 1)],
            pernyataan: [pernyataan(true)],
          }),
        }),
      ],
    } as unknown as RunResult
    const d = susunDataLaporan(r)
    expect(d.db.status).toBe('tersedia')
    expect(d.transaksi.map((t) => [t.no, t.label, t.sumber, t.baris])).toEqual([
      [1, 'Siapkan', 'api', 2],
      [2, '2', 'layar', 0],
      [3, '5', 'layar', 2],
    ])
    expect(d.transaksi[1]?.request).toEqual({ jumlah: 2, terburuk: '4xx' })
    expect(d.transaksi[2]?.tabel).toEqual(['tool_loans', 'stock_ledger'])
    expect(d.transaksi[2]?.operasi).toEqual(['UPDATE'])
    expect(d.ringkasan.db).toEqual({ transaksi: 3, baris: 4, cocok: 1, total: 1 })
    expect(d.tabel).toEqual([
      { tabel: 'items', baris: 2 },
      { tabel: 'tool_loans', baris: 1 },
      { tabel: 'stock_ledger', baris: 1 },
    ])
    // Telusur dua arah: cek UI langkah 5 → transaksi #3.
    expect(d.langkah.find((l) => l.n === 5)?.transaksi).toBe(3)
    expect(d.langkah.find((l) => l.n === 1)?.transaksi).toBeNull()
    expect(d.ringkasan.silang).toEqual({
      langkah: 5,
      jenis: 'data_benar_tampilan_salah',
      teks: 'Data benar, tampilan salah',
    })
  })

  it('silang per langkah', () => {
    const s = (ui: boolean, p: boolean[], pelanggaran = 0) =>
      ({
        cek: [cekUi(ui)],
        db: db({
          pernyataan: p.map(pernyataan),
          pelanggaran: Array.from({ length: pelanggaran }, () => ({
            id: 'x',
            judul: '',
            keterangan: '',
            baris: [],
          })),
        }),
      }) as unknown as StepResult
    expect(silangLangkah(s(false, [true]))).toBe('data_benar_tampilan_salah')
    expect(silangLangkah(s(true, [false]))).toBe('tampilan_sesuai_data_salah')
    expect(silangLangkah(s(true, [], 1))).toBe('tampilan_sesuai_data_salah')
    expect(silangLangkah(s(false, [false]))).toBe('data_dan_tampilan_salah')
    // Tanpa pernyataan data, kebenaran data tidak diketahui.
    expect(silangLangkah(s(false, []))).toBeNull()
    expect(silangLangkah(s(true, [true]))).toBeNull()
  })

  it('Pemeriksaan dilewati: transaksi tidak tersedia', () => {
    const r = {
      status: 'selesai',
      findings: [],
      duration_ms: 1,
      pemeriksaan: { status: 'dilewati' },
      steps: [],
    } as unknown as RunResult
    expect(susunDataLaporan(r).db.status).toBe('dilewati')
  })

  it('jejak dimatikan (melewati batas baris): alasan tampil di laporan', () => {
    const r = {
      status: 'selesai',
      findings: [],
      duration_ms: 1,
      pemeriksaan: { status: 'lulus', jejakMati: 'jejak baris dilewati: 90.000 baris' },
      steps: [],
    } as unknown as RunResult
    const db = susunDataLaporan(r).db
    expect(db.status).toBe('galat')
    expect(db.pesan).toContain('90.000 baris')
  })
})

// Layar Laporan: render murni Pemeriksaan UI dan Transaksi database, saling tertaut.
import { describe, expect, it } from 'vitest'
import {
  cekTerpilih,
  diffHtml,
  kartuCek,
  kartuRingkasan,
  kartuTransaksi,
  kotakMerah,
  langkahAwal,
  penjelasanCek,
  relHasil,
  ringkasTabel,
  saringTransaksi,
  selTabel,
  subJudul,
  tabelTransaksi,
} from '../panel/js/laporan.js'
import { susunDataLaporan } from '../src/core/laporan-data.ts'
import type { HasilCek, RunResult } from '../src/core/run-types.ts'

const cek = (id: string, lulus: boolean | null, extra: Partial<HasilCek> = {}): HasilCek => ({
  id,
  langkah: Number(id.split('.')[0]),
  jenis: 'nilai',
  sumber: 'cek',
  judul: `Cek ${id}`,
  diharapkan: 'sisa 1',
  terlihat: lulus ? 'sisa 1' : 'sisa 2',
  lulus,
  screenshot: '05-cek.png',
  bbox: { x: 0.5, y: 0.25, w: 0.1, h: 0.05 },
  waktu: '2026-11-14T02:23:08Z',
  ...extra,
})
const ubah = (tabel: string) => ({
  tabel,
  insert: 0,
  update: 1,
  delete: 0,
  baris: [
    {
      kunci: '4412abcd-0000-0000-0000-000000000000',
      operasi: 'UPDATE' as const,
      kolom: [
        { kolom: 'returned_qty', dari: 0, ke: 1 },
        { kolom: 'updated_at', dari: 'a', ke: 'b' },
      ],
    },
  ],
})
const run = {
  run_id: 'pinjaman-alat/2026-11-13T09-20-00',
  scenario: 'pinjaman-alat',
  title: 'Pinjaman alat per peminjam',
  status: 'gagal',
  started_at: '2026-11-13T02:20:00Z',
  ended_at: '2026-11-13T02:24:12Z',
  duration_ms: 252_000,
  findings: [{}],
  trace: 'trace.zip',
  sasaran: { nama: 'lokal' },
  pemeriksaan: { status: 'lulus' },
  steps: [
    { n: 1, title: 'MR Draf', status: 'lulus', cek: [cek('1.1', true)], requests: [] },
    {
      n: 5,
      title: 'Made mengembalikan 1 dari 2 Torque Wrench',
      who_name: 'Wati (Penjaga Gudang)',
      status: 'gagal',
      cek: [cek('5.1', true), cek('5.2', false)],
      requests: [
        {
          method: 'PATCH',
          path: '/tool-loans/{id}',
          pathAsli: '/tool-loans/x',
          status: 200,
          durasiMs: 38,
          waktu: '2026-11-13T02:23:04Z',
          sumber: 'browser',
        },
      ],
      db: {
        status: 'ok',
        pelanggaran: [],
        sembuh: [],
        dokumen: [],
        galat: [],
        durasiMs: 38,
        waktu: '2026-11-13T02:23:05Z',
        perubahan: [ubah('tool_loans'), ubah('stock_ledger')],
        pernyataan: [
          {
            id: '5.d1',
            judul: 'Sisa pinjaman Made = 1',
            langkah: 5,
            lulus: true,
            diharapkan: '1',
            terlihat: '1',
          },
        ],
      },
    },
    { n: 6, title: 'Scanner kembali', status: 'menunggu', cek: [] },
  ],
} as unknown as RunResult
const ld = susunDataLaporan(run)

describe('laporan · Pemeriksaan UI', () => {
  it('rel memakai hasil cek; langkah awal = gagal pertama; cek terpilih = gagal pertama', () => {
    const h = relHasil(run, ld, 5)
    expect(h).toContain('s-lulus" data-n="1"')
    expect(h).toContain('s-gagal pilih" data-n="5"')
    expect(h).toContain('s-menunggu" data-n="6"')
    expect(langkahAwal(ld)).toBe(5)
    expect(cekTerpilih(ld, 5)?.id).toBe('5.2')
    expect(cekTerpilih(ld, 5, '5.1')?.id).toBe('5.1')
  })

  it('kotak merah dari bbox', () => {
    expect(kotakMerah({ x: 0.5, y: 0.25, w: 0.1, h: 0.05 })).toEqual({
      left: '50%',
      top: '25%',
      width: '10%',
      height: '5%',
    })
    expect(kotakMerah(null)).toBeNull()
  })

  it('ringkasan: hasil + silang, UI x/y, Database x/y, Temuan', () => {
    const h = kartuRingkasan(run, ld)
    expect(h).toContain('st-chip bad">Gagal')
    expect(h).toContain('Data benar, tampilan salah · langkah 5')
    expect(h).toContain('2<small> / 3</small>')
    expect(h).toContain('1<small> / 1</small>')
  })

  it('detail cek: Diharapkan vs Terlihat (merah), penjelasan silang, tautan ke transaksi yang sama', () => {
    const h = kartuCek(run, ld, cekTerpilih(ld, 5), { trace: true })
    expect(h).toContain('Langkah 5 · cek 5.2 · Wati (Penjaga Gudang)')
    expect(h).toContain('dvt-b gagal')
    expect(h).toContain(
      'Database sudah mencatat yang dinyatakan (1/1 pernyataan cocok, transaksi #1)',
    )
    expect(h).toContain(
      'href="#/laporan/pinjaman-alat/2026-11-13T09-20-00/db/1">Lihat transaksi #1',
    )
    expect(h).toContain('id="lp-trace"')
  })

  it('penjelasan jujur tanpa pernyataan data dan untuk cek manual', () => {
    expect(penjelasanCek(cek('2.1', false), { silang: null }, null)).toContain(
      'Tidak ada perubahan data tercatat',
    )
    expect(penjelasanCek(cek('2.1', false), { silang: null }, null)).toContain('tidak diklaim')
    expect(penjelasanCek(cek('2.0', null), null, null)).toContain('Tidak diperiksa otomatis')
  })

  it('sub judul toolbar', () => {
    expect(subJudul(run, ld, 'ui')).toContain('4 mnt 12 dtk')
    expect(subJudul(run, ld, 'db')).toBe('1 transaksi · 2 baris berubah · request terburuk 2xx')
  })
})

describe('laporan · Transaksi database', () => {
  it('tabel: baris terpilih disorot, request, pernyataan; sel tabel ringkas', () => {
    const h = tabelTransaksi(ld.transaksi, 1)
    expect(h).toContain('class="pilih" data-trx="1"')
    expect(h).toContain('1 · 2xx')
    expect(h).toContain('1 / 1')
    expect(ringkasTabel(['a', 'b', 'c', 'd', 'e'])).toBe('a, b, c +2 tabel')
    expect(selTabel(['a', 'b', 'c', 'd'])).toBe(
      '<span class="tb-n">a</span><span class="tb-n">b</span><span class="tb-n">c</span><span class="tb-n dim">+1 tabel</span>',
    )
  })

  it('saring sumber dan cari tabel/kolom', () => {
    expect(saringTransaksi(ld.transaksi, 'api')).toHaveLength(0)
    expect(saringTransaksi(ld.transaksi, 'layar')).toHaveLength(1)
    expect(saringTransaksi(ld.transaksi, 'semua', 'returned')).toHaveLength(1)
    expect(saringTransaksi(ld.transaksi, 'semua', 'tidak_ada')).toHaveLength(0)
  })

  it('diff kolom lama → baru, updated_at disembunyikan', () => {
    const h = diffHtml(ld.transaksi[0]?.perubahan ?? [])
    expect(h).toContain(
      '<div class="df-kepala"><span class="mono">tool_loans</span> · id 4412abcd…</div>',
    )
    expect(h).toContain(
      '<tr><th scope="row">returned_qty</th><td><span class="lama">0</span> <span aria-hidden="true">→</span><span class="sr"> menjadi </span> <span class="baru">1</span></td></tr>',
    )
    expect(h).toContain('updated_at</th><td class="dim">ikut berubah')
  })

  it('detail transaksi: pernyataan, request, catatan silang menaut ke cek UI yang sama', () => {
    const h = kartuTransaksi(run, ld, ld.transaksi[0])
    expect(h).toContain('Transaksi #1 · langkah 5 · Layar')
    expect(h).toContain('<h2>Perubahan data <span class="dim">· 2 baris</span></h2>')
    expect(h).toContain('<h2>Pernyataan data <span class="dim">· 1/1 cocok</span></h2>')
    expect(h).toContain('<h2>Catatan silang ke cek UI</h2>')
    expect(h).toContain('Sisa pinjaman Made = 1')
    expect(h).toContain('PATCH')
    expect(h).toContain('Data benar, tetapi layar langkah 5 menampilkan “sisa 2”')
    expect(h).toContain(
      'href="#/laporan/pinjaman-alat/2026-11-13T09-20-00/ui/5.2">Lihat cek UI 5.2',
    )
  })
})

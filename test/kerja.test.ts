// Kerja per tiket (kerja/<KEY>/) dan Dasbor operasional: fungsi murni model, beda DB, komentar Plane,
// susunan dasbor, dan HTML halaman panel.
import { describe, expect, it } from 'vitest'
import {
  deretMini,
  gauge,
  halamanDasbor,
  hasilKerja,
  heatmap,
  mingguProduktif,
  panelAktif,
  penandaTahap,
  radar,
} from '../panel/js/dasbor.js'
import { bandingDb, halamanKerja, langkahTahap, mdRingan } from '../panel/js/kerja.js'
import { aksiKerja } from '../panel/js/tugas.js'
import {
  bacaTemuan,
  harianJalan,
  ringkasHarian,
  susunDasbor,
  tglLokal,
} from '../src/core/dasbor.ts'
import {
  bedaBaris,
  dirKerja,
  hitungTahap,
  htmlKeTeks,
  type Kerja,
  kerjaDariTiket,
  komentarHtml,
  pindahTahap,
  TargetSchema,
} from '../src/core/kerja.ts'

const tiket = {
  key: 'FMS-87',
  id: 'isu-1',
  projectId: 'proj-1',
  judul: 'Lewati pemeriksaan',
  deskripsiHtml: '<p>Latar <b>belakang</b></p><ul><li>Satu</li><li>Dua &amp; tiga</li></ul>',
  status: 'Ready in Staging and for Testing',
  url: 'https://plane/x/FMS-87',
}

const kerjaContoh = (o: Partial<Kerja> = {}): Kerja => ({
  ...kerjaDariTiket(tiket, null).kerja,
  ...o,
})

describe('kerja: model', () => {
  it('kunci tiket divalidasi sebelum dipakai sebagai folder', () => {
    expect(dirKerja('FMS-87')).toMatch(/kerja\/FMS-87$/)
    expect(() => dirKerja('../etc')).toThrow(/tidak sah/)
    expect(() => dirKerja('fms-87')).toThrow(/tidak sah/)
  })

  it('kerja baru dari tiket: tahap diambil, riwayat, tiket.md dari HTML', () => {
    const { kerja, tiketMd } = kerjaDariTiket(tiket, null)
    expect(kerja).toMatchObject({
      key: 'FMS-87',
      tahap: 'diambil',
      plane: { id: 'isu-1', projectId: 'proj-1' },
    })
    expect(kerja.riwayat).toHaveLength(1)
    expect(tiketMd).toContain('# FMS-87 · Lewati pemeriksaan')
    expect(tiketMd).toContain('- Dua & tiga')
    expect(htmlKeTeks('<p>a</p><p>b<br>c</p>')).toBe('a\nb\nc')
  })

  it('ambil ulang mempertahankan tahap dan potret, memperbarui judul dan status', () => {
    const lama = kerjaContoh({ tahap: 'dikerjakan', branch: 'feat/x' })
    const { kerja } = kerjaDariTiket({ ...tiket, judul: 'Judul baru', status: 'Done' }, lama)
    expect(kerja).toMatchObject({
      tahap: 'dikerjakan',
      branch: 'feat/x',
      judul: 'Judul baru',
      plane: { status: 'Done', id: 'isu-1' },
    })
  })

  it('pindah tahap mencatat riwayat; tahap tak dikenal ditolak; hitung per tahap', () => {
    const k = pindahTahap(kerjaContoh(), 'rencana', 'Rencana ditulis')
    expect(k.tahap).toBe('rencana')
    expect(k.riwayat.at(-1)).toMatchObject({ tahap: 'rencana', catatan: 'Rencana ditulis' })
    expect(() => pindahTahap(k, 'aneh' as never)).toThrow()
    expect(hitungTahap([k, kerjaContoh(), kerjaContoh({ tahap: 'selesai' })])).toEqual({
      diambil: 1,
      rencana: 1,
      dikerjakan: 0,
      dokumentasi: 0,
      selesai: 1,
    })
  })
})

describe('kerja: target potret', () => {
  const ok = (t: unknown) => TargetSchema.safeParse(t).success
  it('layar: persona dikenal, rute diawali /; db: hanya satu SELECT/WITH', () => {
    expect(
      ok({
        layar: [{ nama: 'daftar', sebagai: 'mbl.planner', rute: '/x' }],
        db: [{ nama: 'q', sql: 'SELECT 1' }],
      }),
    ).toBe(true)
    expect(ok({ db: [{ nama: 'q', sql: 'with a as (select 1) select * from a;' }] })).toBe(true)
    expect(ok({ layar: [{ nama: 'x', sebagai: 'orang-asing', rute: '/x' }] })).toBe(false)
    expect(ok({ layar: [{ nama: 'x', sebagai: 'mbl.planner', rute: 'x' }] })).toBe(false)
    expect(ok({ db: [{ nama: 'q', sql: 'DELETE FROM orders' }] })).toBe(false)
    expect(ok({ db: [{ nama: 'q', sql: 'SELECT 1; DELETE FROM orders' }] })).toBe(false)
    expect(ok({ db: [{ nama: 'Bukan Kebab', sql: 'SELECT 1' }] })).toBe(false)
  })
})

describe('kerja: beda DB dan komentar Plane', () => {
  it('baris dikenali lewat id: ditambah, dihapus, berubah beserta kolom', () => {
    const b = bedaBaris(
      [
        { id: 1, s: 'A' },
        { id: 2, s: 'B' },
      ],
      [
        { id: 2, s: 'C' },
        { id: 3, s: 'D' },
      ],
    )
    expect(b.ditambah).toEqual([{ id: 3, s: 'D' }])
    expect(b.dihapus).toEqual([{ id: 1, s: 'A' }])
    expect(b.berubah).toEqual([{ baris: { id: 2, s: 'C' }, kolom: ['s'] }])
  })

  it('tanpa kolom id: baris dibandingkan dari isinya', () => {
    const b = bedaBaris([{ p: 'REQUIRED', n: 153 }], [{ p: 'REQUIRED', n: 154 }])
    expect(b.ditambah).toHaveLength(1)
    expect(b.dihapus).toHaveLength(1)
    expect(b.berubah).toHaveLength(0)
  })

  it('komentar Plane merangkum tahap, branch, potret, skenario; isi di-escape', () => {
    const k = kerjaContoh({ branch: 'feat/<x>', skenario: ['tiket-order'], commit: ['abc123'] })
    const h = komentarHtml(k, 'Catatan <b>uji</b>')
    expect(h).toContain('feat/&lt;x&gt;')
    expect(h).toContain('Catatan &lt;b&gt;uji&lt;/b&gt;')
    expect(h).toContain('<code>tiket-order</code>')
    expect(h).toContain('Potret sebelum: belum')
  })
})

describe('dasbor', () => {
  // Senin 16 Nov 2026, siang waktu lokal (tanggal dihitung lokal, bukan UTC).
  const sekarang = new Date(2026, 10, 16, 12, 0)
  const lokal = (h: number, jam: number) => new Date(2026, 10, h, jam, 0).toISOString()
  const jalan = [
    { run_id: 'a/1', scenario: 'a', status: 'selesai', started_at: lokal(16, 8) },
    { run_id: 'a/2', scenario: 'a', status: 'gagal', started_at: lokal(15, 8) },
    { run_id: 'b/1', scenario: 'b', status: 'dihentikan', started_at: lokal(15, 9) },
    { run_id: 'b/2', scenario: 'b', status: 'siap', started_at: lokal(15, 10) },
    { run_id: 'c/1', scenario: 'c', status: 'selesai', started_at: '2026-10-01T08:00:00Z' },
  ]
  const kerjaAktif = {
    ...pindahTahap(kerjaContoh(), 'rencana', 'r'),
    target: {
      layar: [{ nama: 'order', sebagai: 'mbl.planner', rute: '/' }],
      db: [{ nama: 'q', sql: 'select 1' }],
    },
    potret: {
      sebelum: {
        at: '2026-11-16T07:00:00Z',
        layar: [],
        db: [{ nama: 'salah-sengaja', file: null, baris: 0, galat: 'x' }],
      },
    },
  } as Kerja
  const d = susunDasbor({
    sekarang,
    tugas: [
      { key: 'FMS-1', status: 'Ready', grup: 'completed', selesai: false, skenario: ['x'] },
      { key: 'FMS-2', status: 'Ready', grup: 'completed', selesai: false, skenario: [] },
      { key: 'FMS-3', status: 'Done', grup: 'completed', selesai: true, skenario: [] },
    ],
    kerja: [kerjaAktif, kerjaContoh({ key: 'FMS-9', tahap: 'selesai' })],
    jalan,
    skenario: [
      { slug: 'x', task: 'insidentil', valid: true, status: 'siap' },
      { slug: 'y', task: 'insidentil', valid: true, status: 'ada_kegagalan' },
    ],
    modul: [
      { id: 'insidentil', nama: 'Perbaikan Insidentil' },
      { id: 'ban', nama: 'Ban' },
    ],
    temuan: bacaTemuan(
      '# T\n\n## 2026-11-16 10:08 · Bug aplikasi · Satu\n\n## 2026-11-16 10:22 · Catatan · Dua\n\n## 2026-11-13 08:58 · Lama tanpa jenis\n',
    ),
    adaRencana: (k) => k === 'FMS-87',
    memotret: null,
  })

  it('tugas terbuka tanpa Done; kerja aktif dirinci untuk panel Sedang dikerjakan', () => {
    expect(d.tugas).toEqual({
      terbuka: 2,
      punyaSkenario: 1,
      perStatus: [{ status: 'Ready', n: 2 }],
    })
    expect(d.kerja.perTahap.find((t) => t.tahap === 'rencana')?.n).toBe(1)
    expect(d.kerja.aktif).toHaveLength(1)
    expect(d.kerja.aktif[0]).toMatchObject({
      key: 'FMS-87',
      tahapNo: 2,
      layar: 1,
      query: 1,
      queryGagal: ['salah-sengaja'],
      sebelum: true,
      sesudah: false,
      rencana: true,
      commit: 0,
      komentar: false,
      memotret: null,
    })
  })

  it('jalan: yang belum diputar tidak dihitung; 7 hari berurutan; harian 24 minggu Senin pertama', () => {
    expect(d.jalan.tujuhHari).toEqual({
      total: 3,
      lulus: 1,
      gagal: 1,
      lain: 1,
      urut: ['gagal', 'lain', 'lulus'],
    })
    const h = d.jalan.harian
    expect(h).toHaveLength(168)
    expect(new Date(`${h[0]?.tanggal}T00:00:00`).getDay()).toBe(1)
    const ini = h.find((x) => x.hariIni)
    expect(ini).toMatchObject({ tanggal: '2026-11-16', n: 1, lulus: 1 })
    expect(h.find((x) => x.tanggal === '2026-11-15')).toMatchObject({ n: 2, gagal: 1, lain: 1 })
    expect(h.filter((x) => x.nanti)).toHaveLength(6)
    expect(d.jalan.ringkas).toMatchObject({ total: 4, lulus: 2, persenLulus: 50, rentetan: 2 })
    expect(d.skenario.perGrup).toEqual([
      { id: 'insidentil', nama: 'Perbaikan Insidentil', total: 2, gagal: 1 },
    ])
  })

  it('tanggal lokal, rentetan terpanjang, hari tersibuk', () => {
    expect(tglLokal(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05')
    const h = harianJalan(
      [1, 2, 3, 9, 9].map((t, i) => ({
        run_id: `x/${i}`,
        scenario: 'x',
        status: 'selesai',
        started_at: new Date(2026, 10, t, 9).toISOString(),
      })),
      new Date(2026, 10, 10, 12),
      2,
    )
    const r = ringkasHarian(h)
    // Jendela 2 minggu = 2–15 Nov; 1 Nov di luar, jadi rentetan terpanjang 2–3 Nov.
    expect(r.terpanjang).toBe(2)
    expect(r.rentetan).toBe(0)
    // Senin (indeks 0): 2 Nov satu jalan + 9 Nov dua jalan.
    expect(r.tersibuk).toEqual({ hari: 0, n: 3 })
  })

  it('temuan terbaru dulu dengan jenis; aktivitas terurut', () => {
    expect(d.temuan.total).toBe(3)
    expect(d.temuan.bug).toBe(1)
    expect(d.temuan.terbaru[0]).toMatchObject({ jenis: 'Catatan', judul: 'Lama tanpa jenis' })
    const at = d.aktivitas.map((a) => a.at)
    expect([...at].sort().reverse()).toEqual(at)
  })

  it('panel Sedang dikerjakan: tahap, gauge, hasil kerja, query gagal, salin perintah', () => {
    const p = panelAktif(d.kerja.aktif)
    expect(p).toContain('href="#/kerja/FMS-87"')
    expect(p).toContain('data-db-salin="/kerjakan FMS-87"')
    expect(p).toContain('AI mengubah kode di branch tiket.')
    expect(p).toContain('<code>salah-sengaja</code> masih gagal')
    expect(p).toContain('× 1 gagal')
    expect(penandaTahap(2)).toContain('✓ Diambil')
    expect(penandaTahap(2)).toContain('Tahap 2 · sekarang')
    expect(penandaTahap(2)).toContain('Tahap 3 · berikutnya')
    const g = gauge(2, 'Rencana')
    expect(g.match(/db-gseg on/g)).toHaveLength(4)
    expect(g.match(/db-gseg kini/g)).toHaveLength(4)
    const hk = hasilKerja(d.kerja.aktif[0])
    expect(hk).toContain('2 / 6')
    expect(hk).toMatch(/Branch &amp; commit<\/span><span class="db-st">Berikutnya/)
    expect(panelAktif([])).toContain('Buka Tugas saya')
    const dua = panelAktif([d.kerja.aktif[0], { ...d.kerja.aktif[0], key: 'FMS-5' }])
    expect(dua).toContain('2 tiket aktif')
    expect(dua).toContain('href="#/kerja/FMS-5"')
    expect(panelAktif([{ ...d.kerja.aktif[0], memotret: 'sesudah' }])).toContain(
      'Memotret sesudah…',
    )
  })

  it('kotak mini: kotak per item, batang bertumpuk bila > 20', () => {
    expect(deretMini(['lulus', 'gagal'], 'x')).toContain('repeat(2,')
    expect(deretMini(Array(21).fill('lulus'), 'x')).toContain('tumpuk')
  })

  it('heatmap: hari nanti tidak digambar, hari ini bercincin, gagal bertitik; kosong berteks', () => {
    const h = heatmap(d.jalan.harian, d.jalan.ringkas)
    expect(h.match(/db-hm-sel nanti/g)).toHaveLength(6)
    expect(h).toContain('hari-ini')
    expect(h).toContain('Min, 15 Nov · 2 jalan · 1 gagal')
    expect(h).toContain('50% lulus')
    const kosong = harianJalan([], sekarang)
    expect(heatmap(kosong, ringkasHarian(kosong))).toContain('Belum ada jalan skenario')
  })

  it('produktivitas: minggu berjalan, delta, sumbu, puncak, batas pemilih', () => {
    const m = mingguProduktif(d.jalan.harian, 0)
    expect(m.mulai).toBe('2026-11-16')
    expect(m.total).toBe(1)
    expect(m.rata).toBe('1,0')
    expect(m.sumbu).toBe(4)
    expect(m.puncak).toBe(0)
    expect(m.delta).toBe(-50)
    const lalu = mingguProduktif(d.jalan.harian, 1)
    expect(lalu).toMatchObject({ mulai: '2026-11-09', total: 2, rata: '0,3', delta: null })
    expect(mingguProduktif(d.jalan.harian, 99).mundur).toBe(23)
  })

  it('radar ≥ 3 grup, batang mendatar bila kurang', () => {
    const g = (id: string, total: number) => ({ id, nama: id, total, gagal: 0 })
    expect(radar([g('a', 4), g('b', 1), g('c', 2)], 7)).toContain('<polygon class="area"')
    expect(radar([g('a', 4)], 4)).toContain('db-bar-trek')
  })

  it('HTML dasbor utuh; galat dan memuat; Plane tak tersambung', () => {
    const h = halamanDasbor(d)
    expect(h).toContain('Tugas terbuka')
    expect(h).toContain('Sedang dikerjakan')
    expect(h).toContain('Aktivitas jalan skenario')
    expect(h).toContain('Produktivitas uji')
    expect(h).toContain('Temuan terbaru')
    expect(h).not.toContain('contoh data')
    expect(halamanDasbor({ ...d, tugas: null })).toContain('PLANE_API_KEY')
    expect(halamanDasbor(null)).toContain('Memuat')
    expect(halamanDasbor(null, { galat: 'putus' })).toContain('putus')
  })
})

describe('halaman Kerja', () => {
  it('penanda tahap: sebelum dicentang, kini disorot', () => {
    const h = langkahTahap('dikerjakan')
    expect(h).toContain('class="lewat"')
    expect(h).toContain('aria-current="step"')
  })

  it('markdown ringan: judul, butir, kode, escape', () => {
    const h = mdRingan('# Judul\n- satu `kode`\n\n```\n<x>\n```\nteks **tebal**')
    expect(h).toContain('<h3>Judul</h3>')
    expect(h).toContain('<li>satu <code>kode</code></li>')
    expect(h).toContain('&lt;x&gt;')
    expect(h).toContain('<b>tebal</b>')
  })

  it('beda DB tampil sebagai chip; tabel sebelum/sesudah', () => {
    const h = bandingDb([
      {
        nama: 'q',
        sql: 'SELECT 1',
        sebelum: [{ a: 1 }],
        sesudah: [{ a: 2 }],
        beda: { ditambah: 1, dihapus: 1, berubah: 0, kolom: [] },
      },
    ])
    expect(h).toContain('+1 baris')
    expect(h).toContain('<td>2</td>')
  })

  it('halaman: aksi, target kosong, rencana belum ada', () => {
    const k = kerjaContoh()
    const h = halamanKerja({ kerja: k, tiket: '# t', rencana: null, db: [], komentar: '' })
    expect(h).toContain('Salin perintah AI')
    expect(h).toContain('Belum ada target potret')
    expect(h).toContain('Belum ada rencana')
  })

  it('Tugas saya: tombol Ambil atau chip tahap', () => {
    expect(aksiKerja({ key: 'FMS-1', kerja: null })).toContain('data-tg-ambil="FMS-1"')
    expect(aksiKerja({ key: 'FMS-1', kerja: { tahap: 'rencana' } })).toContain(
      'href="#/kerja/FMS-1"',
    )
  })
})

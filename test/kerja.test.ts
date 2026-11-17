// Kerja per tiket (kerja/<KEY>/) dan Dasbor operasional: fungsi murni model, beda DB, komentar Plane,
// susunan dasbor, dan HTML halaman panel.
import { describe, expect, it } from 'vitest'
import {
  deretMini,
  gauge,
  halamanDasbor,
  halamanStatistik,
  hasilKerja,
  heatmap,
  mingguProduktif,
  panelAktif,
  penandaTahap,
  radar,
} from '../panel/js/dasbor.js'
import {
  batangDiff,
  daftarVerifikasi,
  langkahTahap,
  laporanKerja,
  mdRingan,
  pesanCommitMd,
  pisahBukti,
  poinCommit,
  rapikanSql,
  refTiket,
  tiketTanpaKepala,
} from '../panel/js/kerja.js'
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
  normalkanKerja,
  perubahanQuery,
  pindahTahap,
  ringkasCek,
  setCek,
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
    const lama = kerjaContoh({ tahap: 'diverifikasi', branch: 'feat/x' })
    const { kerja } = kerjaDariTiket({ ...tiket, judul: 'Judul baru', status: 'Done' }, lama)
    expect(kerja).toMatchObject({
      tahap: 'diverifikasi',
      branch: 'feat/x',
      judul: 'Judul baru',
      plane: { status: 'Done', id: 'isu-1' },
    })
  })

  it('pindah tahap mencatat riwayat; tahap tak dikenal ditolak; hitung per tahap', () => {
    const k = pindahTahap(kerjaContoh(), 'dipelajari', 'Catatan ditulis')
    expect(k.tahap).toBe('dipelajari')
    expect(k.riwayat.at(-1)).toMatchObject({ tahap: 'dipelajari', catatan: 'Catatan ditulis' })
    expect(() => pindahTahap(k, 'aneh' as never)).toThrow()
    expect(hitungTahap([k, kerjaContoh(), kerjaContoh({ tahap: 'selesai' })])).toEqual({
      diambil: 1,
      dipelajari: 1,
      dikerjakan: 0,
      diverifikasi: 0,
      didokumentasikan: 0,
      selesai: 1,
    })
  })

  it('kerja.json lama: tahap dipetakan ke alur monitoring, verifikasi diberi nilai awal', () => {
    const lama = {
      ...kerjaContoh(),
      tahap: 'rencana',
      riwayat: [{ at: 'x', tahap: 'rencana', catatan: '' }],
      verifikasi: undefined,
    } as unknown as Kerja
    const k = normalkanKerja(lama)
    expect(k.tahap).toBe('dipelajari')
    expect(k.riwayat[0]?.tahap).toBe('dipelajari')
    expect(k.verifikasi).toEqual([])
    expect(normalkanKerja({ ...lama, tahap: 'dokumentasi' } as unknown as Kerja).tahap).toBe(
      'didokumentasikan',
    )
  })

  it('cek per kriteria: tambah, timpa tanpa peka huruf, tolak kosong dan hasil asing', () => {
    let k = setCek(kerjaContoh(), 'Alasan wajib', 'lulus', 'dialog menolak')
    k = setCek(k, 'Approval tetap wajib', 'gagal')
    k = setCek(k, 'alasan WAJIB', 'gagal', 'ternyata lolos')
    expect(k.verifikasi).toHaveLength(2)
    expect(k.verifikasi[0]).toMatchObject({
      kriteria: 'alasan WAJIB',
      hasil: 'gagal',
      bukti: 'ternyata lolos',
    })
    expect(ringkasCek(k.verifikasi)).toEqual({ total: 2, lulus: 0, gagal: 2, belum: 0 })
    expect(() => setCek(k, '  ', 'lulus')).toThrow(/kosong/)
    expect(() => setCek(k, 'x', 'aneh' as never)).toThrow()
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
    expect(b.berubah).toEqual([{ baris: { id: 2, s: 'C' }, lama: { id: 2, s: 'B' }, kolom: ['s'] }])
  })

  it('tanpa kolom id: baris dipasangkan lewat kolom bukan-angka, angka yang berubah = berubah', () => {
    const b = bedaBaris(
      [
        { p: 'REQUIRED', n: 153 },
        { p: 'SKIPPED', n: 9 },
      ],
      [
        { p: 'REQUIRED', n: 154 },
        { p: 'SKIPPED', n: 9 },
      ],
    )
    expect(b.ditambah).toHaveLength(0)
    expect(b.dihapus).toHaveLength(0)
    expect(b.berubah).toEqual([
      { baris: { p: 'REQUIRED', n: 154 }, lama: { p: 'REQUIRED', n: 153 }, kolom: ['n'] },
    ])
    const p = perubahanQuery('q', [{ p: 'REQUIRED', n: 153 }], [{ p: 'REQUIRED', n: 154 }])
    expect(p[0]?.baris[0]).toEqual({
      operasi: 'UPDATE',
      kunci: 'REQUIRED',
      kolom: [{ kolom: 'n', dari: 153, ke: 154 }],
    })
  })

  it('tanpa kolom id dan kunci bukan-angka tidak unik: dibandingkan dari seluruh isi', () => {
    const b = bedaBaris(
      [
        { p: 'A', n: 1 },
        { p: 'A', n: 2 },
      ],
      [
        { p: 'A', n: 1 },
        { p: 'A', n: 3 },
      ],
    )
    expect(b.ditambah).toEqual([{ p: 'A', n: 3 }])
    expect(b.dihapus).toEqual([{ p: 'A', n: 2 }])
    expect(b.berubah).toHaveLength(0)
  })

  it('komentar Plane merangkum verifikasi, potret, skenario, kode v2; isi di-escape', () => {
    const k = setCek(
      kerjaContoh({ branch: 'feat/<x>', skenario: ['tiket-order'], commit: ['abc123'] }),
      'Alasan <wajib>',
      'lulus',
      'dialog',
    )
    const h = komentarHtml(k, 'Catatan <b>uji</b>')
    expect(h).toContain('Kriteria: 1 lulus, 0 gagal.')
    expect(h).toContain('✓ Alasan &lt;wajib&gt; — dialog')
    const lokal = komentarHtml(
      setCek(kerjaContoh(), 'Lulus', 'lulus', 'Tampil benar (verifikasi/1-a.png)'),
    )
    expect(lokal).toContain('✓ Lulus — Tampil benar')
    expect(lokal).not.toContain('.png')
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
    ...setCek(pindahTahap(kerjaContoh(), 'dipelajari', 'r'), 'Alasan wajib', 'lulus'),
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
    adaCatatan: (k) => k === 'FMS-87',
    memotret: null,
  })

  it('tugas terbuka tanpa Done; kerja aktif dirinci untuk panel Sedang dikerjakan', () => {
    expect(d.tugas).toEqual({
      terbuka: 2,
      punyaSkenario: 1,
      perStatus: [{ status: 'Ready', n: 2 }],
    })
    expect(d.kerja.perTahap.find((t) => t.tahap === 'dipelajari')?.n).toBe(1)
    expect(d.kerja.aktif).toHaveLength(1)
    expect(d.kerja.aktif[0]).toMatchObject({
      key: 'FMS-87',
      tahapNo: 2,
      layar: 1,
      query: 1,
      queryGagal: ['salah-sengaja'],
      sebelum: true,
      sesudah: false,
      catatan: true,
      verifikasi: { total: 1, lulus: 1, gagal: 0, belum: 0 },
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
    expect(p).toContain('AI mengimplementasikan di v2 bila fiturnya belum ada')
    expect(p).toContain('<code>salah-sengaja</code> masih gagal')
    expect(p).toContain('× 1 gagal')
    expect(penandaTahap(2)).toContain('✓ Diambil')
    expect(penandaTahap(2)).toContain('Tahap 2 · sekarang')
    expect(penandaTahap(2)).toContain('Tahap 3 · berikutnya')
    const g = gauge(2, 'Rencana')
    expect(g.match(/db-gseg on/g)).toHaveLength(3)
    expect(g.match(/db-gseg kini/g)).toHaveLength(3)
    const hk = hasilKerja(d.kerja.aktif[0])
    expect(hk).toContain('3 / 5')
    expect(hk).toMatch(/Potret sesudah<\/span><span class="db-st">Berikutnya/)
    // Tiket yang dikerjakan AI: butir dan angka kode v2 ikut tampil.
    const ai = { ...d.kerja.aktif[0], pakaiKode: true, commit: 2, branch: 'feat/fms-105' }
    expect(hasilKerja(ai)).toContain('Kode v2 (commit)')
    expect(hasilKerja(ai)).toContain('4 / 6')
    expect(panelAktif([ai])).toContain('feat/fms-105')
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

  it('Dashboard berisi tindakan; tren pindah ke Statistik (R-9.1, R-9.4)', () => {
    const h = halamanDasbor(d)
    for (const x of [
      'Butuh kamu',
      'AI sedang jalan',
      'Menunggu pihak lain',
      'Slot terpakai',
      'Temuan terbaru',
    ])
      expect(h).toContain(x)
    for (const x of ['Aktivitas jalan skenario', 'Produktivitas uji', 'Sedang dikerjakan'])
      expect(h).not.toContain(x)
    const st = halamanStatistik(d)
    for (const x of [
      'Tugas terbuka',
      'Sedang dikerjakan',
      'Aktivitas jalan skenario',
      'Produktivitas uji',
      'Metrik per tiket',
    ])
      expect(st).toContain(x)
    expect(h).not.toContain('contoh data')
    expect(halamanDasbor({ ...d, tugas: null })).toContain('PLANE_API_KEY')
    expect(halamanDasbor(null)).toContain('Memuat')
    expect(halamanDasbor(null, { galat: 'putus' })).toContain('putus')
  })
})

describe('halaman Kerja', () => {
  it('penanda tahap: sebelum dicentang, kini disorot', () => {
    const h = langkahTahap('diverifikasi')
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

  it('markdown ringan: tabel, butir bertingkat, miring di luar kode', () => {
    const h = mdRingan(
      '- a\n  - a1\n- b *miring* `x_*_y`\n\n| Kriteria | Hasil |\n|---|---|\n| satu | ✓ ok |',
    )
    expect(h).toContain(
      '<ul><li>a<ul><li>a1</li></ul></li><li>b <i>miring</i> <code>x_*_y</code></li></ul>',
    )
    expect(h).toContain('<th>Kriteria</th>')
    expect(h).toContain('<td>✓ ok</td>')
    expect(h).not.toContain('|---|')
  })

  it('laporan kerja: bar dengan tab dan aksi; tab kosong memberi petunjuk', () => {
    const k = kerjaContoh()
    const d = { kerja: k, tiket: '# t', catatan: null, db: [], komentar: '' }
    const { bar, view } = laporanKerja(d)
    expect(bar).toContain('Kerja</em> · ')
    expect(bar).toContain('id="kj-komentar"')
    expect(bar).toContain('Salin perintah AI')
    // Ringkasan di atas, lalu laporan bertab di bawahnya.
    expect(view.indexOf('kj-ringkas')).toBeLessThan(view.indexOf('kj-laporan'))
    expect(view).toContain('aria-selected="true">Layar')
    expect(view).toContain('Belum ada halaman untuk dipotret')
    expect(view).toContain('Belum ada kriteria yang dicek')
    expect(view).toContain('Riwayat terbaru')
    expect(laporanKerja(d, { tab: 'catatan' }).view).toContain('Belum ada catatan')
    // Tanpa commit/branch: kotak kosong + perintah catat, panel "Tanpa kode" (bukan memuat selamanya).
    const kosong = laporanKerja(d, { tab: 'kode' }).view
    expect(kosong).toContain('Belum ada commit untuk tiket ini')
    expect(kosong).toContain('Tanpa kode')
    expect(kosong).toContain('data-kj-salin="bun run kerja catat')
    const adaCommit = { ...d, kerja: { ...k, commit: ['abc1234'] } }
    expect(laporanKerja(adaCommit, { tab: 'kode' }).view).toContain('Memuat perubahan kode')
  })

  it('keadaan: memuat berkerangka, gagal dengan Coba lagi, status Plane belum segar', () => {
    const memuat = laporanKerja(null, { kunci: 'FMS-1' })
    expect(memuat.bar).toContain('FMS-1')
    expect(memuat.bar).toContain('Memuat kerja…')
    expect(memuat.bar).toContain('disabled')
    expect(memuat.view).toContain('class="skel"')
    const gagal = laporanKerja(null, { kunci: 'FMS-1', galat: 'putus' })
    expect(gagal.view).toContain('putus')
    expect(gagal.view).toContain('GET /api/kerja/FMS-1')
    expect(gagal.view).toContain('data-kj-ulang')
    const k = kerjaContoh()
    const d = {
      kerja: k,
      tiket: '',
      catatan: null,
      db: [],
      komentar: '',
      plane: { dicek: '2026-11-16T09:34:00Z', segar: false },
    }
    expect(laporanKerja(d, { cekPlane: 'memeriksa' }).bar).toMatch(
      /<i>Plane: .*\?<\/i> · cache .*memeriksa…/,
    )
    expect(laporanKerja(d, { cekPlane: 'gagal' }).bar).toContain('gagal dicek')
    expect(laporanKerja(d, { cekPlane: 'gagal' }).bar).toContain('data-kj-cek-plane')
    const segar = laporanKerja({ ...d, plane: { ...d.plane, segar: true } }).bar
    expect(segar).toContain('· dicek ')
    expect(segar).not.toContain('?</i>')
  })

  it('tab Data: tabel query, galat ditandai, perubahan baris memakai komponen laporan', () => {
    const k = kerjaContoh()
    const db = [
      {
        nama: 'q-satu',
        sql: 'SELECT 1',
        sebelum: [{ id: 1, a: 1 }],
        sesudah: [{ id: 1, a: 2 }],
        galatSebelum: null,
        galatSesudah: null,
        beda: { ditambah: 0, dihapus: 0, berubah: 1, kolom: ['a'] },
        perubahan: perubahanQuery('q-satu', [{ id: 1, a: 1 }], [{ id: 1, a: 2 }]),
      },
      {
        nama: 'q-dua',
        sql: 'SELECT x',
        sebelum: null,
        sesudah: null,
        galatSebelum: 'kolom x tidak ada',
        galatSesudah: null,
        beda: null,
        perubahan: [],
      },
    ]
    const { view } = laporanKerja(
      { kerja: k, tiket: '', catatan: null, db, komentar: '' },
      { tab: 'data', pilih: 1 },
    )
    expect(view).toContain('aria-label="1 query gagal"')
    expect(view).toContain('~1 berubah')
    expect(view).toContain('class="rel-no s-gagal')
    expect(view).toContain('class="lama">1</span>')
    expect(view).toContain('class="baru">2</span>')
  })

  it('ringkasan: tiket tanpa kepala, ref modul + REQ, poin commit, bukti tanpa berkas lokal', () => {
    const md =
      '# FMS-1 · Judul\n\nStatus Plane: Todo · https://x\n\nScope / Modules Affected\n\n- Fleet & Asset / Meter Reading (KM / HM)\n\nRef Request: REQ-2026-033 | Sheet'
    expect(tiketTanpaKepala(md)).toMatch(/^Scope/)
    expect(refTiket(md)).toBe('Fleet & Asset / Meter Reading · REQ-2026-033')
    const kode = {
      commits: [
        {
          isi: 'Ringkas.\n\n- Satu butir\n  lanjutan baris\n- Dua\n\nCo-Authored-By: X <x@y>',
        },
      ],
    }
    expect(poinCommit(kode)).toEqual(['Satu butir lanjutan baris', 'Dua'])
    expect(pisahBukti('Tampil benar (verifikasi/1-a.png)')).toEqual({
      teks: 'Tampil benar',
      berkas: ['verifikasi/1-a.png'],
    })
    expect(pisahBukti('Tanpa berkas (catatan kecil)').berkas).toEqual([])
  })

  it('ringkasan di laporan: bilah tahap, Bukti bertaut tab, kepala Laporan dengan jumlah butir', () => {
    const k = setCek(
      kerjaContoh({ tahap: 'diverifikasi' }),
      'A',
      'lulus',
      'ok (verifikasi/1-a.png)',
    )
    const d = {
      kerja: k,
      tiket: '# t',
      catatan: 'isi',
      db: [],
      komentar: '',
      plane: { dicek: '2026-11-16T11:09:00Z', segar: true },
    }
    const { bar, view } = laporanKerja(d, { buka: new Set(['kriteria']) })
    expect(bar).toContain('dicek ')
    expect(view).toContain('aria-current="step"')
    expect(view).toContain('data-kj-ke="layar"')
    expect(view).toContain('src="/kerja/FMS-87/verifikasi/1-a.png"')
    expect(view).not.toContain('(verifikasi/1-a.png)')
    expect(view).toContain('id="kj-lap-hd"')
    expect(view).toContain('Layar <span class="n">0</span>')
  })

  it('tab Kode: berkas per folder teratas, batang diffstat, pesan commit jadi markdown', () => {
    const k = kerjaContoh({ commit: ['abc12345'] })
    const kode = {
      branch: 'feat/x',
      diRemote: true,
      belumDiPush: 0,
      commits: [
        {
          sha: 'abc12345ff',
          judul: 'feat: x',
          isi: '- satu butir\n  lanjutan\n- dua\n\nCo-Authored-By: A <a@b>',
          penulis: 'Tams',
          tanggal: '2026-11-16T10:00:00Z',
          berkas: [
            { path: 'Backend/src/a.ts', tambah: 4, hapus: 1, diff: '', terpotong: false },
            { path: 'Frontend/src/b.tsx', tambah: 2, hapus: 0, diff: '', terpotong: false },
          ],
        },
      ],
    }
    const { view } = laporanKerja(
      { kerja: k, tiket: '', catatan: null, db: [], komentar: '' },
      { tab: 'kode', kode },
    )
    expect(view).toContain('Backend · 1 berkas')
    expect(view).toContain('Frontend · 1 berkas')
    expect(view).toContain('<span class="dim">Backend/src/</span>a.ts')
    expect(view).toContain('✓ Sudah di remote')
    expect(pesanCommitMd(kode.commits[0]?.isi)).toBe('- satu butir lanjutan\n- dua')
    expect(batangDiff(4, 1)).toBe(
      '<span class="kj-batang" aria-hidden="true"><i class="k t"></i><i class="k t"></i><i class="k t"></i><i class="k t"></i><i class="k h"></i></span>',
    )
    expect(rapikanSql('SELECT a FROM t WHERE x = 1 AND y = 2 ORDER BY 1')).toBe(
      'SELECT a\nFROM t\nWHERE x = 1\n  AND y = 2\nORDER BY 1',
    )
  })

  it('perubahan query: UPDATE per kolom, INSERT, DELETE', () => {
    const p = perubahanQuery(
      'q',
      [
        { id: 1, a: 1 },
        { id: 2, a: 5 },
      ],
      [
        { id: 1, a: 2 },
        { id: 3, a: 9 },
      ],
    )
    const ops = p[0]?.baris.map((b) => b.operasi)
    expect(ops).toEqual(['UPDATE', 'INSERT', 'DELETE'])
    expect(p[0]?.baris[0]?.kolom).toEqual([{ kolom: 'a', dari: 1, ke: 2 }])
    expect(perubahanQuery('q', [{ id: 1 }], [{ id: 1 }])).toEqual([])
  })

  it('verifikasi per kriteria: tanda dan teks, bukan warna saja', () => {
    const k = setCek(setCek(kerjaContoh(), 'A', 'lulus', 'bukti a'), 'B', 'gagal')
    const h = daftarVerifikasi(k)
    expect(h).toContain('✓ 1 lulus')
    expect(h).toContain('× 1 gagal')
    expect(h).toContain('aria-label="gagal">×')
    expect(h).toContain('bukti a')
  })

  it('Tugas saya: tombol Ambil atau chip tahap', () => {
    expect(aksiKerja({ key: 'FMS-1', kerja: null })).toContain('data-tg-ambil="FMS-1"')
    expect(aksiKerja({ key: 'FMS-1', kerja: { tahap: 'dipelajari' } })).toContain(
      'href="#/kerja/FMS-1"',
    )
  })
})

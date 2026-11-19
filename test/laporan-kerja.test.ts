// Laporan Kerja format 2: butir append-only, koreksi, gerbang, panen/MR, render kartu, dan bahwa
// kerja lama (tanpa `format`) tetap memakai catatan.md.
import { describe, expect, it } from 'vitest'
import { laporanKerja, tabKerja } from '../panel/js/kerja.js'
import { formatDua, kerjaDariTiket, normalkanKerja } from '../src/core/kerja.ts'
import { kerjaLokal } from '../src/core/kerja-lokal.ts'
import {
  aktif,
  bacaTabel,
  LAPORAN_KOSONG,
  type LaporanLengkap,
  periksaLaporan,
  renderLaporanMd,
  setHasil,
  setMasalah,
  setujuiHasil,
  tambahDilakukan,
  tambahTemuan,
} from '../src/core/laporan-kerja.ts'
import { isiPanen } from '../src/core/panen.ts'
import { deskripsiMr } from '../src/core/serah.ts'

const dasar = { pertanyaan: [], mintaUbah: [], verifikasi: [] as { hasil: string }[] }
const isi = () => {
  let l = setMasalah(LAPORAN_KOSONG, 'Approval lolos otomatis', 'Gerbang salah tempat').laporan
  l = tambahTemuan(l, { teks: 'Penyebab di `a.ts:1`', jenis: 'penyebab' })
  l = tambahTemuan(l, { teks: 'Data', jenis: 'data-uji', rinci: 'Langkah **uji**' })
  l = tambahDilakukan(l, { teks: 'Rencana satu', rencana: true })
  l = tambahDilakukan(l, { teks: 'Salah', commit: '34ee57dfabc' })
  l = tambahDilakukan(l, { teks: 'Benar', commit: '34ee57df', koreksi: 2 })
  return setHasil(l, {
    penyelesaian: 'Sekarang **menunggu** persetujuan.',
    belum: ['Data lama tidak diubah.'],
    tabel: [{ dilaporkan: 'x', sebelum: 'a', sesudah: 'b', bukti: 'WO-1' }],
  })
}

describe('laporan-kerja: butir hanya ditambah', () => {
  it('nomor urut per kartu, penulis, dan commit dipendekkan', () => {
    const l = isi()
    expect(l.temuan.map((t) => t.id)).toEqual([1, 2])
    expect(l.dilakukan.map((d) => d.id)).toEqual([1, 2, 3])
    expect(l.dilakukan[1]?.commit).toBe('34ee57df')
    expect(l.temuan[0]?.oleh).toBe('ai')
  })
  it('koreksi menunjuk butir lama; butir lama tak berlaku lagi tapi tetap tersimpan', () => {
    const l = isi()
    expect(l.dilakukan).toHaveLength(3)
    expect(aktif(l.dilakukan).map((d) => d.id)).toEqual([1, 3])
    expect(l.dilakukan[2]?.koreksi).toBe(2)
  })
  it('koreksi yang tak sah ditolak', () => {
    const l = isi()
    expect(() => tambahDilakukan(l, { teks: 'x', koreksi: 9 })).toThrow(/tidak ada/)
    expect(() => tambahDilakukan(l, { teks: 'x', koreksi: 2 })).toThrow(/sudah dikoreksi/)
  })
  it('validasi jenis, rinci, commit, dan teks kosong', () => {
    expect(() => tambahTemuan(LAPORAN_KOSONG, { teks: 'x', jenis: 'lain' })).toThrow(/Jenis/)
    expect(() => tambahTemuan(LAPORAN_KOSONG, { teks: 'x', jenis: 'risiko', rinci: 'r' })).toThrow(
      /data-uji/,
    )
    expect(() => tambahDilakukan(LAPORAN_KOSONG, { teks: 'x', commit: 'zzz' })).toThrow(/SHA/)
    expect(() => tambahDilakukan(LAPORAN_KOSONG, { teks: '  ' })).toThrow(/kosong/)
    expect(() => bacaTabel([{ dilaporkan: 'a' }])).toThrow(/sebelum/)
  })
  it('masalah satu blok: diganti menandai riwayat, penyebab lama dipertahankan', () => {
    const a = setMasalah(LAPORAN_KOSONG, 'satu', 'sebab')
    expect(a.diganti).toBe(false)
    const b = setMasalah(a.laporan, 'dua')
    expect(b.diganti).toBe(true)
    expect(b.laporan.masalah?.penyebab).toBe('sebab')
  })
  it('persetujuan Tams menempel di hasil; hasil ditulis ulang perlu disetujui lagi', () => {
    const l = setujuiHasil(isi())
    expect(l.hasil?.disetujui?.oleh).toBe('tams')
    expect(setHasil(l, { penyelesaian: 'baru' }).hasil?.disetujui).toBeUndefined()
    expect(() => setujuiHasil(LAPORAN_KOSONG)).toThrow(/belum ditulis/)
  })
})

describe('gerbang format 2', () => {
  it('brief: masalah + temuan penyebab + butir rencana', () => {
    expect(periksaLaporan({ ...LAPORAN_KOSONG, ...dasar }, 'brief').masalah).toHaveLength(3)
    expect(periksaLaporan({ ...isi(), ...dasar }, 'brief').ok).toBe(true)
  })
  it('temuan penyebab yang dikoreksi tidak dihitung', () => {
    let l = setMasalah(LAPORAN_KOSONG, 'm').laporan
    l = tambahTemuan(l, { teks: 'a', jenis: 'penyebab' })
    l = tambahTemuan(l, { teks: 'b', jenis: 'sampingan', koreksi: 1 })
    l = tambahDilakukan(l, { teks: 'r', rencana: true })
    expect(periksaLaporan({ ...l, ...dasar }, 'brief').ok).toBe(false)
  })
  it('akhir: penyelesaian terisi dan bukan sementara', () => {
    expect(periksaLaporan({ ...LAPORAN_KOSONG, ...dasar }, 'akhir').ok).toBe(false)
    const sem = setHasil(LAPORAN_KOSONG, { penyelesaian: 'x', sementara: true })
    expect(periksaLaporan({ ...sem, ...dasar }, 'akhir').masalah[0]).toMatch(/Sejauh ini/)
    expect(periksaLaporan({ ...isi(), ...dasar }, 'akhir').ok).toBe(true)
  })
})

const lengkap = (): LaporanLengkap => ({
  ...isi(),
  keputusan: [
    { id: 1, apa: 'Pilih X', oleh: 'ai', at: '2026-11-19T00:00:00Z', alasan: 'karena Y' },
    { id: 2, apa: 'Pilih Z', oleh: 'tams', at: '2026-11-19T00:00:00Z' },
  ],
  verifikasi: [{ kriteria: 'Kriteria A', hasil: 'lulus' }],
})

describe('panen dan deskripsi MR format 2', () => {
  it('panen disusun dari lima kartu, bukan catatan.md', () => {
    const md = isiPanen(
      {
        key: 'REQ-2',
        judul: 'J',
        url: '',
        branch: 'b',
        commit: [],
        tahap: 'Selesai',
        md: '## Masalah & penyebab\n\nTEKS LAMA',
        data: { keputusan: [], pertanyaan: [], mintaUbah: [], cekStaging: [] },
        verifikasi: [],
        laporan: lengkap(),
      },
      '2026-11-19',
    )
    for (const h of ['## Masalah', '## Temuan', '## Keputusan', '## Yang dilakukan', '## Hasil'])
      expect(md).toContain(h)
    expect(md).not.toContain('TEKS LAMA')
    expect(md).toContain('diambil AI, ditinjau Tams')
    expect(md).not.toContain('Salah') // butir yang dikoreksi tidak ikut
    expect(md).toContain('kriteria 1/1 lulus')
    expect(md).not.toContain('catatan.md')
  })
  it('deskripsi MR memakai laporan; format lama tetap dari catatan.md', () => {
    const t = {
      key: 'REQ-2',
      judul: 'J',
      url: '',
      md: '## Masalah & penyebab\n\nMASALAH LAMA',
      data: { keputusan: [], pertanyaan: [], mintaUbah: [], cekStaging: [] },
      verifikasi: [],
    }
    const baru = deskripsiMr({ tiket: [{ ...t, laporan: lengkap() }], branch: 'b', commit: [] })
    expect(baru.isi).toContain('**Temuan**')
    expect(baru.isi).toContain('**Penyelesaian.**')
    expect(baru.isi).not.toContain('MASALAH LAMA')
    expect(deskripsiMr({ tiket: [t], branch: 'b', commit: [] }).isi).toContain('MASALAH LAMA')
  })
  it('renderLaporanMd mencetak kelima bagian', () => {
    expect(renderLaporanMd('REQ-2', lengkap())).toContain('## Hasil')
  })
})

describe('kerja baru dan kerja lama', () => {
  it('kerja lokal dan kerja dari tiket Plane ber-format 2; kerja lokal mengisi masalah dari judul', () => {
    const k = kerjaLokal('BUG-9', 'Judul bug', 'chat', '2026-11-19T00:00:00Z')
    expect(formatDua(k)).toBe(true)
    expect(k.masalah?.ringkas).toBe('Judul bug')
    const { kerja } = kerjaDariTiket(
      {
        key: 'FMS-1',
        id: 'i',
        projectId: 'p',
        judul: 'J',
        deskripsiHtml: '',
        status: 'To Do',
        url: 'u',
      },
      null,
    )
    expect(kerja.format).toBe(2)
  })
  it('tiket yang diambil ulang tidak berganti format; kerja tanpa format tidak diberi kolom baru', () => {
    const { kerja } = kerjaDariTiket(
      {
        key: 'FMS-1',
        id: 'i',
        projectId: 'p',
        judul: 'J',
        deskripsiHtml: '',
        status: 'To Do',
        url: 'u',
      },
      null,
    )
    const { format: _f, temuan: _t, dilakukan: _d, ...lama } = kerja
    const n = normalkanKerja(lama as never)
    expect(formatDua(n)).toBe(false)
    expect('temuan' in n).toBe(false)
    expect(
      kerjaDariTiket(
        {
          key: 'FMS-1',
          id: 'i',
          projectId: 'p',
          judul: 'J2',
          deskripsiHtml: '',
          status: 'x',
          url: 'u',
        },
        n,
      ).kerja.format,
    ).toBeUndefined()
  })
})

const data = (kerja: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  kerja: {
    key: 'REQ-2',
    judul: 'J',
    url: '',
    plane: { status: 'Tanpa Plane' },
    tahap: 'dikerjakan',
    riwayat: [{ at: '2026-11-19T00:00:00Z', tahap: 'diambil', catatan: 'x' }],
    verifikasi: [{ kriteria: 'K1', hasil: 'lulus', bukti: 'ok' }],
    commit: [],
    keputusan: [],
    pertanyaan: [],
    mintaUbah: [],
    target: { layar: [], db: [] },
    potret: {},
    ...kerja,
  },
  tiket: '# REQ-2 · J\n\nIsi tiket penuh',
  catatan: '# Catatan lama\n\n## Masalah & penyebab\n\nCATATAN LAMA ADA',
  perhatian: '',
  db: [],
  butuh: null,
  periksa: { akhir: { ok: true, masalah: [] } },
  ...extra,
})

describe('render halaman Kerja', () => {
  const f2 = () => ({
    format: 2,
    ...isi(),
    keputusan: lengkap().keputusan,
    verifikasi: lengkap().verifikasi,
  })
  const kini = new Date('2026-11-19T12:00:00Z').getTime()
  it('format 2: lima kartu, tanpa tab Catatan, tanpa kartu Bukti/Dilakukan lama', () => {
    const html = laporanKerja(data(f2()) as never, { kini }) as { view: string }
    for (const a of [
      'Masalah',
      'Temuan',
      'Keputusan',
      'Yang dilakukan',
      'Hasil',
      'Langkah berikutnya',
    ])
      expect(html.view).toContain(a)
    expect(html.view).not.toContain('>Catatan<')
    expect(html.view).not.toContain('CATATAN LAMA ADA')
    expect(html.view).not.toContain('kj-poin')
    expect(html.view).toContain('Lihat tiket lengkap')
    expect(tabKerja(data(f2()) as never).map((t: string[]) => t[0])).toEqual([
      'layar',
      'data',
      'kode',
    ])
  })
  it('butir dikoreksi dicoret, keputusan AI bertanda, commit tertaut ke tab Kode, rinci buka-tutup', () => {
    const v = (laporanKerja(data(f2()) as never, { kini }) as { view: string }).view
    expect(v).toMatch(/kj-butir coret[^>]*data-butir="2"/)
    expect(v).toContain('⚠ ditinjau Tams')
    expect(v).toContain('href="#/kerja/REQ-2/kode"')
    expect(v).toContain('data-kj-buka="rinci-2"')
    expect(v).not.toContain('Langkah <b>uji</b>')
    const buka = (
      laporanKerja(data(f2()) as never, { kini, buka: new Set(['rinci-2', 'kriteria']) }) as {
        view: string
      }
    ).view
    expect(buka).toContain('Langkah <b>uji</b>')
    expect(buka).toContain('kriteria 1/1')
  })
  it('sorotan hanya untuk butir < 10 menit; hasil sementara berlabel Sejauh ini', () => {
    const k = f2()
    const baru = k.temuan.map((t) => ({ ...t, at: new Date(kini - 60_000).toISOString() }))
    const lama = k.temuan.map((t) => ({ ...t, at: new Date(kini - 3_600_000).toISOString() }))
    const h = (temuan: unknown) =>
      (laporanKerja(data({ ...k, temuan }) as never, { kini }) as { view: string }).view
    expect(h(baru)).toContain('kj-butir baru')
    expect(h(lama)).not.toContain('kj-butir baru')
    const sem = (
      laporanKerja(data({ ...k, hasil: { ...k.hasil, sementara: true } }) as never, { kini }) as {
        view: string
      }
    ).view
    expect(sem).toContain('Sejauh ini')
  })
  it('kerja lama (tanpa format) tetap memakai catatan.md dan tab Catatan', () => {
    const d = data({})
    const v = (laporanKerja(d as never, { kini }) as { view: string }).view
    expect(v).toContain('kj-ringkas-kolom')
    expect(v).toContain('Catatan')
    expect(v).not.toContain('kj-lk-masalah')
    expect(tabKerja(d as never).map((t: string[]) => t[0])).toContain('catatan')
  })
})

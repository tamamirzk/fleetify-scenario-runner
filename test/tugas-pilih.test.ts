import { describe, expect, it } from 'vitest'
import { bilahPilih, centangPilih, halamanTugas, kartuTugas } from '../panel/js/tugas.js'

const tiket = (o: Record<string, unknown> = {}) => ({
  key: 'FMS-11',
  judul: 'Kuota Perlu Perhatian',
  url: 'https://plane.test/FMS-11',
  status: 'Todo',
  grup: 'unstarted',
  prioritas: 'high',
  label: [],
  skenario: [],
  selesai: false,
  ...o,
})

describe('Tugas saya: ambil beberapa sekaligus', () => {
  it('kotak centang hanya untuk tiket terbuka yang belum diambil', () => {
    expect(centangPilih(tiket())).toContain('data-tg-pilih="FMS-11"')
    expect(centangPilih(tiket({ kerja: { tahap: 'diambil' } }))).toBe('')
    expect(centangPilih(tiket({ selesai: true }))).toBe('')
    expect(centangPilih(tiket(), new Set(['FMS-11']))).toContain('checked')
  })

  it('kartu membawa kotak centang; bilah muncul hanya bila ada yang dipilih', () => {
    expect(kartuTugas(tiket())).toContain('tg-pilih')
    expect(bilahPilih(0)).toBe('')
    expect(bilahPilih(2)).toContain('2 dipilih')
    expect(bilahPilih(2)).toContain('id="tg-ambil-pilih"')
  })

  it('halaman menampilkan bilah sesuai jumlah pilihan', () => {
    const data = {
      dikonfigurasi: true,
      project: 'Fleetify v2',
      status: [{ nama: 'Todo', grup: 'unstarted' }],
      tugas: [tiket(), tiket({ key: 'FMS-12' })],
    }
    expect(halamanTugas(data)).not.toContain('tg-bilah-pilih')
    expect(halamanTugas(data, { dipilih: new Set(['FMS-11', 'FMS-12']) })).toContain('2 dipilih')
  })
})

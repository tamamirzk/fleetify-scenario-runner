// Ralat pemilik "resolusi runner": HANYA tampilan langsung (screencast) dipertajam; screenshot langkah/laporan
// tidak berubah. Setelan Mutu gambar: Tajam (bawaan panel) / Hemat (perilaku lama), diingat peramban.
import { describe, expect, it } from 'vitest'
import { kotakTampilan, muatPilihan, simpanPilihan } from '../panel/js/pilihan.js'
import {
  bacaLayar,
  bacaMutu,
  opsiScreencast,
  SCREENCAST_HEMAT,
  TAMPILAN_BAWAAN,
} from '../src/core/tampilan.ts'

describe('opsi screencast', () => {
  it('hemat = perilaku lama persis', () => {
    expect(opsiScreencast('hemat')).toEqual({
      format: 'jpeg',
      quality: 70,
      maxWidth: 1400,
      maxHeight: 900,
    })
    expect(opsiScreencast('hemat', { w: 1000, h: 625, dpr: 2 })).toEqual(SCREENCAST_HEMAT)
  })
  it('tajam: mutu ≥ 90, batas = area tampil × dpr, dibatasi 2560×1600, tak di bawah batas lama', () => {
    const o = opsiScreencast('tajam', { w: 1000, h: 625, dpr: 2 })
    expect(o.quality).toBeGreaterThanOrEqual(90)
    expect([o.maxWidth, o.maxHeight]).toEqual([2000, 1250])
    expect(opsiScreencast('tajam', { w: 1800, h: 1100, dpr: 2 })).toMatchObject({
      maxWidth: 2560,
      maxHeight: 1600,
    })
    // Panel kecil di layar dpr 1: tidak lebih kecil daripada Hemat.
    expect(opsiScreencast('tajam', { w: 600, h: 400, dpr: 1 })).toMatchObject({
      maxWidth: 1400,
      maxHeight: 900,
    })
    // Layar panel belum dilapor: batas wajar maksimum.
    expect(opsiScreencast('tajam')).toMatchObject({ maxWidth: 2560, maxHeight: 1600 })
  })
  it('masukan mutu dan layar divalidasi', () => {
    expect(bacaMutu(undefined)).toBe('hemat')
    expect(bacaMutu('', 'tajam')).toBe('tajam')
    expect(bacaMutu('tajam')).toBe('tajam')
    expect(() => bacaMutu('ultra')).toThrow(/tidak tersedia/)
    expect(bacaLayar({ w: 1000.4, h: 600, dpr: 2 })).toEqual({ w: 1000, h: 600, dpr: 2 })
    expect(bacaLayar({ w: 0, h: 600, dpr: 2 })).toBeNull()
    expect(bacaLayar({ w: 'x' })).toBeNull()
    expect(bacaLayar({ w: 100, h: 100, dpr: 9 })?.dpr).toBe(4)
  })
  it('screenshot tidak tersentuh: tampilan bawaan tanpa mutu, deviceScaleFactor tetap = skala', () => {
    expect(TAMPILAN_BAWAAN).toEqual({ ukuran: { w: 1400, h: 900 }, skala: 1 })
  })
})

describe('setelan Mutu gambar di panel', () => {
  const simpanan = () => {
    const m = new Map<string, string>()
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    }
  }
  it('bawaan tajam, diingat, nilai asing diabaikan', () => {
    const st = simpanan()
    expect(muatPilihan(st)).toMatchObject({ mutu: 'tajam', mutuTersimpan: false })
    simpanPilihan(st, { mutu: 'hemat' })
    expect(muatPilihan(st)).toMatchObject({ mutu: 'hemat', mutuTersimpan: true })
    simpanPilihan(st, { mutu: 'ultra' })
    expect(muatPilihan(st).mutu).toBe('hemat')
  })
  it('kotak Tampilan aplikasi memuat Mutu gambar berketerangan "hanya tampilan langsung"', () => {
    const h = kotakTampilan('1280x800', 1, 'hemat')
    expect(h).toContain('id="tampilan-mutu"')
    expect(h).toContain('<option value="hemat" selected>Hemat')
    expect(h).toContain('Tajam (bawaan)')
    expect(h).toContain('screenshot langkah dan laporan tidak berubah')
  })
})

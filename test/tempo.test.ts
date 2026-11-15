// Tempo tontonan: jalan dari panel = tempo tontonan penuh walau headless; kecepatan lambat
// 0,25×/0,5× diingat; "Jeda tiap langkah" menjeda di awal setiap langkah sampai Lanjut.
import { describe, expect, it } from 'vitest'
import { menuKecepatan, muatPilihan, simpanPilihan } from '../panel/js/pilihan.js'
import { Controller, clampSpeed, skalaTahan } from '../src/core/controller.ts'

describe('tempo tontonan', () => {
  it('panel selalu pengali 1 (juga headless); HEADLESS_HOLD hanya untuk CLI/uji', () => {
    expect(skalaTahan({ headed: false, panel: true, headlessHold: 0.15 })).toBe(1)
    expect(skalaTahan({ headed: true, panel: false, headlessHold: 0.15 })).toBe(1)
    expect(skalaTahan({ headed: false, panel: false, headlessHold: 0.15 })).toBe(0.15)
  })

  it('kecepatan lambat 0,25× dan 0,5× diizinkan', () => {
    expect(clampSpeed(0.25)).toBe(0.25)
    expect(clampSpeed(0.5)).toBe(0.5)
    const c = new Controller({ speed: 0.25 })
    expect(c.speed).toBe(0.25)
  })
})

describe('pilihan diingat', () => {
  const simpanan = () => {
    const m = new Map<string, string>()
    return {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      m,
    }
  }
  it('kecepatan dan jeda tiap langkah tersimpan dan dimuat lagi; nilai asing diabaikan', () => {
    const s = simpanan()
    expect(muatPilihan(s)).toMatchObject({
      kecepatan: 1,
      jedaTiapLangkah: false,
      jedaTersimpan: false,
    })
    simpanPilihan(s, { kecepatan: 0.25, jedaTiapLangkah: true })
    expect(muatPilihan(s)).toMatchObject({
      kecepatan: 0.25,
      jedaTiapLangkah: true,
      jedaTersimpan: true,
    })
    simpanPilihan(s, { jedaTiapLangkah: false })
    expect(muatPilihan(s)).toMatchObject({ jedaTiapLangkah: false, jedaTersimpan: true })
    simpanPilihan(s, { kecepatan: 7 })
    expect(muatPilihan(s).kecepatan).toBe(0.25)
    s.m.set('srf.kecepatan', 'abc')
    expect(muatPilihan(s).kecepatan).toBe(1)
  })
  it('penyimpanan diblokir tidak memecahkan panel', () => {
    const rusak = {
      getItem: () => {
        throw new Error('diblokir')
      },
      setItem: () => {
        throw new Error('diblokir')
      },
    }
    expect(muatPilihan(rusak)).toMatchObject({
      kecepatan: 1,
      jedaTiapLangkah: false,
      jedaTersimpan: false,
    })
    expect(() => simpanPilihan(rusak, { kecepatan: 0.5 })).not.toThrow()
    expect(muatPilihan(null)).toMatchObject({
      kecepatan: 1,
      jedaTiapLangkah: false,
      jedaTersimpan: false,
    })
  })
  it('menu: 0,25×–3× dan sakelar Jeda tiap langkah', () => {
    const h = menuKecepatan(0.5, true)
    expect(h).toContain('data-speed="0.25"')
    expect(h).toContain('aria-checked="true" data-speed="0.5"')
    expect(h).toContain('data-speed="3"')
    expect(h).toContain('role="menuitemcheckbox" aria-checked="true" data-jeda-langkah')
    expect(menuKecepatan(1, false)).toContain('aria-checked="false" data-jeda-langkah')
  })
})

describe('jeda tiap langkah', () => {
  const tunggu = (ms: number) => new Promise((r) => setTimeout(r, ms))
  it('mati: awal langkah langsung lewat', async () => {
    const c = new Controller()
    await c.awalLangkah()
    expect(c.paused).toBe(false)
  })
  it('nyala: berhenti di awal langkah (gerbang pertama) sampai Lanjut', async () => {
    const c = new Controller()
    c.setJedaTiapLangkah(true)
    let lewat = false
    await c.awalLangkah()
    const p = c.gate().then(() => {
      lewat = true
    })
    await tunggu(30)
    expect(c.paused).toBe(true)
    expect(lewat).toBe(false)
    c.resume()
    await p
    expect(lewat).toBe(true)
    expect(c.paused).toBe(false)
  })
  it('Satu aksi melewati satu gerbang lalu tetap dijeda', async () => {
    const c = new Controller()
    c.setJedaTiapLangkah(true)
    await c.awalLangkah()
    const p = c.gate()
    await tunggu(20)
    c.step()
    await p
    expect(c.paused).toBe(true)
    c.stop()
  })
})

// Persona lapangan (driver, mekanik) memakai ponsel: viewport 390×844, tidak ikut skala Tampilan.
import { describe, expect, it } from 'vitest'
import { PERSONA_IDS, pakaiPonsel } from '../src/core/personas.ts'
import { TAMPILAN_BAWAAN, UKURAN_PONSEL, viewportPersona } from '../src/core/tampilan.ts'

describe('persona berponsel', () => {
  it('driver dan mekanik berponsel; persona kantor tidak', () => {
    expect(PERSONA_IDS).toContain('mbl.driver')
    expect(pakaiPonsel('mbl.driver')).toBe(true)
    expect(pakaiPonsel('mbl.mechanic')).toBe(true)
    expect(pakaiPonsel('mbl.planner')).toBe(false)
    expect(pakaiPonsel('mbl.foreman')).toBe(false)
  })

  it('viewport ponsel tetap 390×844 di skala apa pun; laptop mengikuti ukuran ÷ skala', () => {
    const kecil = { ukuran: { w: 1400, h: 900 }, skala: 0.8 }
    expect(viewportPersona(TAMPILAN_BAWAAN, true)).toEqual(UKURAN_PONSEL)
    expect(viewportPersona(kecil, true)).toEqual({ width: 390, height: 844 })
    expect(viewportPersona(TAMPILAN_BAWAAN, false)).toEqual({ width: 1400, height: 900 })
    expect(viewportPersona(kecil, false)).toEqual({ width: 1750, height: 1125 })
  })
})

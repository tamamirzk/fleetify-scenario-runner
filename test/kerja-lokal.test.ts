import { describe, expect, it } from 'vitest'
import { kerjaLokal, kunciLokalBerikut } from '../src/core/kerja-lokal.ts'

describe('kerja lokal tanpa tiket Plane', () => {
  it('nomor berikutnya per awalan, tanpa tertukar dengan tiket Plane', () => {
    const ada = ['BUG-1', 'BUG-3', 'REQ-1', 'FMS-0', 'FMS-87', 'BUG-x', '_klaster-meter']
    expect(kunciLokalBerikut('BUG', ada)).toBe('BUG-4')
    expect(kunciLokalBerikut('REQ', ada)).toBe('REQ-2')
    expect(kunciLokalBerikut('REQ', [])).toBe('REQ-1')
  })

  it('catatan lengkap: target tidak null, Plane ditandai tanpa tiket', () => {
    const k = kerjaLokal('BUG-4', 'Contoh', 'chat 19 Nov', '2026-11-19T00:00:00.000Z')
    expect(k.target).toEqual({ layar: [], db: [] })
    expect(k.plane.status).toBe('Tanpa Plane')
    expect(k.tahap).toBe('diambil')
    expect(k.riwayat[0]?.catatan).toContain('chat 19 Nov')
  })
})

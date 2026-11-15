import { describe, expect, test } from 'vitest'
import { chipStatus, chipTiket, chipTiketDaftar, esc } from '../panel/js/komponen.js'

describe('komponen dasar', () => {
  test('esc membuang markup', () => {
    expect(esc('<b a="1">&</b>')).toBe('&lt;b a=&quot;1&quot;&gt;&amp;&lt;/b&gt;')
    expect(esc(null)).toBe('')
  })

  test('chip status selalu bertulisan, nada tak dikenal jadi idle', () => {
    expect(chipStatus('Dijeda', 'warn')).toBe('<span class="st-chip warn">Dijeda</span>')
    expect(chipStatus('X', 'kuning')).toContain('st-chip idle')
  })

  test('chip tiket: sumber · key, tautan hanya untuk http(s)', () => {
    const a = chipTiket({ sumber: 'plane', key: 'FMS-63', url: 'https://plane.example/FMS-63' })
    expect(a).toMatch(/^<a class="ticket" href="https:\/\/plane.example\/FMS-63"/)
    expect(a).toContain('Plane ·')
    const b = chipTiket({ sumber: 'jira', key: 'FMS-1', url: 'javascript:alert(1)' })
    expect(b).toMatch(/^<span class="ticket"/)
    expect(chipTiket({ sumber: 'jira', key: 'FMS-2' }, { ringkas: true })).not.toContain('Jira ·')
  })

  test('daftar tiket menulis sumber sekali per kelompok', () => {
    const h = chipTiketDaftar([
      { sumber: 'jira', key: 'FMS-71' },
      { sumber: 'jira', key: 'FMS-61' },
      { sumber: 'plane', key: 'FMS-9' },
    ])
    expect(h.match(/Jira ·/g)).toHaveLength(1)
    expect(h.match(/Plane ·/g)).toHaveLength(1)
  })
})

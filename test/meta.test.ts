import { describe, expect, it } from 'vitest'
import { MetaSchema, type ScenarioMeta } from '../src/core/meta.ts'
import { checkScenario, lintSource } from '../src/core/rules.ts'
import type { Scenario } from '../src/core/types.ts'

const meta: ScenarioMeta = {
  id: 'contoh',
  title: 'Contoh skenario',
  group: 'material',
  tickets: ['FMS-1'],
  estimasi: '3 menit',
  tujuan: 'Membuktikan sesuatu yang terlihat di layar.',
  personas: [{ who: 'mbl.planner', peran: 'membuka halaman' }],
  data: ['Satu barang baru'],
  setelan: [],
  prasyarat: [],
  catatan: [],
}
const step = {
  id: 'buka',
  who: 'mbl.planner' as const,
  title: 'Putri membuka',
  expect: 'Tampil',
  run: async () => {},
}
const scenario = (patch: Partial<Scenario> = {}): Scenario => ({ meta, steps: [step], ...patch })

describe('MetaSchema', () => {
  it('menerima meta lengkap', () => {
    expect(MetaSchema.safeParse(meta).success).toBe(true)
  })

  it('menolak field wajib yang hilang, field asing, dan format salah', () => {
    const { tujuan: _t, ...noTujuan } = meta
    expect(MetaSchema.safeParse(noTujuan).success).toBe(false)
    expect(MetaSchema.safeParse({ ...meta, extra: 1 }).success).toBe(false)
    expect(MetaSchema.safeParse({ ...meta, tickets: ['fms71'] }).success).toBe(false)
    expect(MetaSchema.safeParse({ ...meta, estimasi: '3m' }).success).toBe(false)
    expect(
      MetaSchema.safeParse({ ...meta, personas: [{ who: 'orang.asing', peran: 'x y z' }] }).success,
    ).toBe(false)
  })

  it('pengecualian wajib beralasan', () => {
    expect(
      MetaSchema.safeParse({
        ...meta,
        pengecualian: [{ aturan: 'db-lewat-api', alasan: 'karena' }],
      }).success,
    ).toBe(false)
  })
})

describe('checkScenario', () => {
  it('lulus untuk skenario sah', () => {
    expect(checkScenario('contoh', scenario())).toEqual([])
  })

  it('id meta harus sama dengan nama berkas', () => {
    expect(checkScenario('lain', scenario()).map((p) => p.rule)).toContain('satu-berkas')
  })

  it('setelan yang diubah wajib dikembalikan atau beralasan menetap', () => {
    const s = scenario({ meta: { ...meta, setelan: ['Alur PO diberi SLA'] } })
    expect(checkScenario('contoh', s).map((p) => p.rule)).toContain('setelan-dikembalikan')
    expect(checkScenario('contoh', { ...s, cleanup: async () => {} })).toEqual([])
  })

  it('langkah wajib punya expect, id unik, dan persona terdaftar', () => {
    const rules = checkScenario(
      'contoh',
      scenario({
        steps: [{ ...step, expect: '' }, step, { ...step, id: 'dua', who: 'mbl.mechanic' }],
      }),
    ).map((p) => p.rule)
    expect(rules).toEqual(['langkah', 'langkah', 'persona'])
  })
})

describe('lintSource', () => {
  it('menolak aksi Playwright mentah tapi menerima helper k', () => {
    expect(lintSource("await page.getByRole('button').click()")).toHaveLength(1)
    expect(lintSource('await page.keyboard.press("Escape")')).toHaveLength(1)
    expect(lintSource('await k.click(page, btn)')).toEqual([])
    expect(lintSource('await ctx.k.fill(page, input, "1")')).toEqual([])
  })

  it('menolak waitForTimeout, id tertulis, dan akses DB tanpa pengecualian', () => {
    const rules = (src: string, o = {}) => lintSource(src, o).map((p) => p.rule)
    expect(rules('await page.waitForTimeout(500)')).toEqual(['tahan-lewat-ctx'])
    expect(rules("const WH = '78aa0569-bddb-41b6-af9b-ceb45b152195'")).toEqual([
      'tanpa-id-tertulis',
    ])
    expect(rules("import { execFileSync } from 'node:child_process'")).toEqual(['db-lewat-api'])
    expect(
      rules("import { execFileSync } from 'node:child_process'", { pengecualianDb: true }),
    ).toEqual([])
  })
})

// Pemeriksa DOM pada halaman HTML statis (tanpa server v2), lewat Playwright headless.
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { type Browser, chromium, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  KELAS_OVERLAY,
  periksaDomHalaman,
  screenshotBersorot,
  uraiToken,
} from '../src/pemeriksaan/ui-dom.ts'

const token = uraiToken(
  `export const brand = { yellow: '#FFDB0E', ink: '#1A1D21', inkSoft: '#5B6470', tint: 'rgba(255,219,14,0.14)' }
   export const neutral = { 0: '#FFFFFF', 50: '#F7F8FA', 100: '#EEF0F3', 300: '#CBD0D8' }
   export const radius = { sm: 8, md: 12, lg: 16 } as const`,
  `divider: 'rgba(26,29,33,0.10)'`,
)
const html = readFileSync(path.join(import.meta.dirname, 'fixtures/ui-dom.html'), 'utf8')

let browser: Browser
let page: Page
beforeAll(async () => {
  browser = await chromium.launch({ headless: true })
  page = await browser.newPage({ viewport: { width: 900, height: 1200 } })
  await page.setContent(html)
}, 30_000)
afterAll(async () => {
  await browser?.close()
})

describe('periksaDom (fixture)', () => {
  it('menandai elemen melanggar dan membiarkan yang sah', async () => {
    const h = await periksaDomHalaman(page, token, [])
    const per = (a: string) => h.temuan.filter((t) => t.aturan === a).map((t) => t.selector)
    expect(per('warna-luar-token').join('|')).toMatch(/Ungu bukan token/)
    expect(per('radius-menyimpang').join('|')).toMatch(/Radius 5px/)
    expect(per('bayangan-kartu')).toHaveLength(1)
    expect(per('bayangan-kartu')[0]).toMatch(/Kartu berbayang/)
    expect(per('font-bukan-inter').join('|')).toMatch(/Font lain/)
    expect(per('kontras-kuning').join('|')).toMatch(/Teks kuning di atas putih/)
    expect(per('kontras-kuning').join('|')).toMatch(/Teks putih di atas kuning/)
    const semua = h.temuan.map((t) => t.selector).join('|')
    for (const sah of [
      'Kartu sah',
      'Tint kuning alpha',
      'Ajukan',
      'Pill',
      'Card datar',
      'Dialog berbayang',
      'Bar mengambang',
      'Grafik',
    ])
      expect(semua).not.toContain(sah)
    expect(h.elemen).toBeGreaterThan(10)
    expect(h.evalMs).toBeLessThan(300)
  })
  it('aturan nonaktif tidak dinilai', async () => {
    const h = await periksaDomHalaman(page, token, ['warna-luar-token', 'kontras-kuning'])
    expect(
      h.temuan.some((t) => t.aturan === 'warna-luar-token' || t.aturan === 'kontras-kuning'),
    ).toBe(false)
  })
  it('screenshot bersorot terbentuk dan overlay dihapus', async () => {
    const h = await periksaDomHalaman(page, token, [])
    const dir = mkdtempSync(path.join(tmpdir(), 'sr-ui-'))
    try {
      const f = path.join(dir, '01-x-ui.png')
      expect(await screenshotBersorot(page, h.temuan, f)).toBe(true)
      expect(existsSync(f)).toBe(true)
      expect(await page.locator(`.${KELAS_OVERLAY}`).count()).toBe(0)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

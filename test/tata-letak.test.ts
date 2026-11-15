// Uji tata letak runner: baris Catat temuan menempel di bawah screenshot, kartu kanan
// menutup screenshot paling banyak ±40 px, dan cincin target tidak pernah tertutup kartu.
// Bagian murni + satu uji browser (Playwright, 1440×900, CSS panel sungguhan).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { type Browser, chromium, type Page } from 'playwright'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { kartuLangkah, kerangkaRunner } from '../panel/js/komponen.js'
import { bertumpuk, kotakCincin, perluGeser, tutupan } from '../panel/js/tata-letak.js'

const kotak = (left: number, top: number, right: number, bottom: number) => ({
  left,
  top,
  right,
  bottom,
})

describe('aturan tata letak (murni)', () => {
  test('tutupan hanya dihitung bila bertumpuk vertikal', () => {
    expect(tutupan(kotak(0, 0, 940, 590), kotak(900, 0, 1280, 400))).toBe(40)
    expect(tutupan(kotak(0, 0, 940, 590), kotak(900, 600, 1280, 700))).toBe(0)
    expect(tutupan(kotak(0, 0, 940, 590), kotak(950, 0, 1280, 400))).toBe(0)
  })

  test('kotak cincin dari bbox relatif', () => {
    const c = kotakCincin(
      { bbox: { x: 0.5, y: 0.5, w: 0.1, h: 0.1 } },
      kotak(100, 100, 1100, 700),
      0,
    )
    expect(c).toEqual(kotak(600, 400, 700, 460))
    expect(bertumpuk(kotak(0, 0, 10, 10), kotak(10, 0, 20, 10))).toBe(false)
  })

  test('geser hanya bila sasaran di bawah kartu', () => {
    const shot = kotak(0, 0, 940, 588)
    const kartu = [kotak(900, 0, 1280, 450)]
    const tepi = { bbox: { x: 0.9125, y: 0.552, w: 0.0609, h: 0.05 } }
    expect(perluGeser(tepi, shot, kartu)).toBe(true)
    expect(perluGeser({ bbox: { x: 0.5, y: 0.5, w: 0.1, h: 0.05 } }, shot, kartu)).toBe(false)
    expect(perluGeser({ bbox: { x: 0.95, y: 0.9, w: 0.04, h: 0.05 } }, shot, kartu)).toBe(false)
    expect(perluGeser(null, shot, kartu)).toBe(false)
  })
})

const css = ['tokens.css', 'panel.css']
  .map((f) => readFileSync(path.join(import.meta.dirname, '../panel', f), 'utf8'))
  .join('\n')
const run = {
  run_id: 'x/1',
  title: 'Permintaan barang',
  status: 'jeda',
  started_at: '2026-11-14T10:00:00Z',
  from_step: 0,
  current_step: 1,
  current_aksi: 0,
  findings: [],
  steps: [1, 2, 3].map((n) => ({
    n,
    title: `Langkah ${n} dengan judul yang cukup panjang untuk dua baris`,
    expect: 'Status berubah menjadi Menunggu persetujuan',
    deskripsi:
      n === 2
        ? 'Wati membuka MR berstatus Draf berisi dua Torque Wrench lalu menekan Ajukan.'
        : null,
    who_name: 'Putri (Planner)',
    status: n === 1 ? 'lulus' : n === 2 ? 'berjalan' : 'menunggu',
    aksi: [{ teks: 'Klik tombol “Ajukan”', status: 'berjalan' }],
    belakang: false,
  })),
}

describe('tata letak runner di browser (1440×900)', () => {
  let browser: Browser
  let page: Page
  beforeAll(async () => {
    browser = await chromium.launch()
    page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
    await page.setContent(
      `<!doctype html><html><head><style>${css}</style></head><body><div class="page"><div class="win runner"><header class="win-bar" style="height:57px"></header><main class="win-body">${kerangkaRunner()}</main></div></div></body></html>`,
    )
    await page.evaluate((html) => {
      const side = document.getElementById('rn-side')
      if (side) side.innerHTML = html
      document.getElementById('rn-area')?.style.setProperty('--ar', String(1280 / 800))
    }, kartuLangkah(run))
  }, 30_000)
  afterAll(async () => {
    await browser?.close()
  })

  const ukur = () =>
    page.evaluate(() => {
      const r = (id: string) => {
        const b = document.getElementById(id)?.getBoundingClientRect()
        return b ? { left: b.left, top: b.top, right: b.right, bottom: b.bottom } : null
      }
      const panels = [...(document.getElementById('rn-side')?.children ?? [])].map((el) => {
        const b = el.getBoundingClientRect()
        return { left: b.left, top: b.top, right: b.right, bottom: b.bottom }
      })
      return { shot: r('rn-shot'), note: r('rn-note'), rel: r('rn-rel'), panels }
    })

  test('tanpa bingkai jendela tiruan: panel memenuhi viewport, toolbar menempel di tepi atas', async () => {
    const w = await page.evaluate(() => {
      const win = document.querySelector('.win') as HTMLElement
      const bar = document.querySelector('.win-bar') as HTMLElement
      const b = win.getBoundingClientRect()
      const cs = getComputedStyle(win)
      return {
        rect: [b.left, b.top, b.width, b.height],
        radius: cs.borderTopLeftRadius,
        border: cs.borderTopWidth,
        barTop: bar.getBoundingClientRect().top,
      }
    })
    expect(w.rect).toEqual([0, 0, 1440, 900])
    expect(w.radius).toBe('0px')
    expect(w.border).toBe('0px')
    expect(w.barTop).toBe(0)
    const html = readFileSync(path.join(import.meta.dirname, '../panel/index.html'), 'utf8')
    expect(html).not.toContain('class="dots"')
  })

  test('baris Catat temuan menempel tepat di bawah screenshot, selebar screenshot', async () => {
    const { shot, note } = await ukur()
    if (!shot || !note) throw new Error('elemen tidak ada')
    expect(note.top - shot.bottom).toBeGreaterThanOrEqual(8)
    expect(note.top - shot.bottom).toBeLessThanOrEqual(16)
    expect(Math.abs(note.left - shot.left)).toBeLessThan(1)
    expect(Math.abs(note.right - shot.right)).toBeLessThan(1)
  })

  test('kartu kanan menutup screenshot paling banyak ±40 px; rel tidak menutup', async () => {
    const { shot, panels, rel } = await ukur()
    const t = Math.max(...panels.map((p) => tutupan(shot, p)))
    expect(t).toBeGreaterThan(0)
    expect(t).toBeLessThanOrEqual(41)
    expect(tutupan(shot, rel)).toBe(0)
  })

  test('sasaran di bawah kartu → screenshot diperkecil, cincin tidak tertutup', async () => {
    const target = { bbox: { x: 0.9125, y: 0.08, w: 0.0609, h: 0.05 } }
    const a = await ukur()
    expect(perluGeser(target, a.shot, a.panels)).toBe(true)
    await page.evaluate(() => document.getElementById('rn')?.classList.add('geser'))
    const b = await ukur()
    expect(perluGeser(target, b.shot, b.panels)).toBe(false)
    expect(Math.max(...b.panels.map((p) => tutupan(b.shot, p)))).toBe(0)
    // Baris temuan tetap menempel sesudah digeser.
    if (!b.shot || !b.note) throw new Error('elemen tidak ada')
    expect(b.note.top - b.shot.bottom).toBeLessThanOrEqual(16)
    await page.evaluate(() => document.getElementById('rn')?.classList.remove('geser'))
  })
})

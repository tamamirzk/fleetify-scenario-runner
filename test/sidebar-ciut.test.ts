// Sidebar bisa diciutkan menjadi rel ikon, tiap grup bisa dibuka-tutup (diingat), di
// ponsel sidebar menjadi laci; kelompok modul di daftar skenario bisa dibuka-tutup + Ciutkan/Buka semua.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { type Browser, chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, test } from 'vitest'
import { aksiPintasan } from '../panel/js/pintasan.js'
import {
  balik,
  bukaAktif,
  grupAktif,
  idGrup,
  lipatSemua,
  muatSidebar,
  simpanSidebar,
  terbuka,
} from '../panel/js/sidebar-ciut.js'
import { daftarSkenario, sidebar, sidebarBawah } from '../panel/js/skenario.js'

const css = ['tokens.css', 'panel.css']
  .map((f) => readFileSync(path.join(import.meta.dirname, '../panel', f), 'utf8'))
  .join('\n')
const PROJECT = {
  id: 'fleetify-v2',
  nama: 'Fleetify v2',
  modul: [
    { id: 'wo', nama: 'Work Order', jumlah: 10 },
    { id: 'material', nama: 'Material & Gudang', jumlah: 4 },
  ],
}
const simpanan = () => {
  const m = new Map<string, string>()
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
  }
}
const sb = (o: Record<string, unknown> = {}) =>
  sidebar({
    halaman: 'skenario',
    project: PROJECT,
    modulAktif: null,
    jumlahSemua: 14,
    jalanAktif: false,
    ...o,
  })

describe('keadaan buka-tutup (murni)', () => {
  it('bawaan: grup terbuka, rincian Sumber tugas tertutup', () => {
    const t = new Set<string>()
    expect(terbuka(t, 'uji')).toBe(true)
    expect(terbuka(t, 'proj')).toBe(true)
    expect(terbuka(t, 'mcp')).toBe(false)
    expect(terbuka(balik(t, 'uji'), 'uji')).toBe(false)
    expect(terbuka(balik(t, 'mcp'), 'mcp')).toBe(true)
    expect(terbuka(balik(balik(t, 'mcp'), 'mcp'), 'mcp')).toBe(false)
  })
  it('diingat sesudah muat ulang (localStorage); data rusak diabaikan', () => {
    const st = simpanan()
    expect(muatSidebar(st)).toEqual({ ciut: false, tutup: new Set(), lipat: new Set() })
    simpanSidebar(st, { ciut: true, tutup: new Set(['uji', '+mcp']), lipat: new Set(['ban']) })
    expect(muatSidebar(st)).toEqual({
      ciut: true,
      tutup: new Set(['uji', '+mcp']),
      lipat: new Set(['ban']),
    })
    st.setItem('srf.sbGrupTutup', '{rusak')
    expect(muatSidebar(st).tutup).toEqual(new Set())
  })
  it('grup yang memuat butir aktif dibuka saat halaman dimuat', () => {
    const tutup = new Set(['proj', 'uji', 'sasaran'])
    const a = bukaAktif(tutup, grupAktif({ halaman: 'skenario', modulAktif: 'material' }))
    expect(terbuka(a, 'proj') && terbuka(a, 'uji')).toBe(true)
    expect(terbuka(a, 'sasaran')).toBe(false)
    expect(grupAktif({ halaman: 'riwayat' })).toEqual([])
  })
  it('Ciutkan semua / Buka semua', () => {
    expect(lipatSemua(['a', 'b'], true)).toEqual(new Set(['a', 'b']))
    expect(lipatSemua(['a', 'b'], false)).toEqual(new Set())
  })
  it('pintasan \\ hanya di halaman bersidebar, tidak saat mengetik, tidak bentrok runner', () => {
    const e = (key: string, tag = 'BODY', mod = {}) => ({ key, target: { tag }, ...mod })
    expect(aksiPintasan(e('\\'), { halaman: '', sidebar: true })).toBe('sidebar')
    expect(aksiPintasan(e('\\', 'INPUT'), { halaman: '', sidebar: true })).toBeNull()
    expect(aksiPintasan(e('\\', 'BODY', { ctrl: true }), { halaman: '', sidebar: true })).toBeNull()
    expect(aksiPintasan(e('\\'), { halaman: 'jalan', sidebar: false })).toBeNull()
    // Pintasan runner tetap.
    expect(aksiPintasan(e('['), { halaman: 'jalan', sidebar: false })).toBe('peta')
  })
})

describe('markup sidebar', () => {
  it('judul grup = tombol aria-expanded; jumlah tetap terlihat saat tertutup; isi disembunyikan', () => {
    const h = sb({ tutup: new Set(['uji']) })
    expect(h).toMatch(
      /<button type="button" class="sb-grup sb-kel-hd" data-grup="uji" aria-expanded="false" aria-controls="sbg-uji"[^>]*>.*Uji per modul<\/span><span class="n">14<\/span>/,
    )
    expect(h).toContain(`id="${idGrup('uji')}" data-isi="uji" hidden`)
    expect(h).toMatch(/data-grup="proj" aria-expanded="true"/)
    expect(h).toContain('<b>Fleetify v2</b><span class="n">14</span>')
    expect(h).not.toContain('UAT')
  })
  it('ciut: tombol Buka sidebar dan tooltip nama butir', () => {
    const h = sb({ ciut: true })
    expect(h).toContain('id="sb-ciut" aria-expanded="false" aria-label="Buka sidebar"')
    expect(h).toContain('title="Skenario"')
    expect(h).toContain('title="Riwayat &amp; laporan"')
    expect(sb()).toContain('aria-label="Ciutkan sidebar"')
    expect(sb()).not.toContain('title="Skenario"')
  })
  it('blok bawah: Sasaran dan Sumber tugas bisa dibuka-tutup', () => {
    const h = sidebarBawah(null, new Set(['sasaran']))
    expect(h).toMatch(/data-grup="sasaran" aria-expanded="false"/)
    expect(h.match(/data-isi="sasaran"[^>]*hidden/g)?.length).toBe(1)
    expect(h).toMatch(/data-grup="mcp" aria-expanded="false"/)
  })
  it('blok bawah: server v2 lokal + tenant, status lapisan Pemeriksaan', () => {
    const h = sidebarBawah({ web: 'http://localhost:5173', tenant: 'mbl', db: true, ui: false })
    expect(h).toContain('localhost:5173')
    expect(h).toContain('tenant mbl')
    expect(h).toMatch(/ok-t[^>]*>.*Pemeriksaan DB/)
    expect(h).toContain('Pemeriksaan UI · tidak dikonfigurasi')
    expect(h).not.toMatch(/dunia|staging/i)
  })
  it('daftar skenario: Ciutkan semua / Buka semua', () => {
    const kel = [
      { modul: { id: 'a', nama: 'A' }, files: [] },
      { modul: { id: 'b', nama: 'B' }, files: [] },
    ]
    expect(daftarSkenario(kel)).toContain('data-lipat-semua="tutup">Ciutkan semua')
    expect(daftarSkenario(kel, { lipat: new Set(['a', 'b']) })).toContain(
      'data-lipat-semua="buka">Buka semua',
    )
    expect(daftarSkenario(kel, { lipat: new Set(['a']) })).toContain('aria-expanded="false"')
  })
})

describe('tata letak: rel ikon dan laci ponsel', () => {
  let browser: Browser
  beforeAll(async () => {
    browser = await chromium.launch()
  }, 30_000)
  afterAll(async () => {
    await browser?.close()
  })
  const halaman = (kelas: string, ciut: boolean) =>
    `<!doctype html><html><head><style>${css}</style></head><body><div class="win sb-mode"><main class="win-body"><div class="app ${kelas}"><button type="button" class="btn tb sb-laci-btn" id="sb-laci">Menu</button><div class="sb-latar" hidden></div><aside class="sb" id="sb"><div>${sb({ ciut })}</div>${sidebarBawah()}</aside><main class="app-main" id="main"><div style="height:200px">isi</div></main></div></main></div></body></html>`

  for (const lebar of [1280, 1920]) {
    test(`ciut → rel ikon, konten melebar, ikon menu tetap terlihat · ${lebar} px`, async () => {
      const page = await browser.newPage({ viewport: { width: lebar, height: 900 } })
      const ukur = async (ciut: boolean) => {
        await page.setContent(halaman(ciut ? 'sb-ciut' : '', ciut))
        return page.evaluate(() => {
          const r = (s: string) => document.querySelector(s)?.getBoundingClientRect()
          const teks = document.querySelector('.sb-item > span') as HTMLElement
          return {
            sb: r('#sb')?.width ?? 0,
            main: r('#main')?.width ?? 0,
            ikon: [...document.querySelectorAll('.sb-item svg')].map((e) => {
              const b = e.getBoundingClientRect()
              return b.width > 0 && b.left >= 0 && b.right <= 60
            }),
            teks: getComputedStyle(teks).display,
            bawah: getComputedStyle(document.querySelector('.sb-bawah') as Element).display,
            laci: getComputedStyle(document.getElementById('sb-laci') as Element).display,
          }
        })
      }
      const a = await ukur(false)
      const b = await ukur(true)
      expect(a.sb).toBe(280)
      expect(b.sb).toBe(60)
      expect(b.main - a.main).toBe(220)
      expect(b.ikon.every(Boolean)).toBe(true)
      expect(b.teks).toBe('none')
      expect(b.bawah).toBe('none')
      expect(a.laci).toBe('none')
      await page.close()
    })
  }

  test('ponsel 390: laci tertutup tidak menutupi konten; dibuka menutup dari kiri', async () => {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } })
    const ukur = async (kelas: string) => {
      await page.setContent(halaman(kelas, false))
      await page.waitForTimeout(250)
      return page.evaluate(() => {
        const s = document.getElementById('sb') as HTMLElement
        const b = s.getBoundingClientRect()
        return {
          l: Math.round(b.left),
          r: Math.round(b.right),
          vis: getComputedStyle(s).visibility,
          laci: getComputedStyle(document.getElementById('sb-laci') as Element).display,
          main: Math.round(document.getElementById('main')?.getBoundingClientRect().width ?? 0),
          gulirX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        }
      })
    }
    const tutup = await ukur('')
    expect(tutup.vis).toBe('hidden')
    expect(tutup.r).toBeLessThanOrEqual(0)
    expect(tutup.laci).not.toBe('none')
    expect(tutup.main).toBe(390)
    expect(tutup.gulirX).toBe(0)
    const buka = await ukur('laci-buka')
    expect(buka.vis).toBe('visible')
    expect(buka.l).toBe(0)
    expect(buka.r).toBeLessThanOrEqual(336)
    await page.close()
  })
})

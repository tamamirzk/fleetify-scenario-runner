// Ikon hasil dan bulatan di baris flex tidak boleh penyet saat teks di
// sampingnya membungkus — persegi, sama besar di semua kartu, sejajar baris pertama. Diukur di browser
// dengan CSS panel asli, pada 1440 px dan ponsel 390 px.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { type Browser, chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { kartuLangkah, relLangkah } from '../panel/js/komponen.js'
import { kartuLangkahHasil } from '../panel/js/laporan.js'
import { daftarSkenario, papanSkenario } from '../panel/js/skenario.js'

const css = ['tokens.css', 'panel.css']
  .map((f) => readFileSync(path.join(import.meta.dirname, '../panel', f), 'utf8'))
  .join('\n')
const panjang =
  'Permintaan barang sampai diserahkan: MR work order dan permintaan tambahan mekanik dari HP'
const f = (slug: string, judul: string, last: unknown = null, status = 'siap') => ({
  slug,
  task: 'gudang',
  title: judul,
  path: `scenarios/gudang/${slug}.json`,
  valid: true,
  masalah: [],
  estimasi: '9 menit',
  langkah: 7,
  tiket: [],
  status,
  last,
})
const files = [
  f('pinjaman-alat', panjang, {
    status: 'selesai',
    run_id: 'pinjaman-alat/1',
    started_at: '2026-11-14T10:00:00Z',
  }),
  f('penyesuaian-wo', 'Mutasi stok', null),
  f(
    'gd3',
    `${panjang} ${panjang}`,
    { status: 'gagal', run_id: 'gd3/1', started_at: '2026-11-14T10:00:00Z', failed_step: 2 },
    'ada_kegagalan',
  ),
  f('gd4', 'Stok opname', {
    status: 'dihentikan',
    run_id: 'gd4/1',
    started_at: '2026-11-14T10:00:00Z',
  }),
]
const steps = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
  n,
  title: n === 3 ? panjang : `Langkah ${n}`,
  expect: 'x',
  status: n < 2 ? 'lulus' : n === 2 ? 'berjalan' : 'menunggu',
  aksi: [],
  belakang: false,
}))
const run = {
  status: 'berjalan',
  title: 'x',
  started_at: 'x',
  current_step: 1,
  current_aksi: null,
  findings: [],
  steps,
}
const ld = {
  langkah: steps.map((s) => ({ n: s.n, judul: s.title, status: 'lulus', lulus: 1, total: 1 })),
}

function halaman() {
  return `<!doctype html><html><head><style>${css}</style></head><body><div class="win sb-mode"><main class="win-body"><div class="app-main">
    <div id="papan">${papanSkenario(files)}</div>
    <div id="daftar">${daftarSkenario([{ modul: { id: 'gudang', nama: 'Gudang' }, files }])}</div>
    <div class="rn-side" style="position:static;width:380px" id="kartu">${kartuLangkah(run)}</div>
    <aside class="rn-rel glass" style="position:static" id="rel">${relLangkah(steps)}</aside>
    <div id="lp">${kartuLangkahHasil({ run_id: 'x/1' }, ld, 3)}</div>
  </div></main></div></body></html>`
}

describe('ikon dan bulatan tidak penyet', () => {
  let browser: Browser
  beforeAll(async () => {
    browser = await chromium.launch()
  }, 30_000)
  afterAll(async () => {
    await browser?.close()
  })

  for (const lebar of [1440, 390]) {
    test(`persegi dan sama besar · ${lebar} px`, async () => {
      const page = await browser.newPage({ viewport: { width: lebar, height: 900 } })
      await page.setContent(halaman())
      const u = await page.evaluate(() => {
        const ukur = (sel: string) =>
          [...document.querySelectorAll(sel)].map((el) => {
            const b = el.getBoundingClientRect()
            return {
              w: Math.round(b.width * 10) / 10,
              h: Math.round(b.height * 10) / 10,
              top: b.top,
            }
          })
        const sejajar = [...document.querySelectorAll('#papan .sk-kartu')].map((k) => {
          const ik = k.querySelector('.sk-ikon')?.getBoundingClientRect()
          const t = k.querySelector('b')
          const r = document.createRange()
          if (t?.firstChild) r.setStart(t.firstChild, 0)
          if (t?.firstChild) r.setEnd(t.firstChild, 1)
          const baris1 = r.getBoundingClientRect()
          return ik ? Math.abs(ik.top + ik.height / 2 - (baris1.top + baris1.height / 2)) : 99
        })
        return {
          papan: ukur('#papan .sk-ikon'),
          daftar: ukur('#daftar .sk-ikon'),
          next: ukur('#kartu .kartu-next .rel-no'),
          rel: ukur('#rel .rel-no.s-menunggu, #rel .rel-no.s-lulus'),
          sejajar,
        }
      })
      for (const [nama, xs] of Object.entries({
        papan: u.papan,
        daftar: u.daftar,
        next: u.next,
        rel: u.rel,
      })) {
        expect(xs.length, nama).toBeGreaterThan(0)
        for (const x of xs) expect(Math.abs(x.w - x.h), `${nama} ${x.w}×${x.h}`).toBeLessThan(0.6)
        expect(new Set(xs.map((x) => x.w)).size, `${nama} sama besar`).toBe(1)
      }
      expect(u.papan[0]?.w).toBe(22)
      expect(u.daftar[0]?.w).toBe(22)
      // Ikon sejajar dengan baris pertama judul (selisih titik tengah ≤ 4 px).
      for (const d of u.sejajar) expect(d).toBeLessThanOrEqual(4)
      await page.close()
    })
  }
})

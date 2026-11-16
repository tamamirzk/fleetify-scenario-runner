// Halaman Ringkasan sebelum putar: kolom utama untuk membaca (kepala, Tujuan,
// Alur langkah, Persona, bagian lipat), kolom kanan sempit menempel untuk bertindak (kartu Putar).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { type Browser, chromium } from 'playwright'
import { afterAll, beforeAll, describe, expect, it, test } from 'vitest'
import {
  alurLangkah,
  bagianLipat,
  bilahPutar,
  daftarPersona,
  halamanRingkasan,
  kartuPutar,
  kartuTerakhir,
  kepalaRingkasan,
} from '../panel/js/ringkasan.js'
import { sidebar } from '../panel/js/skenario.js'

const css = ['tokens.css', 'panel.css']
  .map((f) => readFileSync(path.join(import.meta.dirname, '../panel', f), 'utf8'))
  .join('\n')

const HARUS =
  'Tab Menunggu persetujuan: MR-… untuk WO-…; laci rincian dengan alur dan keadaan per baris, termasuk jumlah yang diminta, stok Gudang Pool A, dan siapa yang harus menyetujui berikutnya'
const langkah = (n: number, o: Record<string, unknown> = {}) => ({
  n,
  id: `l${n}`,
  title: `Langkah ${n}: Putri memantau permintaan barang yang lahir dari work order`,
  deskripsi: n === 1 ? 'Putri membuka Permintaan barang dan memeriksa laci rinciannya.' : null,
  expect: HARUS,
  who: 'mbl.planner',
  who_name: 'Putri (Planner)',
  reach: n === 1,
  belakang: false,
  perangkat: 'laptop',
  aksi: 6,
  jump_runs: [],
  ...o,
})
const f = {
  slug: 'pinjaman-alat',
  task: 'gudang',
  valid: true,
  last: { status: 'selesai' },
}
const d = {
  judul: 'Permintaan barang sampai diserahkan',
  modul: 'pengadaan',
  estimasi: '9 menit',
  tujuan:
    'Membuktikan permintaan barang berjalan di server: MR lahir dari WO yang berlaku, mekanik meminta barang tambahan dari HP, dan gudang menyerahkan barang.',
  persona: [
    { siapa: 'mbl.planner', nama: 'Putri (Planner)', peran: 'Planner: pantau permintaan' },
    { siapa: 'mbl.mechanic', nama: 'Made (Mekanik)', peran: 'Mekanik: minta barang dari layar WO' },
    { siapa: 'admin', nama: 'Admin', peran: 'Hanya API' },
  ],
  steps: [
    langkah(1),
    langkah(2, {
      who: 'mbl.mechanic',
      who_name: 'Made (Mekanik)',
      jump_runs: ['pinjaman-alat/2026-11-14T10-00-00'],
    }),
    langkah(3, { belakang: true }),
    langkah(4),
    langkah(5),
    langkah(6),
  ],
  data: ['WO servis DT-014'],
  prasyarat: [],
  setelan: ['Konfirmasi zona waktu MBL'],
  catatan: ['Stok Gudang Site Alpha hanya 1'],
  siapkan: [{}, {}, {}],
}
const kartu = (o: Record<string, unknown> = {}) =>
  kartuPutar({
    sasaran: 'Server v2 lokal · tenant mbl',
    siapkan: 3,
    ...o,
  })
const tanpaTag = (h: string) =>
  h
    .replace(/<details class="rk-rinci">[\s\S]*?<\/details>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')

describe('Ringkasan (murni)', () => {
  it('kepala: judul besar, angka ringkas sebaris, chip, jalur berkas sebagai rincian kecil', () => {
    const h = kepalaRingkasan(f, d, { namaModul: 'Gudang' })
    expect(h).toContain('<h1>Permintaan barang sampai diserahkan</h1>')
    expect(h).toContain('6 langkah · 3 persona · ±9 menit')
    expect(h).toContain('>Gudang<')
    expect(h).toContain('mengubah 1 setelan')
    expect(h).not.toMatch(/panduan|reset/)
    expect(h).toContain('class="rk-berkas"')
    expect(h).not.toContain('class="stat"')
  })
  it('alur: "Harus terlihat" utuh, persona dan perangkat, jumlah aksi, Mulai di sini di baris langkah', () => {
    const h = alurLangkah(d.steps, { startStep: 1, persona: d.persona })
    expect(h).toContain(HARUS)
    expect(h).not.toMatch(/Harus terlihat<\/span>[^<]*…<\/div>$/m)
    expect(h).toContain('<b>Made (Mekanik)</b>')
    expect(h).toContain('di layar</span>')
    expect(h).toContain('di belakang layar')
    expect(h).toContain('6 aksi')
    expect(h).toContain('name="start" value="1" checked')
    // Langkah 2 punya data jalan: bisa dipilih, dengan keterangan dimengerti.
    expect(h).toContain('name="start" value="2"')
    expect(h).toContain('memakai data dari jalan sebelumnya')
    // Langkah 4 tanpa jalan pintas dan tanpa data jalan.
    expect(h).not.toContain('name="start" value="4"')
    expect(h).toContain('Hanya bisa dimulai sesudah langkah 3 dijalankan')
    expect(h).not.toMatch(/capai|butuh data jalan/)
  })
  it('persona: nama · peran · apa yang dilakukannya', () => {
    const h = daftarPersona(d.persona, d.steps)
    expect(h).toContain('<b>Putri (Planner)</b> · <span>Planner: pantau permintaan</span>')
    expect(h).toContain('Langkah 1, 4, 5, 6: Langkah 1: Putri')
    expect(h).toContain('Langkah 2: Langkah 2')
    expect(h).toContain('Hanya untuk menyiapkan data, tanpa layar.')
  })
  it('bagian lipat: kosong disembunyikan', () => {
    expect(bagianLipat('Prasyarat', [])).toBe('')
    expect(bagianLipat('Catatan', ['x'])).toContain('<details class="rk-lipat"><summary>')
  })
  it('kartu Putar: tombol + keterangan, langkah awal, tampilan bawaan 1400×900', () => {
    const h = kartu()
    expect(h).toContain('id="btn-prep"')
    expect(h).toContain('3 aksi penyiapan data · mulai di langkah 1')
    expect(h).not.toContain('chk-reset')
    expect(h).toContain('<option value="1400x900" selected>')
    expect(tanpaTag(h)).not.toMatch(/POST|\/api\//)
    expect(h).toContain('id="tempo-kec"')
    expect(h).toContain('id="tempo-jeda"')
    expect(h).toContain('id="tampilan-ukuran"')
    expect(h).toContain('id="tampilan-mutu"')
    expect(kartu({ run: { status: 'siap' }, startStep: 3 })).toContain('Putar dari langkah 3')
    expect(kartu({ butuhData: true, startStep: 2, jumpRuns: ['a/b'] })).toMatch(
      /id="btn-prep" disabled[\s\S]*Pilih data jalan/,
    )
  })
})

describe('Ringkasan: tata letak', () => {
  let browser: Browser
  beforeAll(async () => {
    browser = await chromium.launch()
  }, 30_000)
  afterAll(async () => {
    await browser?.close()
  })
  const isi = halamanRingkasan({
    kepala: kepalaRingkasan(f, d, { namaModul: 'Gudang' }),
    tujuan: d.tujuan,
    alur: alurLangkah(d.steps, { startStep: 1, persona: d.persona }),
    persona: daftarPersona(d.persona, d.steps),
    lipat: bagianLipat('Data yang disiapkan', d.data) + bagianLipat('Catatan', d.catatan),
    kartu: kartu(),
    terakhir: kartuTerakhir(f, 'Terakhir 14 Nov 2026, 23.45'),
    bilah: bilahPutar({ startStep: 1, ket: '3 aksi penyiapan data' }),
  })
  const sb = sidebar({
    halaman: 'skenario',
    project: {
      id: 'f',
      nama: 'Fleetify v2',
      modul: [{ id: 'material', nama: 'Gudang', jumlah: 4 }],
    },
    modulAktif: null,
    jumlahSemua: 33,
    jalanAktif: false,
  })
  const halaman = `<!doctype html><html><head><style>${css}</style></head><body><div class="win sb-mode"><main class="win-body"><div class="app"><aside class="sb" id="sb"><div>${sb}</div></aside><main class="app-main" id="app-main">${isi}</main></div></main></div></body></html>`

  for (const [lebar, tinggi] of [
    [1280, 800],
    [1440, 900],
    [1920, 1080],
  ] as const) {
    test(`tombol utama terlihat tanpa menggulir; kolom kanan ≤ 380 px; Harus terlihat utuh · ${lebar}×${tinggi}`, async () => {
      const page = await browser.newPage({ viewport: { width: lebar, height: tinggi } })
      await page.setContent(halaman)
      const ukur = () =>
        page.evaluate(() => {
          const b = document.getElementById('btn-prep')?.getBoundingClientRect()
          const kanan = document.querySelector('.rk-kanan')?.getBoundingClientRect()
          const utama = document.querySelector('.rk-utama-kol')?.getBoundingClientRect()
          const harus = [...document.querySelectorAll('.rk-harus')].map((e) => ({
            x: e.scrollWidth - e.clientWidth,
            y: e.scrollHeight - e.clientHeight,
            to: getComputedStyle(e).textOverflow,
          }))
          return {
            tombol: b && { t: b.top, b: b.bottom, w: b.width },
            kanan: kanan && { w: kanan.width, l: kanan.left },
            utama: utama && { w: utama.width, r: utama.right },
            harus,
            bilah: getComputedStyle(document.querySelector('.rk-bilah') as Element).display,
            layar: innerHeight,
          }
        })
      const a = await ukur()
      if (!a.tombol || !a.kanan || !a.utama) throw new Error('elemen tidak ada')
      expect(a.tombol.t).toBeGreaterThanOrEqual(0)
      expect(a.tombol.b).toBeLessThanOrEqual(a.layar)
      expect(a.kanan.w).toBeLessThanOrEqual(380)
      expect(a.kanan.w).toBeGreaterThanOrEqual(330)
      // Tombol selebar kartu (dikurangi padding).
      expect(a.tombol.w).toBeGreaterThan(a.kanan.w - 40)
      // Kolom utama lebih lebar daripada kolom kanan, di kirinya.
      expect(a.utama.w).toBeGreaterThan(a.kanan.w)
      expect(a.utama.r).toBeLessThanOrEqual(a.kanan.l)
      for (const h of a.harus) {
        expect(h.x).toBeLessThanOrEqual(0)
        expect(h.y).toBeLessThanOrEqual(0)
        expect(h.to).not.toBe('ellipsis')
      }
      expect(a.bilah).toBe('none')
      // Sesudah menggulir ke bawah: kartu menempel, tombol tetap terlihat.
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
      const b = await ukur()
      expect(b.tombol?.t ?? -1).toBeGreaterThanOrEqual(0)
      expect(b.tombol?.b ?? 99_999).toBeLessThanOrEqual(b.layar)
      await page.close()
    })
  }

  for (const [lebar, tinggi] of [
    [1024, 768],
    [390, 844],
  ] as const) {
    test(`< 1100 px: kolom kanan turun, bilah tindakan menempel di bawah · ${lebar}×${tinggi}`, async () => {
      const page = await browser.newPage({ viewport: { width: lebar, height: tinggi } })
      await page.setContent(halaman)
      const u = await page.evaluate(() => {
        const t = document.querySelector('.rk-bilah .btn')?.getBoundingClientRect()
        const utama = document.querySelector('.rk-utama-kol')?.getBoundingClientRect()
        const kanan = document.querySelector('.rk-kanan')?.getBoundingClientRect()
        return {
          t: t && { t: t.top, b: t.bottom },
          turun: (kanan?.top ?? 0) > (utama?.bottom ?? 0) - 1,
          layar: innerHeight,
          gulirX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        }
      })
      expect(u.turun).toBe(true)
      expect(u.t?.t ?? -1).toBeGreaterThanOrEqual(0)
      expect(u.t?.b ?? 99_999).toBeLessThanOrEqual(u.layar)
      expect(u.gulirX).toBe(0)
      await page.close()
    })
  }

  it('teks pengguna tanpa istilah internal', () => {
    expect(tanpaTag(isi)).not.toMatch(/\bcapai\b|\bsiapkan lewat API\b|\bslug\b|POST /)
  })
})

describe('kartu Putar: tuas jendela browser', () => {
  it('mencerminkan mode; terkunci selama ada jalan yang disiapkan', () => {
    const k = (o: Record<string, unknown>) =>
      kartuPutar({ sasaran: 'Server v2 lokal · tenant mbl', ...o })
    expect(k({ headed: true })).toMatch(/id="tampil-jendela" checked/)
    expect(k({ headed: false })).toMatch(/id="tampil-jendela"\s+>/)
    expect(k({ headed: false, run: { status: 'siap' } })).toMatch(/id="tampil-jendela"\s+disabled/)
    expect(k({ headed: false, run: { status: 'siap' } })).toContain(
      'Tampilan langsung muncul di layar Runner',
    )
  })
})

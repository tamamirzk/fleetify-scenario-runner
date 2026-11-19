// Perbaikan UI panel: kartu Tugas saya bisa diklik + laci pratinjau, kerja lokal (tanpa Plane),
// kerangka Dashboard, ringkasan slot sidebar, penanda slot chat.
import { describe, expect, it, vi } from 'vitest'
import { halamanDasbor, kerangkaDasbor, stripMini } from '../panel/js/dasbor.js'
import { laporanKerja } from '../panel/js/kerja.js'
import { ringkasSlot, sidebarBawah } from '../panel/js/skenario.js'
import {
  bagianLokal,
  barisTugas,
  halamanTugas,
  kartuLokal,
  kartuTugas,
  laciPratinjau,
} from '../panel/js/tugas.js'
import { kartuSlot } from '../panel/js/workspace.js'
import { butuhKamu } from '../src/core/butuh-kamu.ts'
import { adalahKerjaLokal, type Kerja } from '../src/core/kerja.ts'
import { kerjaLokal } from '../src/core/kerja-lokal.ts'
import {
  BATAS_DESKRIPSI,
  kosongkanPratinjau,
  pratinjauTiket,
  susunPratinjau,
} from '../src/core/pratinjau.ts'

const tugas = (o: Record<string, unknown> = {}) => ({
  key: 'FMS-11',
  judul: 'Judul <b>tiket</b>',
  url: 'https://plane/x/FMS-11',
  status: 'In Progress',
  grup: 'started',
  prioritas: 'high',
  label: [{ nama: 'Bug', warna: '#f00' }],
  tenggat: null,
  selesai: false,
  skenario: [{ slug: 'sk-1', judul: 'Skenario satu' }],
  kerja: null,
  ...o,
})

const ok = { ok: true, masalah: [] } as never
const lokalKerja = (o: Partial<Kerja> = {}): Kerja =>
  ({
    // Fixture kerja lama (tanpa format 2): menguji tampilan catatan.md yang tak boleh berubah.
    ...kerjaLokal('BUG-1', 'Bug', 'chat', '2026-11-18T00:00:00Z'),
    format: undefined,
    masalah: undefined,
    push: { at: '', branch: 'fix/bug-1', head: 'abcdef12' },
    ...o,
  }) as Kerja

describe('Tugas saya: kartu dan baris bisa diklik seluruhnya', () => {
  it('tiket belum diambil → laci; sudah diambil → halaman Kerja; bisa difokus dan ber-label', () => {
    const belum = kartuTugas(tugas())
    expect(belum).toContain('tabindex="0"')
    expect(belum).toContain('data-tg-buka="FMS-11"')
    expect(belum).toContain('data-tg-ke="laci"')
    expect(belum).toContain('lihat pratinjau')
    expect(belum).toContain('class="tg-kartu tg-buka')
    const ambil = kartuTugas(tugas({ kerja: { tahap: 'dikerjakan' } }))
    expect(ambil).toContain('data-tg-ke="kerja"')
    expect(ambil).toContain('href="#/kerja/FMS-11"')
    expect(barisTugas(tugas())).toContain('data-tg-buka="FMS-11"')
  })

  it('elemen interaktif tetap ada di dalam kartu (kunci ke Plane, chip skenario, tombol Ambil)', () => {
    const h = kartuTugas(tugas())
    expect(h).toContain('class="tg-kunci" href="https://plane/x/FMS-11"')
    expect(h).toContain('href="#/ringkasan/sk-1"')
    expect(h).toContain('data-tg-ambil="FMS-11"')
  })
})

describe('Tugas saya: laci pratinjau', () => {
  const status = [{ nama: 'In Progress', grup: 'started', warna: '#00f' }]
  it('menampilkan kunci, judul, status, prioritas, skenario, deskripsi, Ambil dan Buka di Plane', () => {
    const h = laciPratinjau(tugas(), status, {
      data: { deskripsi: 'Baris <script>x</script>\n- butir', dipotong: false },
    })
    expect(h).toContain('role="dialog"')
    expect(h).toContain('data-tg-laci-tutup')
    expect(h).toContain('Judul &lt;b&gt;tiket&lt;/b&gt;')
    expect(h).toContain('In Progress')
    expect(h).toContain('Tinggi')
    expect(h).toContain('Skenario satu')
    expect(h).toContain('Baris &lt;script&gt;x&lt;/script&gt;')
    expect(h).not.toContain('<script>')
    expect(h).toContain('data-tg-ambil="FMS-11"')
    expect(h).toContain('Buka di Plane ↗')
  })
  it('keadaan memuat, galat (Coba lagi), tanpa deskripsi', () => {
    expect(laciPratinjau(tugas(), status, { memuat: true })).toContain('Memuat deskripsi')
    const g = laciPratinjau(tugas(), status, { galat: 'putus' })
    expect(g).toContain('putus')
    expect(g).toContain('data-tg-laci-ulang="FMS-11"')
    expect(laciPratinjau(tugas(), status, { data: { deskripsi: '' } })).toContain('tanpa deskripsi')
  })
  it('halamanTugas menyertakan laci hanya untuk tiket yang dibuka', () => {
    const data = { dikonfigurasi: true, status, tugas: [tugas()], lokal: [] }
    expect(halamanTugas(data)).not.toContain('tg-laci')
    expect(halamanTugas(data, { laci: { key: 'FMS-11', memuat: true } })).toContain('id="tg-laci"')
    expect(halamanTugas(data, { laci: { key: 'XXX-1' } })).not.toContain('tg-laci')
  })
})

describe('Tugas saya: Kerja lokal', () => {
  const lokal = [{ key: 'BUG-1', judul: 'Bug satu', tahap: 'dikerjakan', slot: 3 }]
  it('kartu menaut ke #/kerja/<KEY>, tanpa tombol Plane atau Ambil', () => {
    const h = kartuLokal(lokal[0])
    expect(h).toContain('data-tg-ke="kerja"')
    expect(h).toContain('href="#/kerja/BUG-1"')
    expect(h).toContain('Slot 3')
    expect(h).not.toContain('data-tg-ambil')
    expect(h).not.toContain('plane')
  })
  it('bagian tampil di atas papan bila ada, hilang bila kosong', () => {
    const data = { dikonfigurasi: true, status: [], tugas: [tugas()], lokal }
    const h = halamanTugas(data)
    expect(h).toContain('Kerja lokal')
    expect(h.indexOf('tg-lokal')).toBeLessThan(h.indexOf('tg-papan'))
    expect(bagianLokal([])).toBe('')
    expect(halamanTugas({ ...data, lokal: [] })).not.toContain('tg-lokal')
  })
})

describe('kerja lokal: deteksi dan langkah ◆D', () => {
  it('deteksi dari "Tanpa Plane" + url kosong', () => {
    expect(adalahKerjaLokal(lokalKerja())).toBe(true)
    expect(adalahKerjaLokal({ url: 'https://p/FMS-1', plane: { status: 'Tanpa Plane' } })).toBe(
      false,
    )
    expect(adalahKerjaLokal({ url: '', plane: { status: 'Todo' } })).toBe(false)
  })
  it('lokal sudah di-merge → "Tandai selesai" tanpa Plane; tiket Plane tetap Code Complete', () => {
    const merge = { at: '', head: 'h' }
    const b = butuhKamu(lokalKerja({ merge }), { brief: ok, akhir: ok })
    expect(b).toMatchObject({
      titik: 'D',
      alasan: 'MR sudah di-merge ke development: tandai selesai',
      aksi: { jenis: 'tahap', label: 'Tandai selesai', tahap: 'selesai' },
    })
    expect(b?.alasan).not.toContain('Plane')
    const p = butuhKamu(
      lokalKerja({
        merge,
        url: 'https://p/FMS-9',
        plane: { id: '1', projectId: '1', status: 'Todo' },
      }),
      { brief: ok, akhir: ok },
    )
    expect(p?.alasan).toContain('Code Complete')
    expect(p?.aksi.label).toBe('Plane')
  })
})

describe('halaman Kerja untuk kerja lokal', () => {
  const k = lokalKerja()
  const d = {
    kerja: k,
    tiket: '# BUG-1 · Bug\n\nIsi',
    catatan: null,
    db: [],
    komentar: '',
    plane: { lokal: true, dicek: null, segar: false },
  }
  it('tanpa tombol Plane, label statis, kartu "Tugas (tanpa Plane)"', () => {
    const { bar, view } = laporanKerja(d)
    expect(bar).not.toContain('kj-komentar')
    expect(bar).not.toContain('kj-status')
    expect(bar).toContain('Salin perintah AI')
    expect(bar).toContain('Tanpa tiket Plane')
    expect(bar).not.toContain('memeriksa')
    expect(bar).not.toContain('target="_blank"')
    expect(view).toContain('Tugas (tanpa Plane)')
    expect(view).not.toContain('Buka di Plane')
    expect(view).not.toContain('Tugas di Plane')
    expect(view).toContain('Tanpa tiket Plane')
  })
  it('tombol ◆D lokal = Tandai selesai', () => {
    const butuh = {
      key: 'BUG-1',
      judul: 'x',
      titik: 'D',
      alasan: 'MR sudah di-merge ke development: tandai selesai',
      aksi: { jenis: 'tahap', label: 'Tandai selesai', tahap: 'selesai' },
    }
    const { view } = laporanKerja({ ...d, butuh }, { sesi: null })
    expect(view).toContain('data-kj-tandai-selesai="selesai"')
    expect(view).toContain('Tandai selesai')
  })
  it('tiket Plane biasa tetap punya tombol Plane', () => {
    const biasa = {
      ...d,
      plane: { dicek: null, segar: false },
      kerja: { ...k, url: 'https://p/FMS-9', plane: { ...k.plane, status: 'Todo' } },
    }
    const { bar, view } = laporanKerja(biasa)
    expect(bar).toContain('kj-komentar')
    expect(view).toContain('Tugas di Plane')
  })
  it('bar memuat untuk kunci lokal tanpa tombol Plane', () => {
    expect(laporanKerja(null, { kunci: 'REQ-1' }).bar).not.toContain('kj-komentar')
    expect(laporanKerja(null, { kunci: 'FMS-1' }).bar).toContain('kj-komentar')
  })
})

describe('halaman Kerja: tab tanpa butir', () => {
  it('tidak ada rel kosong (pil kosong) di kiri baris tab', () => {
    const k = lokalKerja()
    const d = { kerja: k, tiket: '', catatan: null, db: [], komentar: '' }
    const { view } = laporanKerja(d)
    expect(view).not.toContain('class="rel"')
    expect(view).toContain('Belum ada halaman untuk dipotret')
  })
})

describe('Pratinjau tiket', () => {
  const tiket = (o: Record<string, unknown> = {}) => ({
    key: 'FMS-11',
    id: 'i',
    projectId: 'p',
    judul: 'J',
    status: 'Todo',
    prioritas: 'low',
    url: 'u',
    deskripsiHtml: '<p>Satu &amp; dua</p><ul><li>a</li></ul><script>alert(1)</script>',
    ...o,
  })
  it('HTML dibuang jadi teks; deskripsi panjang dipotong', () => {
    const p = susunPratinjau(tiket())
    expect(p.deskripsi).toContain('Satu & dua')
    expect(p.deskripsi).toContain('- a')
    expect(p.deskripsi).not.toContain('<p>')
    const panjang = susunPratinjau(
      tiket({ deskripsiHtml: `<p>${'x'.repeat(BATAS_DESKRIPSI + 50)}</p>` }),
    )
    expect(panjang.dipotong).toBe(true)
    expect(panjang.deskripsi.length).toBeLessThanOrEqual(BATAS_DESKRIPSI + 1)
    expect(susunPratinjau(tiket({ deskripsiHtml: '' })).deskripsi).toBe('')
  })
  it('cache memori: panggilan kedua tidak ke Plane sampai kedaluwarsa atau disegarkan', async () => {
    kosongkanPratinjau()
    const ambil = vi.fn(async (k: string) => tiket({ key: k }))
    await pratinjauTiket('FMS-11', { ambil, kini: 1000 })
    await pratinjauTiket('FMS-11', { ambil, kini: 2000 })
    expect(ambil).toHaveBeenCalledTimes(1)
    await pratinjauTiket('FMS-11', { ambil, kini: 2000, segarkan: true })
    expect(ambil).toHaveBeenCalledTimes(2)
    await pratinjauTiket('FMS-11', { ambil, kini: 2000 + 6 * 60_000 })
    expect(ambil).toHaveBeenCalledTimes(3)
  })
})

describe('Dashboard: kerangka, slot chat', () => {
  it('memuat = kerangka berbentuk tata letak akhir, bukan hanya teks', () => {
    const h = halamanDasbor(null)
    expect(h).toContain('aria-busy="true"')
    expect(h).toContain('class="skel"')
    for (const k of ['db-strip', 'db-lajur3', 'db-angka-baris'])
      expect(kerangkaDasbor()).toContain(k)
    expect(h).toContain('Dashboard')
  })
  it('strip slot menandai slot chat', () => {
    const h = stripMini({
      slot: [
        { n: 1, pemakai: ['FMS-1'], api: true, web: true, sesi: null, chat: false },
        { n: 3, pemakai: [], api: true, web: true, sesi: null, chat: true },
      ],
      komputer: { beban: 1, core: 8, memoriBebas: 50, diskSisa: 100, peringatan: 0 },
    })
    expect(h).toContain('Slot 3 <span class="dim">chat · kosong · server hidup')
    expect(h).not.toContain('Slot 1 <span class="dim">chat')
  })
  it('kartu slot Workspace punya penanda chat', () => {
    const s = {
      n: 3,
      chat: true,
      pemakai: [],
      ada: true,
      bersih: true,
      branch: 'x',
      head: 'h',
      api: false,
      web: false,
      portApi: 3030,
      portWeb: 5183,
      db: 'd',
      dbUkuran: null,
      worktree: '/x',
    }
    expect(kartuSlot(s)).toContain('>chat</span>')
    expect(kartuSlot({ ...s, n: 1, chat: false })).not.toContain('>chat</span>')
  })
})

describe('Sidebar: Server skenario dan slot', () => {
  const slot = [
    { n: 1, portWeb: 5181, api: false, web: false, chat: false },
    { n: 2, portWeb: 5182, api: true, web: true, chat: false },
    { n: 3, portWeb: 5183, api: true, web: false, chat: true },
  ]
  it('berlabel "Server skenario" dan memuat ringkasan slot hidup/mati', () => {
    const h = sidebarBawah({
      web: 'http://localhost:5173',
      tenant: 'mbl',
      db: true,
      ui: true,
      slot,
    })
    expect(h).toContain('Server skenario')
    expect(h).toContain('localhost:5173')
    expect(h).toContain('Slot 1 <span class="mono">:5181</span> <span class="dim">mati')
    expect(h).toContain('Slot 2 <span class="mono">:5182</span> <span class="ok-t">hidup')
    expect(h).toContain(
      'Slot 3 <span class="mono">:5183</span> <span class="dim">(chat)</span> <span class="ok-t">hidup',
    )
  })
  it('tanpa data slot: wadah tersembunyi (diisi setelah dimuat)', () => {
    expect(ringkasSlot(null)).toContain('hidden')
    expect(ringkasSlot(slot)).toContain('class="sb-slot"')
  })
})

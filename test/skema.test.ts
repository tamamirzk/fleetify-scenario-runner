import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { isiPlaceholder, pola, rujukan } from '../src/core/placeholder.ts'
import { periksaSkenario } from '../src/core/rules.ts'

const dasar = {
  slug: 'contoh',
  judul: 'Contoh skenario',
  tujuan: 'Membuktikan sesuatu yang terlihat di layar.',
  modul: 'material',
  tiket: ['FMS-1'],
  estimasi: '3 menit',
  persona: [{ siapa: 'mbl.storekeeper', peran: 'membuka halaman' }],
  data: ['Satu barang baru'],
  setelan: [],
  prasyarat: [],
  catatan: [],
  siapkan: [
    { siapkan: 'barang', simpan: 'b', gudang: 'WH-ALPHA', kode: 'SR-X', nama: 'Uji', jumlah: 1 },
  ],
  langkah: [
    {
      id: 'buka',
      judul: 'Wati membuka barang',
      sebagai: 'mbl.storekeeper',
      harusTerlihat: 'Detail barang tampil',
      aksi: [{ buka: '/inventory/items/{b.id}' }, { klik: { tombol: 'Ubah' } }],
    },
  ],
}
type Obj = Record<string, unknown>
const periksa = (patch: Obj = {}, slug = 'contoh') =>
  periksaSkenario(JSON.stringify({ ...dasar, ...patch }), { slug })
const aturan = (patch: Obj = {}) => periksa(patch).masalah.map((m) => m.aturan)
const langkah = (aksi: unknown[], extra: Obj = {}) => ({
  langkah: [{ ...dasar.langkah[0], ...extra, aksi }],
})

describe('periksaSkenario', () => {
  it('menerima skenario sah', () => {
    const r = periksa()
    expect(r.masalah).toEqual([])
    expect(r.skenario?.slug).toBe('contoh')
  })

  it('menunjuk baris JSON yang rusak', () => {
    const r = periksaSkenario('{\n  "slug": "x",\n  oops\n}', { slug: 'x' })
    expect(r.skenario).toBeNull()
    expect(r.masalah[0]?.aturan).toBe('json')
  })

  it('menolak field asing, meta kurang, dan format salah', () => {
    expect(aturan({ ekstra: 1 })).toContain('skema')
    expect(aturan({ tiket: ['fms1'] })).toContain('skema')
    expect(aturan({ estimasi: '3m' })).toContain('skema')
    const { tujuan: _t, ...tanpa } = dasar
    expect(periksaSkenario(JSON.stringify(tanpa), { slug: 'contoh' }).skenario).toBeNull()
  })

  it('slug harus sama dengan nama berkas', () => {
    expect(periksa({}, 'lain').masalah.map((m) => m.aturan)).toContain('satu-berkas')
  })

  it('aksi tidak dikenal dan sasaran ganda ditolak', () => {
    expect(aturan(langkah([{ tekan: 'X' }]))).toContain('skema')
    expect(aturan(langkah([{ klik: { tombol: 'A', label: 'B' } }]))).toContain('skema')
    expect(aturan(langkah([{ klik: { tombol: 'A' }, salah: 1 }]))).toContain('skema')
  })

  it('memeriksa nama dan argumen aksi pustaka', () => {
    expect(aturan(langkah([{ api: 'tidak-ada' }]))).toContain('pustaka')
    expect(aturan(langkah([{ api: 'ajukan-mr', mr: '{b.id}', asing: 1 }]))).toContain('pustaka')
    expect(aturan(langkah([{ api: 'ajukan-mr' }]))).toContain('pustaka')
    // aksi layar tidak boleh dipanggil sebagai api
    expect(aturan(langkah([{ api: 'akhiri-sesi', wo: 'x', catatan: 'abc' }]))).toContain('pustaka')
    expect(aturan(langkah([{ api: 'ajukan-mr', mr: '{b.id}' }]))).toEqual([])
  })

  it('placeholder harus disimpan lebih dulu', () => {
    expect(aturan(langkah([{ buka: '/x/{mr.id}' }]))).toContain('data-ada')
    expect(aturan(langkah([{ banner: 'stempel {stempel}' }]))).toEqual([])
  })

  it('persona harus dideklarasikan, termasuk di argumen pustaka', () => {
    expect(aturan(langkah([{ sebagai: 'mbl.mechanic' }]))).toContain('persona')
    expect(aturan({ ...langkah([{ buka: '/' }], { sebagai: 'mbl.mechanic' }) })).toContain(
      'persona',
    )
    expect(aturan(langkah([{ api: 'ajukan-mr', mr: '{b.id}', sebagai: 'mbl.planner' }]))).toContain(
      'persona',
    )
  })

  it('menolak UUID tertulis', () => {
    expect(aturan(langkah([{ buka: '/x/78aa0569-bddb-41b6-af9b-ceb45b152195' }]))).toContain(
      'tanpa-id-tertulis',
    )
  })

  it('setelan wajib dikembalikan atau beralasan menetap', () => {
    expect(aturan({ setelan: ['Alur PO diberi SLA'] })).toContain('setelan-dikembalikan')
    expect(
      aturan({ setelan: ['Alur PO diberi SLA'], setelanMenetap: 'prasyarat lingkungan' }),
    ).toEqual([])
  })

  it('aksi pustaka yang menyentuh DB wajib pengecualian', () => {
    const p = langkah([{ api: 'majukan-tenggat-sla', judulRequest: 'PO-1' }])
    expect(aturan(p)).toContain('db-lewat-api')
    expect(
      aturan({
        ...p,
        pengecualian: [{ aturan: 'db-lewat-api', alasan: 'aplikasi tidak bisa memajukan waktu' }],
      }),
    ).toEqual([])
  })

  it('skenario contoh di templates sah', () => {
    const raw = readFileSync('templates/skenario.json', 'utf8')
    expect(periksaSkenario(raw, { slug: 'contoh-skenario' }).masalah).toEqual([])
  })
})

describe('placeholder', () => {
  const data = { mr: { id: 'm1', baris: ['l1', 'l2'] }, n: 3 }
  it('mengisi teks, jalur bertitik, dan nilai utuh', () => {
    expect(isiPlaceholder('/mr/{mr.id}', data)).toBe('/mr/m1')
    expect(isiPlaceholder('{mr.baris.1}', data)).toBe('l2')
    expect(isiPlaceholder('{mr.baris}', data)).toEqual(['l1', 'l2'])
    expect(isiPlaceholder({ a: ['{n}'] }, data)).toEqual({ a: [3] })
  })
  it('tidak menyentuh kuantifier regex', () => {
    expect(isiPlaceholder('/ADJ-\\d{6}-\\d{3}/', data)).toBe('/ADJ-\\d{6}-\\d{3}/')
    expect(rujukan('/[0-9a-f]{36}/ {mr.id}')).toEqual(['mr'])
  })
  it('galat jelas bila data belum ada', () => {
    expect(() => isiPlaceholder('{x.y}', data)).toThrow('Data {x.y} belum ada')
  })
  it('pola /regex/ menjadi RegExp', () => {
    expect(pola('/^Catatan/i')).toEqual(/^Catatan/i)
    expect(pola('Ajukan')).toBe('Ajukan')
  })
})

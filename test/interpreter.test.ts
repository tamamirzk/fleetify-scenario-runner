import { describe, expect, it } from 'vitest'
import { jalankanAksi, type Layar, type Lingkungan, uraiAksi } from '../src/core/interpreter.ts'
import type { Sasaran } from '../src/core/skema.ts'

/** Layar palsu: mencatat panggilan, tanpa browser. */
function layarPalsu(o: { ada?: boolean; url?: string; teks?: string; respons?: unknown } = {}) {
  const log: unknown[][] = []
  const rec =
    // biome-ignore lint/suspicious/noExplicitAny: perekam generik untuk semua metode Layar
      (n: string, ret?: unknown): any =>
      async (...a: unknown[]) => {
        log.push([n, ...a])
        return ret
      }
  const layar: Layar = {
    buka: rec('buka'),
    banner: rec('banner'),
    tahan: rec('tahan'),
    klik: async (s, opt) => {
      log.push(['klik', s, opt])
      return o.ada ?? true
    },
    klikTangkap: rec('klikTangkap', o.respons),
    isi: async (s, v, opt) => {
      log.push(['isi', s, v, opt])
      return o.ada ?? true
    },
    pilih: rec('pilih'),
    cari: rec('cari'),
    tunggu: rec('tunggu'),
    tungguUrl: rec('tungguUrl'),
    gulir: async (s, opt) => {
      log.push(['gulir', s, opt])
      return o.ada ?? true
    },
    terlihat: async (s: Sasaran) => {
      log.push(['terlihat', s])
      return o.ada ?? true
    },
    hilang: async () => !(o.ada ?? true),
    nonaktif: async () => o.ada ?? true,
    url: () => o.url ?? 'http://x/',
    teksHalaman: async () => o.teks ?? '',
    screenshot: rec('screenshot', 'a.png'),
    sebagai: rec('sebagai'),
  }
  return { layar, log }
}

function env(layar?: Layar, data: Record<string, unknown> = {}) {
  const catatan: string[] = []
  const pustaka: unknown[][] = []
  const e: Lingkungan = {
    layar,
    data,
    catat: (t) => catatan.push(t),
    log: () => {},
    pustaka: async (nama, args) => {
      pustaka.push([nama, args])
      return { id: 'hasil-1' }
    },
  }
  return { e, catatan, pustaka }
}

describe('jalankanAksi', () => {
  it('mengisi placeholder sebelum aksi berjalan', async () => {
    const { layar, log } = layarPalsu()
    const { e } = env(layar, { mr: { id: 'm1' } })
    await jalankanAksi({ buka: '/mr/{mr.id}' }, e)
    await jalankanAksi({ klik: { tombol: 'Ajukan', dalam: { baris: '{mr.id}' } } }, e)
    expect(log[0]).toEqual(['buka', '/mr/m1'])
    expect(log[1]?.[1]).toEqual({ tombol: 'Ajukan', dalam: { baris: 'm1' } })
    expect(log[1]?.[2]).toEqual({ tahan: 3000, opsional: false })
  })

  it('aksi pustaka menerima argumen terisi dan hasilnya disimpan', async () => {
    const { e, pustaka } = env(undefined, { mr: { id: 'm1' } })
    await jalankanAksi({ api: 'ajukan-mr', mr: '{mr.id}', simpan: 'x' }, e)
    expect(pustaka).toEqual([['ajukan-mr', { mr: 'm1' }]])
    expect(e.data.x).toEqual({ id: 'hasil-1' })
  })

  it('aksi layar ditolak tanpa jendela', async () => {
    const { e } = env()
    await expect(jalankanAksi({ klik: { tombol: 'A' } }, e)).rejects.toThrow('butuh jendela')
    await expect(
      jalankanAksi({ layar: 'akhiri-sesi', wo: 'w', catatan: 'abc' }, e),
    ).rejects.toThrow('butuh jendela')
  })

  it('pastikanTerlihat gagal, atau hanya dicatat bila lunak', async () => {
    const { layar } = layarPalsu({ ada: false })
    const { e, catatan } = env(layar)
    await expect(jalankanAksi({ pastikanTerlihat: 'Disetujui' }, e)).rejects.toThrow(
      'tidak terpenuhi',
    )
    await jalankanAksi({ pastikanTerlihat: 'Disetujui', lunak: true }, e)
    expect(catatan).toHaveLength(1)
  })

  it('simpan dari URL dan teks halaman', async () => {
    const { layar } = layarPalsu({ url: 'http://x/adjustments/abc', teks: 'Nomor ADJ-202611-007' })
    const { e } = env(layar)
    await jalankanAksi({ simpan: 'adj_id', dariUrl: '/adjustments\\/(\\w+)/' }, e)
    await jalankanAksi({ simpan: 'adj', dariTeks: '/ADJ-\\d{6}-\\d{3}/' }, e)
    expect(e.data).toMatchObject({ adj_id: 'abc', adj: 'ADJ-202611-007' })
    await expect(jalankanAksi({ simpan: 'z', dariTeks: '/TIDAK/', batas: 100 }, e)).rejects.toThrow(
      'tidak terbaca',
    )
  })

  it('klik dengan tangkap menyimpan field respons', async () => {
    const { layar } = layarPalsu({ respons: { id: 'po-9' } })
    const { e } = env(layar)
    await jalankanAksi(
      { klik: { tombol: 'Simpan' }, tangkap: { url: '/orders$/', simpan: { po_id: 'id' } } },
      e,
    )
    expect(e.data.po_id).toBe('po-9')
  })

  it('dokumen menambah daftar docs', async () => {
    const { e } = env(undefined, { mr: { n: 'MR-1' } })
    await jalankanAksi({ dokumen: { label: 'MR', nomor: '{mr.n}', url: '/mr' } }, e)
    expect(e.data.docs).toEqual([{ label: 'MR', nomor: 'MR-1', url: '/mr' }])
  })

  it('galat jelas bila placeholder belum ada', async () => {
    const { layar } = layarPalsu()
    await expect(jalankanAksi({ buka: '/x/{y.id}' }, env(layar).e)).rejects.toThrow(
      'Data {y.id} belum ada',
    )
  })
})

describe('uraiAksi', () => {
  it('menguraikan aksi untuk panel', () => {
    expect(uraiAksi({ klik: { tombol: 'Ajukan', persis: true } })).toBe('Klik tombol “Ajukan”')
    expect(uraiAksi({ isi: { label: '/^Catatan/', dalam: { dialog: true } }, nilai: 'x' })).toBe(
      'Isi isian “Catatan” di dialog: “x”',
    )
    expect(uraiAksi({ buka: '/mr/{mr.id}' }, { mr: { id: 'm1' } })).toBe('Buka /mr/m1')
    expect(uraiAksi({ buka: '/mr/{mr.id}' }, { mr: { id: 'm1', nomor: 'MR-1' } })).toBe('Buka MR-1')
    expect(uraiAksi({ sebagai: 'mbl.storekeeper' })).toBe('Ganti akun ke Wati (Penjaga Gudang)')
    expect(uraiAksi({ api: 'ajukan-mr', mr: '{mr.id}' })).toBe('Ajukan MR (di belakang layar)')
  })
})

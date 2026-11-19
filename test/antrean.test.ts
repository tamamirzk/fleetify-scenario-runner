import { describe, expect, it } from 'vitest'
import {
  alasanTahan,
  antreanLengkap,
  antreanSlot,
  antreanTertahan,
  cekBasi,
  denganAntre,
  geserUrutan,
  PERINGATAN_KLASTER,
  pilihBerikutnya,
  usulanRencana,
} from '../src/core/antrean.ts'
import type { ButuhKamu } from '../src/core/butuh-kamu.ts'
import type { Kerja } from '../src/core/kerja.ts'
import { type DepGanti, gantiOtomatis } from '../src/core/kerja-aksi.ts'
import { kerjaLokal } from '../src/core/kerja-lokal.ts'

const T0 = '2026-11-19T00:00:00.000Z'

/** Kerja Plane (bukan lokal) untuk fixture. */
function plane(key: string, o: Partial<Kerja> = {}): Kerja {
  return {
    ...kerjaLokal(key, `Judul ${key}`, 'tes', T0),
    url: `https://plane/${key}`,
    plane: { id: key, projectId: 'p', status: 'Todo' },
    ...o,
  } as Kerja
}
const lokal = (key: string, o: Partial<Kerja> = {}): Kerja => ({
  ...kerjaLokal(key, `Judul ${key}`, 'tes', T0),
  ...o,
})
const antre = (key: string, slot: number | undefined, urutan: number, o: Partial<Kerja> = {}) =>
  plane(key, { antre: { at: T0, ...(slot ? { slot } : {}), urutan }, ...o })

describe('urutan antrean per slot', () => {
  it('antrean slot terurut menurut urutan; global terpisah dari slot', () => {
    const semua = [
      antre('FMS-3', 1, 2),
      antre('FMS-1', 1, 1),
      antre('FMS-9', undefined, 1),
      antre('FMS-5', 2, 1),
    ]
    expect(antreanSlot(semua, 1).map((k) => k.key)).toEqual(['FMS-1', 'FMS-3'])
    expect(antreanSlot(semua, 2).map((k) => k.key)).toEqual(['FMS-5'])
    expect(antreanSlot(semua, 'global').map((k) => k.key)).toEqual(['FMS-9'])
  })

  it('tanpa urutan (data lama) jatuh ke waktu masuk', () => {
    const a = plane('FMS-2', { antre: { at: '2026-11-19T02:00:00.000Z', slot: 1 } })
    const b = plane('FMS-1', { antre: { at: '2026-11-19T03:00:00.000Z', slot: 1 } })
    expect(antreanSlot([b, a], 1).map((k) => k.key)).toEqual(['FMS-2', 'FMS-1'])
  })

  it('yang memegang slot atau selesai tidak tampil; selesai tetap ada di daftar lengkap', () => {
    const semua = [
      antre('FMS-1', 1, 1, { tahap: 'selesai' }),
      antre('FMS-2', 1, 2),
      antre('FMS-3', 1, 3, { slot: 1 }),
    ]
    expect(antreanSlot(semua, 1).map((k) => k.key)).toEqual(['FMS-2'])
    expect(antreanLengkap(semua, 1).map((k) => k.key)).toEqual(['FMS-1', 'FMS-2'])
  })

  it('kerja berikutnya melewati yang ditunda', () => {
    const semua = [antre('FMS-1', 1, 1, { ditunda: { at: T0 } }), antre('FMS-2', 1, 2)]
    expect(pilihBerikutnya(antreanLengkap(semua, 1))?.key).toBe('FMS-2')
    expect(pilihBerikutnya([])).toBeNull()
  })

  it('denganAntre menaruh di ujung, mempertahankan waktu masuk, dan menghapus peringatan', () => {
    const semua = [antre('FMS-1', 1, 1), antre('FMS-2', 1, 2)]
    const k = plane('FMS-7', {
      antre: { at: '2026-11-18T00:00:00.000Z' },
      peringatanAntre: { at: T0, jenis: 'gagal', slot: 1, alasan: 'x' },
    })
    const k2 = denganAntre(semua, k, 1, T0)
    expect(k2.antre).toEqual({ at: '2026-11-18T00:00:00.000Z', slot: 1, urutan: 3 })
    expect(k2.peringatanAntre).toBeUndefined()
    // ke global: tanpa slot
    expect(denganAntre(semua, k2, 'global', T0).antre?.slot).toBeUndefined()
    expect(() => denganAntre(semua, k, 9, T0)).toThrow('tidak ada')
    expect(() => denganAntre(semua, plane('FMS-8', { slot: 2 }), 1, T0)).toThrow('memegang slot')
  })

  it('naik/turun menukar urutan dan menomori ulang; di ujung tidak berubah', () => {
    const semua = [antre('FMS-1', 1, 1), antre('FMS-2', 1, 2), antre('FMS-3', 1, 3)]
    expect(geserUrutan(semua, 'FMS-3', 'naik')).toEqual([
      { key: 'FMS-3', urutan: 2 },
      { key: 'FMS-2', urutan: 3 },
    ])
    expect(geserUrutan(semua, 'FMS-1', 'naik')).toEqual([])
    expect(geserUrutan(semua, 'FMS-3', 'turun')).toEqual([])
    expect(() => geserUrutan(semua, 'FMS-99', 'naik')).toThrow('tidak ada di antrean')
  })

  it('data lama tanpa urutan dinomori ulang saat digeser', () => {
    const semua = [
      plane('FMS-1', { antre: { at: '2026-11-19T01:00:00.000Z', slot: 1 } }),
      plane('FMS-2', { antre: { at: '2026-11-19T02:00:00.000Z', slot: 1 } }),
    ]
    expect(geserUrutan(semua, 'FMS-2', 'naik')).toEqual([
      { key: 'FMS-2', urutan: 1 },
      { key: 'FMS-1', urutan: 2 },
    ])
  })
})

describe('cek basi', () => {
  it('Done/Cancelled di Plane dilewati; status lain, tak diketahui, dan lokal tidak', () => {
    expect(cekBasi(plane('FMS-1'), 'Done', ['Done'])).toContain('selesai di Plane')
    expect(cekBasi(plane('FMS-1'), 'done', ['Done'])).toContain('selesai di Plane')
    expect(cekBasi(plane('FMS-1'), 'Cancelled', ['Done'])).toContain('dibatalkan')
    expect(cekBasi(plane('FMS-1'), 'In Progress', ['Done'])).toBeNull()
    expect(cekBasi(plane('FMS-1'), null, ['Done'])).toBeNull()
    expect(cekBasi(lokal('BUG-1'), 'Done', ['Done'])).toBeNull()
  })
  it('kerja yang sudah selesai selalu basi', () => {
    expect(cekBasi(plane('FMS-1', { tahap: 'selesai' }), null, ['Done'])).toBe(
      'kerja sudah selesai',
    )
  })
})

describe('antrean tertahan', () => {
  const kini = Date.parse('2026-11-19T12:00:00.000Z')
  const butuhB = {
    key: 'FMS-10',
    judul: 'x',
    alasan: 'r',
    titik: 'B',
    aksi: { jenis: 'buka', label: 'Review' },
  } as ButuhKamu

  it('alasan: pertanyaan terbuka, review B, Claude menunggu, ditunda, diam > 1 hari', () => {
    const k = plane('FMS-10', { slot: 1, diperbarui_at: '2026-11-19T10:00:00.000Z' })
    expect(alasanTahan(k, null, kini)).toBeNull()
    expect(
      alasanTahan(plane('FMS-10', { pertanyaan: [{ no: 1, teks: 'q' }] as never }), null, kini),
    ).toBe('1 pertanyaan terbuka')
    expect(alasanTahan(k, butuhB, kini)).toBe('menunggu review ◆B')
    expect(alasanTahan({ ...k, sesi: { status: 'menunggu' } as never }, null, kini)).toBe(
      'Claude menunggu kamu',
    )
    expect(alasanTahan({ ...k, sesi: { status: 'bekerja' } as never }, butuhB, kini)).toBeNull()
    expect(alasanTahan({ ...k, ditunda: { at: T0 } }, null, kini)).toBe('ditunda')
    expect(alasanTahan({ ...k, diperbarui_at: '2026-11-17T12:00:00.000Z' }, null, kini)).toContain(
      'tidak bergerak 2 hari',
    )
  })

  it('hanya slot yang punya antrean dan pemakai tertahan', () => {
    const semua = [
      plane('FMS-10', { slot: 1 }),
      antre('FMS-11', 1, 1),
      antre('FMS-12', 1, 2),
      plane('FMS-20', { slot: 2, diperbarui_at: '2026-11-10T00:00:00.000Z' }), // tertahan tapi antrean kosong
    ]
    const hasil = antreanTertahan(semua, (k) => (k.key === 'FMS-10' ? butuhB : null), kini)
    expect(hasil).toHaveLength(1)
    expect(hasil[0]).toMatchObject({ slot: 1, oleh: 'FMS-10', alasan: 'menunggu review ◆B' })
    expect(hasil[0]?.antrean.map((x) => x.key)).toEqual(['FMS-11', 'FMS-12'])
  })

  it('kerja aktif yang bergerak tidak menahan', () => {
    const semua = [
      plane('FMS-10', { slot: 1, diperbarui_at: '2026-11-19T11:00:00.000Z' }),
      antre('FMS-11', 1, 1),
    ]
    expect(antreanTertahan(semua, () => null, kini)).toEqual([])
  })
})

describe('rencana slot', () => {
  const slot = (
    n: number,
    pemakai: { key: string; modul: string | null }[] = [],
    antre = 0,
    siap = true,
  ) => ({ n, siap, pemakai, antre })
  const t = (key: string, modul: string | null, lokal = false) => ({
    key,
    judul: `J ${key}`,
    modul,
    lokal,
  })

  it('modul sama dengan pemakai slot → antre di slot itu; klaster hanya pilihan lain', () => {
    const u = usulanRencana(
      [t('FMS-5', 'fleet')],
      [slot(1, [{ key: 'FMS-1', modul: 'fleet' }]), slot(2), slot(3)],
    )
    expect(u[0]?.usulan).toMatchObject({ jenis: 'antre', n: 1 })
    expect(u[0]?.alasan).toContain('FMS-1')
    expect(u[0]?.opsi.map((o) => o.jenis)).toContain('klaster')
    expect(u[0]?.opsi[0]).toEqual(u[0]?.usulan)
  })

  it('modul berbeda + slot kosong → slot terpisah (tidak pernah klaster bawaan)', () => {
    const u = usulanRencana(
      [t('FMS-5', 'work-order')],
      [slot(1, [{ key: 'FMS-1', modul: 'fleet' }]), slot(2), slot(3)],
    )
    expect(u[0]?.usulan).toMatchObject({ jenis: 'slot', n: 2 })
  })

  it('dua tiket satu modul: kedua antre di slot yang dipegang rencana pertama', () => {
    const u = usulanRencana([t('FMS-5', 'fleet'), t('FMS-6', 'fleet')], [slot(1), slot(2), slot(3)])
    expect(u[0]?.usulan).toMatchObject({ jenis: 'slot', n: 1 })
    expect(u[1]?.usulan).toMatchObject({ jenis: 'antre', n: 1 })
    expect(u[1]?.alasan).toContain('FMS-5 (rencana)')
  })

  it('dua modul berbeda menempati slot terpisah; slot chat tidak dipinjam selagi slot utama ada yang kosong', () => {
    const u = usulanRencana(
      [t('FMS-5', 'fleet'), t('FMS-6', 'work-order')],
      [slot(1), slot(2), slot(3)],
    )
    expect(u.map((x) => x.usulan.n)).toEqual([1, 2])
  })

  it('semua slot utama penuh modul lain → antre di antrean terpendek, boleh pinjam slot chat bila kosong', () => {
    const penuh = [
      slot(1, [{ key: 'A-1', modul: 'fleet' }], 2),
      slot(2, [{ key: 'A-2', modul: 'approval' }], 1),
      slot(3),
    ]
    const u = usulanRencana([t('FMS-5', 'workflow')], penuh)
    expect(u[0]?.usulan).toMatchObject({ jenis: 'slot', n: 3 }) // slot chat kosong dipinjam
    const chatPenuh = [
      slot(1, [{ key: 'A-1', modul: 'fleet' }], 2),
      slot(2, [{ key: 'A-2', modul: 'approval' }], 1),
      slot(3, [{ key: 'BUG-1', modul: null }], 5),
    ]
    const u2 = usulanRencana([t('FMS-5', 'workflow')], chatPenuh)
    expect(u2[0]?.usulan).toMatchObject({ jenis: 'antre', n: 2 })
    expect(u2[0]?.alasan).toContain('terpendek')
  })

  it('modul tak dikenal tidak dianggap sama; kerja lokal hanya ke slot chat', () => {
    const u = usulanRencana(
      [t('FMS-5', null), t('BUG-2', null, true)],
      [slot(1, [{ key: 'A-1', modul: null }]), slot(2), slot(3)],
    )
    expect(u[0]?.usulan).toMatchObject({ jenis: 'slot', n: 2 })
    expect(u[1]?.usulan).toMatchObject({ jenis: 'slot', n: 3 })
    const u2 = usulanRencana(
      [t('BUG-2', null, true)],
      [slot(1), slot(2), slot(3, [{ key: 'BUG-1', modul: null }])],
    )
    expect(u2[0]?.usulan).toMatchObject({ jenis: 'antre', n: 3 })
    expect(u2[0]?.opsi.every((o) => o.n === 3)).toBe(true)
  })

  it('tanpa slot siap: antre global; peringatan klaster tersedia', () => {
    const u = usulanRencana([t('FMS-5', 'fleet')], [slot(1, [], 0, false)])
    expect(u[0]?.usulan).toMatchObject({ jenis: 'antre', n: 0 })
    expect(PERINGATAN_KLASTER).toContain('klaster')
  })
})

describe('pergantian otomatis setelah push (dependensi palsu)', () => {
  /** Penyimpanan dalam memori + tempatkan palsu yang mencatat panggilannya. */
  function palsu(awal: Kerja[], status: Record<string, string | null> = {}, gagalUntuk?: string) {
    const toko = new Map(awal.map((k) => [k.key, k]))
    const panggilan: { key: string; n: number; resetDb: boolean }[] = []
    const tanyaPlane: string[] = []
    const dep: DepGanti = {
      semua: () => [...toko.values()],
      simpan: (k) => void toko.set(k.key, k),
      statusPlane: async (key) => {
        tanyaPlane.push(key)
        return status[key] ?? null
      },
      tempatkan: (key, n, o) => {
        panggilan.push({ key, n, resetDb: o.resetDb })
        if (key === gagalUntuk)
          throw new Error('Worktree slot 1 punya perubahan yang belum di-commit')
        const { antre: _a, peringatanAntre: _p, ...k } = toko.get(key) as Kerja
        const k2 = { ...k, slot: n, branch: `feat/${key.toLowerCase()}` } as Kerja
        toko.set(key, k2)
        return { kerja: k2, langkah: [`branch feat/${key.toLowerCase()}`] }
      },
      selesaiNama: ['Done'],
      kini: () => T0,
    }
    return { dep, toko, panggilan, tanyaPlane }
  }

  it('menempatkan kerja pertama antrean slot itu, DB TIDAK di-reset, dan mencatat di riwayat kedua kerja', async () => {
    const p = palsu([
      plane('FMS-10', { push: { at: T0 } as never }),
      antre('FMS-11', 1, 1),
      antre('FMS-12', 1, 2),
      antre('FMS-13', 2, 1),
    ])
    const h = await gantiOtomatis(1, { pelepas: ['FMS-10'], dep: p.dep })
    expect(h.ditempatkan).toBe('FMS-11')
    expect(p.panggilan).toEqual([{ key: 'FMS-11', n: 1, resetDb: false }])
    expect(p.toko.get('FMS-11')?.slot).toBe(1)
    expect(p.toko.get('FMS-11')?.riwayat.at(-1)?.catatan).toContain('DB slot tidak di-reset')
    expect(p.toko.get('FMS-11')?.riwayat.at(-1)?.catatan).toContain('setelah FMS-10 di-push')
    expect(p.toko.get('FMS-10')?.riwayat.at(-1)?.catatan).toContain('diteruskan otomatis ke FMS-11')
    // yang lain tidak tersentuh: FMS-12 menunggu giliran, antrean slot 2 utuh
    expect(p.toko.get('FMS-12')?.antre).toEqual({ at: T0, slot: 1, urutan: 2 })
    expect(p.toko.get('FMS-13')?.antre?.slot).toBe(2)
  })

  it('slot masih terpakai → tidak berbuat apa-apa', async () => {
    const p = palsu([plane('FMS-10', { slot: 1 }), antre('FMS-11', 1, 1)])
    const h = await gantiOtomatis(1, { dep: p.dep })
    expect(h).toEqual({ ditempatkan: null, dilewati: [], gagal: null })
    expect(p.panggilan).toEqual([])
    expect(p.tanyaPlane).toEqual([])
  })

  it('antrean slot kosong tetapi ada antre global → tidak otomatis', async () => {
    const p = palsu([antre('FMS-9', undefined, 1)])
    const h = await gantiOtomatis(1, { dep: p.dep })
    expect(h.ditempatkan).toBeNull()
    expect(p.panggilan).toEqual([])
    expect(p.toko.get('FMS-9')?.antre).toBeDefined()
  })

  it('cek basi: tiket Done di Plane dilewati, dicatat untuk Butuh kamu, lalu giliran berikutnya naik', async () => {
    const p = palsu([antre('FMS-11', 1, 1), antre('FMS-12', 1, 2)], {
      'FMS-11': 'Done',
      'FMS-12': 'In Progress',
    })
    const h = await gantiOtomatis(1, { dep: p.dep })
    expect(h.dilewati).toEqual([{ key: 'FMS-11', alasan: 'sudah selesai di Plane (Done)' }])
    expect(h.ditempatkan).toBe('FMS-12')
    const k = p.toko.get('FMS-11') as Kerja
    expect(k.antre).toBeUndefined()
    expect(k.peringatanAntre).toMatchObject({ jenis: 'dilewati', slot: 1 })
    expect(k.riwayat.at(-1)?.catatan).toContain('Dilewati dari antrean slot 1')
  })

  it('kerja yang sudah selesai dilewati tanpa bertanya ke Plane dan tanpa peringatan', async () => {
    const p = palsu([antre('FMS-11', 1, 1, { tahap: 'selesai' }), antre('FMS-12', 1, 2)])
    const h = await gantiOtomatis(1, { dep: p.dep })
    expect(p.tanyaPlane).toEqual(['FMS-12'])
    expect(p.toko.get('FMS-11')?.peringatanAntre).toBeUndefined()
    expect(p.toko.get('FMS-11')?.antre).toBeUndefined()
    expect(h.ditempatkan).toBe('FMS-12')
  })

  it('kerja lokal tidak dicek ke Plane meski statusnya apa pun', async () => {
    const p = palsu([lokal('BUG-4', { antre: { at: T0, slot: 3, urutan: 1 } })], {
      'BUG-4': 'Done',
    })
    const h = await gantiOtomatis(3, { dep: p.dep })
    expect(h.ditempatkan).toBe('BUG-4')
    expect(p.panggilan[0]).toEqual({ key: 'BUG-4', n: 3, resetDb: false })
  })

  it('slot chat punya antrean sendiri', async () => {
    const p = palsu([
      lokal('BUG-3', { slot: 3 }),
      lokal('BUG-4', { antre: { at: T0, slot: 3, urutan: 1 } }),
      lokal('REQ-1', { antre: { at: T0, slot: 3, urutan: 2 } }),
    ])
    expect((await gantiOtomatis(3, { dep: p.dep })).ditempatkan).toBeNull() // BUG-3 masih di slot
    const { slot: _s, ...bebas } = p.toko.get('BUG-3') as Kerja
    p.toko.set('BUG-3', { ...bebas, tahap: 'selesai' } as Kerja)
    expect((await gantiOtomatis(3, { dep: p.dep })).ditempatkan).toBe('BUG-4')
  })

  it('penempatan gagal: berhenti, kerja tetap di antrean dengan peringatan, yang berikutnya tidak dicoba', async () => {
    const p = palsu([antre('FMS-11', 1, 1), antre('FMS-12', 1, 2)], {}, 'FMS-11')
    const h = await gantiOtomatis(1, { dep: p.dep })
    expect(h.gagal?.key).toBe('FMS-11')
    expect(h.ditempatkan).toBeNull()
    expect(p.panggilan.map((x) => x.key)).toEqual(['FMS-11'])
    const k = p.toko.get('FMS-11') as Kerja
    expect(k.antre?.slot).toBe(1)
    expect(k.peringatanAntre).toMatchObject({ jenis: 'gagal', slot: 1 })
  })

  it('yang ditunda dilewati tanpa dikeluarkan; antrean kosong → tidak ada apa-apa', async () => {
    const p = palsu([antre('FMS-11', 1, 1, { ditunda: { at: T0 } })])
    expect((await gantiOtomatis(1, { dep: p.dep })).ditempatkan).toBeNull()
    expect(p.toko.get('FMS-11')?.antre?.slot).toBe(1)
    expect(await gantiOtomatis(2, { dep: p.dep })).toEqual({
      ditempatkan: null,
      dilewati: [],
      gagal: null,
    })
  })
})

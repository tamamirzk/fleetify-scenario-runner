// Project › Modul › Skenario: entitas project/modul, status skenario, tiket, filter chip,
// daftar berkelompok, sidebar (Tugas saya / sumber tugas belum tersedia).
import { describe, expect, it } from 'vitest'
import {
  barisSkenario,
  chipAlur,
  chipFilter,
  daftarSkenario,
  kelompokModul,
  metaSkenario,
  nilaiFilter,
  papanSkenario,
  saringSkenario,
  sidebar,
  statusJalan,
  urutAlur,
} from '../panel/js/skenario.js'
import { modulProject, PROJECTS, statusSkenario } from '../src/core/project.ts'
import { type BerkasSkenario, periksaAlur } from '../src/core/scenarios.ts'
import { SkenarioSchema } from '../src/core/skema.ts'

describe('project dan modul', () => {
  it('satu project Fleetify v2; modul = folder, urut, folder tak terdaftar di belakang', () => {
    expect(PROJECTS.map((p) => p.nama)).toEqual(['Fleetify v2'])
    const p = PROJECTS[0]
    if (!p) throw new Error('tanpa project')
    const m = modulProject(
      p,
      new Map([
        ['pengadaan', 4],
        ['insidentil', 10],
        ['zz-baru', 1],
      ]),
    )
    expect(m.map((x) => [x.id, x.nama, x.jumlah])).toEqual([
      ['insidentil', 'Perbaikan Insidentil', 10],
      ['pengadaan', 'Pengadaan & Gudang', 4],
      ['zz-baru', 'Zz baru', 1],
    ])
  })

  it('status: ada_kegagalan dihitung dari jalan terakhir; selain itu tertulis (bawaan siap)', () => {
    expect(statusSkenario(undefined, null)).toBe('siap')
    expect(statusSkenario('draf', { status: 'selesai' })).toBe('draf')
    expect(statusSkenario('siap', { status: 'gagal' })).toBe('ada_kegagalan')
  })
})

describe('skema: tiket, pemilik, status', () => {
  const dasar = {
    slug: 'contoh',
    judul: 'Contoh skenario',
    tujuan: 'Membuktikan contoh skenario berjalan di server.',
    modul: 'pengadaan',
    tiket: [],
    estimasi: '5 menit',
    persona: [{ siapa: 'mbl.storekeeper', peran: 'Penjaga gudang' }],
    data: ['Data semai'],
    setelan: [],
    prasyarat: [],
    catatan: [],
    siapkan: [],
    langkah: [
      { id: 'a', judul: 'Wati membuka', harusTerlihat: 'Tabel tampil', aksi: [{ buka: '/x' }] },
    ],
  }
  it('tiket Plane berformat FMS-123 (tautan dari TICKET_URL); pemilik dan status opsional', () => {
    const ok = SkenarioSchema.safeParse({
      ...dasar,
      tiket: ['FMS-63', 'FMS-71'],
      pemilik: 'Tams',
      status: 'draf',
    })
    expect(ok.success).toBe(true)
    expect(SkenarioSchema.safeParse({ ...dasar, tiket: ['fms63'] }).success).toBe(false)
    expect(SkenarioSchema.safeParse({ ...dasar, tiket: [{ key: 'FMS-1' }] }).success).toBe(false)
    expect(SkenarioSchema.safeParse({ ...dasar, status: 'ada_kegagalan' }).success).toBe(false)
  })
})

const f = (slug: string, extra: Record<string, unknown> = {}) => ({
  slug,
  task: 'gudang',
  title: `Judul ${slug}`,
  path: `scenarios/gudang/${slug}.json`,
  valid: true,
  masalah: [],
  estimasi: '9 menit',
  langkah: 7,
  tiket: [],
  pemilik: null,
  status: 'siap',
  last: null,
  ...extra,
})
const files = [
  f('a', {
    tiket: [{ sumber: 'plane', key: 'FMS-63' }],
    last: {
      status: 'gagal',
      run_id: 'a/1',
      started_at: '2026-11-13T02:20:00Z',
      ended_at: '2026-11-13T02:24:00Z',
      failed_step: 5,
    },
    status: 'ada_kegagalan',
  }),
  f('b', {
    task: 'perawatan',
    tiket: [{ sumber: 'jira', key: 'FMS-71' }],
    last: { status: 'selesai', run_id: 'b/1', started_at: '2026-11-13T09:13:00Z' },
  }),
  f('c', { pemilik: 'Tams', status: 'draf' }),
  f('d', { valid: false, masalah: [{ path: 'langkah[0]', message: 'aksi tidak dikenal' }] }),
]

describe('daftar skenario', () => {
  it('status jalan untuk filter', () => {
    expect(files.map(statusJalan)).toEqual(['gagal', 'lulus', 'belum', 'belum'])
  })

  it('saring: status jalan, sumber tiket (termasuk tanpa), pemilik, status, modul, cari', () => {
    const s = (o: object) => saringSkenario(files, o).map((x: { slug: string }) => x.slug)
    expect(s({ filter: { jalan: ['gagal', 'belum'] } })).toEqual(['a', 'c', 'd'])
    expect(s({ filter: { tiket: ['plane', 'jira'] } })).toEqual(['a', 'b'])
    expect(s({ filter: { tiket: ['tanpa'] } })).toEqual(['c', 'd'])
    expect(s({ filter: { pemilik: ['Tams'] } })).toEqual(['c'])
    expect(s({ filter: { status: ['tidak_valid'] } })).toEqual(['d'])
    expect(s({ modul: 'perawatan' })).toEqual(['b'])
    expect(s({ q: 'fms-63' })).toEqual(['a'])
    expect(nilaiFilter('pemilik', files)).toEqual(['(belum diisi)', 'Tams'])
  })

  it('kelompok per modul mengikuti urutan project; kelompok bisa dilipat', () => {
    const modul = [
      { id: 'perawatan', nama: 'Perawatan' },
      { id: 'gudang', nama: 'Gudang' },
    ]
    const k = kelompokModul(files, modul)
    expect(
      k.map((x: { modul: { id: string }; files: unknown[] }) => [x.modul.id, x.files.length]),
    ).toEqual([
      ['perawatan', 1],
      ['gudang', 3],
    ])
    const h = daftarSkenario(k, { lipat: new Set(['gudang']) })
    expect(h).toContain('PERAWATAN · 1')
    expect(h).toContain('aria-expanded="false"')
    expect(h).not.toContain('data-slug="a"')
  })

  it('baris: ikon hasil, slug + judul, meta gagal di langkah n + lihat laporan, chip tiket, status, aksi', () => {
    const h = barisSkenario(files[0])
    expect(h).toContain('aria-label="Jalan terakhir gagal"')
    // Baris pertama hanya judul; slug jadi rincian kecil paling akhir di baris meta.
    expect(h).toContain('<div class="sk-judul">Judul a</div>')
    expect(h).toMatch(/· <span class="sk-slug" title="Nama berkas skenario">a<\/span><\/div>/)
    expect(h).toContain('di langkah 5')
    expect(h).toContain('href="#/laporan/a/1">lihat laporan')
    expect(h).toContain('Plane ·</span> FMS-63')
    expect(h).toContain('Ada kegagalan')
    expect(h).toContain('href="#/ringkasan/a"')
    expect(h).toContain('data-sunting="a"')
    expect(h).toContain('data-lainnya="a"')
    // Tanpa tiket: tidak ada chip dan tidak ada tulisan "Tanpa tiket".
    expect(barisSkenario(files[2])).not.toContain('Tanpa tiket')
    expect(barisSkenario(files[2])).not.toContain('class="ticket"')
    expect(metaSkenario(files[2])).toBe('Belum pernah dijalankan · 7 langkah · ±9 mnt')
    expect(metaSkenario(files[3])).toContain('Tidak bisa diputar: langkah[0]: aksi tidak dikenal')
  })

  it('chip filter: Nama · operator · nilai · ×', () => {
    const h = chipFilter('jalan', ['gagal', 'belum'])
    expect(h).toContain('<b>Status jalan</b> <span class="dim">salah satu</span> Gagal, Belum')
    expect(h).toContain('data-fhapus="jalan"')
    expect(chipFilter('pemilik', ['Tams'])).toContain('adalah')
  })

  it('papan per status', () => {
    const h = papanSkenario(files)
    expect(h).toContain('aria-label="Ada kegagalan"')
    expect(h).toContain('aria-label="Draf"')
  })

  it('sidebar: Project › Modul dengan jumlah; Tugas saya belum tersedia (tanpa data palsu)', () => {
    const h = sidebar({
      halaman: 'skenario',
      project: {
        id: 'fleetify-v2',
        nama: 'Fleetify v2',
        modul: [{ id: 'gudang', nama: 'Gudang', jumlah: 4 }],
      },
      modulAktif: 'gudang',
      jumlahSemua: 25,
      jalanAktif: true,
    })
    expect(h).toContain('Tugas saya</span><small>belum tersedia</small>')
    expect(h).toContain('<span>Semua modul</span><span class="n">25</span>')
    expect(h).toContain(
      'href="#/modul/gudang" aria-current="true"><span>Gudang</span><span class="n">4</span>',
    )
    expect(h).toContain('ada jalan aktif')
  })
})

describe('grup dan alur', () => {
  const berkas = (slug: string, task: string, alur?: unknown, langkah = 10): BerkasSkenario =>
    ({
      slug,
      task,
      masalah: [],
      skenario: {
        alur,
        langkah: Array.from({ length: langkah }, (_, i) => ({ judul: `L${i + 1}` })),
      },
    }) as unknown as BerkasSkenario
  const pesan = (b: BerkasSkenario) => b.masalah.map((m) => m.message)

  it('skema menerima alur lurus dan belok; belok wajib dari dan langkah', () => {
    const sk = (alur: unknown) =>
      SkenarioSchema.safeParse({
        slug: 'x',
        judul: 'Contoh alur',
        tujuan: 'Membuktikan alur tervalidasi skema.',
        modul: 'insidentil',
        tiket: [],
        estimasi: '1 menit',
        persona: [{ siapa: 'mbl.planner', peran: 'Planner' }],
        data: ['Data semai'],
        setelan: [],
        prasyarat: [],
        catatan: [],
        siapkan: [],
        langkah: [
          { id: 'a', judul: 'Putri membuka', harusTerlihat: 'Tampil', aksi: [{ buka: '/x' }] },
        ],
        alur,
      }).success
    expect(sk({ jenis: 'lurus' })).toBe(true)
    expect(sk({ jenis: 'belok', dari: 'insidentil-lurus', langkah: 3 })).toBe(true)
    expect(sk({ jenis: 'belok', dari: 'insidentil-lurus' })).toBe(false)
    expect(sk({ jenis: 'belok', dari: 'x', langkah: 0 })).toBe(false)
    expect(sk({ jenis: 'lurus', dari: 'x' })).toBe(false)
  })

  it('periksaAlur: satu lurus per grup; belok ke lurus di grup sama dan langkah yang ada', () => {
    const lurus = berkas('lurus', 'insidentil', { jenis: 'lurus' }, 5)
    const ok = berkas('ok', 'insidentil', { jenis: 'belok', dari: 'lurus', langkah: 5 })
    const lewat = berkas('lewat', 'insidentil', { jenis: 'belok', dari: 'lurus', langkah: 6 })
    const hilang = berkas('hilang', 'insidentil', { jenis: 'belok', dari: 'tidak-ada', langkah: 1 })
    const silang = berkas('silang', 'ban', { jenis: 'belok', dari: 'lurus', langkah: 1 })
    const keBelok = berkas('ke-belok', 'insidentil', { jenis: 'belok', dari: 'ok', langkah: 1 })
    const lurus2a = berkas('l2a', 'ban', { jenis: 'lurus' })
    const lurus2b = berkas('l2b', 'ban', { jenis: 'lurus' })
    periksaAlur([lurus, ok, lewat, hilang, silang, keBelok, lurus2a, lurus2b])
    expect(pesan(lurus)).toEqual([])
    expect(pesan(ok)).toEqual([])
    expect(pesan(lewat)[0]).toMatch(/langkah 6 melebihi 5/)
    expect(pesan(hilang)[0]).toMatch(/tidak ada/)
    expect(pesan(silang)[0]).toMatch(/grup insidentil, bukan ban/)
    expect(pesan(keBelok)[0]).toMatch(/bukan alur lurus/)
    expect(pesan(lurus2a)[0]).toMatch(/2 alur lurus/)
  })

  it('urutan grup: lurus, belok menurut langkah, lalu lepas; chip menyebut titik belok', () => {
    const g = [
      f('lepas'),
      f('belok-9', { alur: { jenis: 'belok', dari: 'utama', langkah: 9, judul: 'Sesi kerja' } }),
      f('utama', { alur: { jenis: 'lurus' } }),
      f('belok-4', { alur: { jenis: 'belok', dari: 'utama', langkah: 4, judul: null } }),
    ]
    expect(urutAlur(g).map((x: { slug: string }) => x.slug)).toEqual([
      'utama',
      'belok-4',
      'belok-9',
      'lepas',
    ])
    expect(chipAlur(g[2])).toContain('Alur lurus')
    expect(chipAlur(g[1])).toContain('Belok di langkah 9 · Sesi kerja')
    expect(chipAlur(g[0])).toBe('')
    expect(barisSkenario(g[1])).toContain('sk-belok')
  })
})

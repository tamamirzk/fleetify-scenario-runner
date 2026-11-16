// Tugas saya dari Plane: pemetaan isu dan status, Papan/Daftar, saringan, dan config dari TICKET_URL.
import { describe, expect, it } from 'vitest'
import {
  barisTugas,
  halamanTugas,
  ikonPrioritas,
  ikonStatus,
  kartuTugas,
  kolomStatus,
  saringTugas,
} from '../panel/js/tugas.js'
import { loadConfig } from '../src/core/config.ts'
import { petakanTugas, urutStatus } from '../src/core/plane.ts'

const isu = (seq: number, o: Record<string, unknown> = {}) => ({
  sequence_id: seq,
  name: `Isu ${seq}`,
  priority: 'medium',
  assignees: ['saya'],
  labels: [],
  state: { id: 'st-ip', name: 'In Progress', group: 'started' },
  ...o,
})

describe('petakanTugas', () => {
  const o = { meId: 'saya', identifier: 'FMS', urlTiket: (k: string) => `https://plane/x/${k}` }

  it('hanya milik saya; Done dan cancelled ikut tapi ditandai selesai; kunci dan tautan', () => {
    const t = petakanTugas(
      [
        isu(1),
        isu(2, { assignees: ['orang-lain'] }),
        isu(3, { state: { name: 'Done', group: 'completed' } }),
        isu(4, { state: { name: 'Cancelled', group: 'cancelled' } }),
        isu(5, { assignees: [{ id: 'saya' }] }),
        isu(6, { state: { name: 'Ready in Staging and for Testing', group: 'completed' } }),
      ],
      o,
    )
    expect(t.map((x) => [x.key, x.selesai])).toEqual([
      ['FMS-1', false],
      ['FMS-5', false],
      ['FMS-3', true],
      ['FMS-6', false],
      ['FMS-4', true],
    ])
    expect(t[0]).toMatchObject({
      judul: 'Isu 1',
      status: 'In Progress',
      statusId: 'st-ip',
      grup: 'started',
      url: 'https://plane/x/FMS-1',
    })
  })

  it('status selesai bisa diatur; label dipetakan ke nama dan warna', () => {
    const [t] = petakanTugas(
      [isu(1, { state: { name: 'Code Complete', group: 'started' }, labels: ['l1', 'l9'] })],
      {
        ...o,
        selesai: ['Code Complete'],
        labels: [{ id: 'l1', name: 'BUG', color: '#eb144c' }],
      },
    )
    expect(t?.selesai).toBe(true)
    expect(t?.label).toEqual([{ nama: 'BUG', warna: '#eb144c' }])
  })

  it('urut: grup papan Plane, lalu prioritas, lalu nomor', () => {
    const t = petakanTugas(
      [
        isu(9, { state: { name: 'Todo', group: 'unstarted' }, priority: 'urgent' }),
        isu(7, { priority: 'low' }),
        isu(8, { priority: 'high' }),
        isu(3, { priority: 'high' }),
      ],
      o,
    )
    expect(t.map((x) => x.key)).toEqual(['FMS-9', 'FMS-3', 'FMS-8', 'FMS-7'])
  })
})

describe('urutStatus', () => {
  it('urutan papan Plane: grup lalu sequence; Done dan cancelled ditandai selesai', () => {
    const s = urutStatus([
      { id: 'c', name: 'Cancelled', group: 'cancelled', sequence: 55000, color: '#9AA4BC' },
      { id: 'r', name: 'Ready in Staging', group: 'completed', sequence: 97767 },
      { id: 'cc', name: 'Code Complete', group: 'started', sequence: 70000 },
      { id: 'd', name: 'Done', group: 'completed', sequence: 163302 },
      { id: 'ip', name: 'In Progress', group: 'started', sequence: 35000 },
      { id: 'b', name: 'Backlog', group: 'backlog', sequence: 15000 },
    ])
    expect(s.map((x) => x.nama)).toEqual([
      'Backlog',
      'In Progress',
      'Code Complete',
      'Ready in Staging',
      'Done',
      'Cancelled',
    ])
    expect(s.filter((x) => x.selesai).map((x) => x.nama)).toEqual(['Done', 'Cancelled'])
  })
})

describe('halaman Tugas saya', () => {
  const status = [
    { id: 'td', nama: 'Todo', grup: 'unstarted', warna: '#60646C', selesai: false },
    { id: 'ip', nama: 'In Progress', grup: 'started', warna: '#F59E0B', selesai: false },
    { id: 'dn', nama: 'Done', grup: 'completed', warna: '#46A758', selesai: true },
  ]
  const tugas = [
    {
      key: 'FMS-87',
      judul: 'Lewati pemeriksaan',
      status: 'In Progress',
      grup: 'started',
      prioritas: 'high',
      label: [{ nama: 'BUG', warna: '#eb144c' }],
      tenggat: null,
      url: 'u1',
      selesai: false,
      skenario: [{ slug: 'tiket-order', judul: 'Tiket sampai Order', alur: { jenis: 'belok' } }],
    },
    {
      key: 'FMS-90',
      judul: 'Nomor PO',
      status: 'Todo',
      grup: 'unstarted',
      prioritas: 'none',
      label: [],
      tenggat: '2026-11-20',
      url: 'u2',
      selesai: false,
      skenario: [],
    },
    {
      key: 'FMS-12',
      judul: 'Sudah selesai',
      status: 'Done',
      grup: 'completed',
      prioritas: 'low',
      label: [],
      tenggat: null,
      url: 'u3',
      selesai: true,
      skenario: [],
    },
  ]

  it('saringan: Done disembunyikan bawaan; punya / belum ada skenario', () => {
    const k = (o: object) => saringTugas(tugas, o).map((t: { key: string }) => t.key)
    expect(k({})).toEqual(['FMS-87', 'FMS-90'])
    expect(k({ selesai: true })).toEqual(['FMS-87', 'FMS-90', 'FMS-12'])
    expect(k({ skenario: 'ada' })).toEqual(['FMS-87'])
    expect(k({ skenario: 'belum', selesai: true })).toEqual(['FMS-90', 'FMS-12'])
  })

  it('kolom mengikuti urutan status Plane; kolom selesai hanya saat diminta; kolom kosong tetap ada', () => {
    const nama = (o: object, t = tugas) =>
      kolomStatus(status, t, o).map((x: { status: { nama: string } }) => x.status.nama)
    expect(nama({})).toEqual(['Todo', 'In Progress'])
    expect(nama({ selesai: true })).toEqual(['Todo', 'In Progress', 'Done'])
    expect(kolomStatus(status, [tugas[0]], {})[0]?.tugas).toEqual([])
  })

  it('kartu dan baris: kunci ke Plane, prioritas, label, skenario atau penanda belum ada', () => {
    expect(kartuTugas(tugas[0])).toContain('href="u1"')
    expect(kartuTugas(tugas[0])).toContain('#/ringkasan/tiket-order')
    expect(kartuTugas(tugas[0])).toContain('BUG')
    expect(kartuTugas(tugas[1])).toContain('Belum ada skenario')
    expect(barisTugas(tugas[1])).toContain('tg-tenggat')
    expect(ikonPrioritas('high')).toContain('Prioritas: Tinggi')
    expect(ikonPrioritas('urgent')).toContain('pr-urgent')
  })

  it('warna dari Plane hanya dipakai bila hex', () => {
    expect(ikonStatus({ grup: 'started', warna: '#F59E0B' })).toContain('color:#F59E0B')
    expect(ikonStatus({ grup: 'started', warna: 'red;background:url(x)' })).not.toContain('style')
  })

  it('Papan atau Daftar; belum dikonfigurasi; galat; statistik hanya tugas terbuka', () => {
    expect(halamanTugas({ dikonfigurasi: false })).toContain('PLANE_API_KEY')
    expect(halamanTugas(null, { galat: 'Plane menolak API key (401)' })).toContain(
      'Plane menolak API key',
    )
    const data = { dikonfigurasi: true, project: 'Fleetify v2', saya: 'Tams', status, tugas }
    const papan = halamanTugas(data)
    expect(papan).toContain('tg-papan')
    expect(papan).toContain('<div class="n">2</div><div class="l">Tugas terbuka</div>')
    expect(halamanTugas(data, { tampilan: 'daftar' })).toContain('tg-list')
    // Kolom tanpa tugas diciutkan; tugas tetap di kolomnya.
    const p2 = halamanTugas({ ...data, tugas: [tugas[0]] })
    expect(p2).toContain('tg-kolom tg-kolom-ciut" role="listitem" aria-label="Todo, kosong"')
    expect(p2).toContain('aria-label="In Progress, 1 tugas"')
    expect(halamanTugas(data, { saring: { skenario: 'belum' } })).toContain(
      'aria-pressed="true">Belum ada skenario',
    )
  })
})

describe('config Plane', () => {
  it('alamat dan workspace diturunkan dari TICKET_URL; project bawaan FMS', () => {
    const c = loadConfig({
      TICKET_URL: 'https://plane.contoh.id/fleetify/browse/',
      PLANE_API_KEY: 'x',
    })
    expect(c.plane).toEqual({
      apiKey: 'x',
      url: 'https://plane.contoh.id',
      workspace: 'fleetify',
      project: 'FMS',
      statusSelesai: ['Done'],
    })
    expect(loadConfig({}).plane.apiKey).toBeNull()
  })
})

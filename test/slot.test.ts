import { describe, expect, it } from 'vitest'
import { halamanWorkspace, isiPilihSlot, stripKomputer } from '../panel/js/workspace.js'
import { AMBANG, kelompokkan, nilaiKomputer } from '../src/core/komputer.ts'
import { branchBaru, defSlot, pilihanSlot, SLOT_CHAT, urlSlot } from '../src/core/slot.ts'

describe('slot: definisi dan pilihan (R-7.1, R-7.1a)', () => {
  it('port, DB, dan tmux tiap slot tidak bertabrakan', () => {
    const s = [1, 2, 3].map((n) => defSlot(n as 1 | 2 | 3, '/w'))
    expect(s.map((x) => [x.worktree, x.portApi, x.portWeb, x.db, x.tmux])).toEqual([
      ['/w/v2-slot1', 3010, 5181, 'fleetify_slot1', 'slot-1'],
      ['/w/v2-slot2', 3020, 5182, 'fleetify_slot2', 'slot-2'],
      ['/w/v2-slot3', 3030, 5183, 'fleetify_slot3', 'slot-3'],
    ])
    expect(branchBaru('FMS-160')).toBe('feat/fms-160')
  })

  it('kosong, gabung klaster, atau belum siap', () => {
    const pemakai = new Map([[2, [{ key: 'FMS-105', judul: 'Meter', branch: 'feat/meter' }]]])
    const siap = new Map([
      [1, true],
      [2, true],
      [3, false],
    ])
    const p = pilihanSlot(pemakai, siap)
    expect(p.map((x) => x.keadaan)).toEqual(['kosong', 'klaster', 'tidak-siap'])
    expect(p[1]?.keterangan).toContain(
      'gabung klaster FMS-105 (branch feat/meter; DB tidak di-reset)',
    )
    expect(p[0]?.keterangan).toContain('DB slot di-reset dari template')
  })

  it('slot chat (3) ditandai pinjaman dan DB-nya tidak di-reset', () => {
    expect(SLOT_CHAT).toBe(3)
    const siap = new Map([
      [1, true],
      [2, true],
      [3, true],
    ])
    const p = pilihanSlot(new Map(), siap)
    expect(p[2]?.keterangan).toContain('slot chat/bug')
    expect(p[2]?.keterangan).toContain('DB tidak di-reset')
    expect(p[0]?.keterangan).not.toContain('slot chat')
  })

  it('alamat slot eksplisit dan branch kerja lokal', () => {
    expect(urlSlot(3)).toEqual({
      web: 'http://localhost:5183',
      api: 'http://localhost:3030/api/v1',
    })
    expect(branchBaru('FMS-160')).toBe('feat/fms-160')
    expect(branchBaru('REQ-2')).toBe('feat/req-2')
    expect(branchBaru('BUG-3')).toBe('fix/bug-3')
  })
})

describe('komputer (R-7.2, R-7.9)', () => {
  it('memori dikelompokkan menurut arti; proses slot dicocokkan lewat cwd', () => {
    const g = kelompokkan(
      [
        {
          pid: 1,
          rssMb: 300,
          cpu: 2,
          perintah: 'bun run --hot src/index.ts',
          cwd: '/w/v2-slot1/Backend',
        },
        {
          pid: 2,
          rssMb: 400,
          cpu: 1,
          perintah: '/System/.../com.apple.Virtualization.VirtualMachine',
        },
        { pid: 3, rssMb: 100, cpu: 90, perintah: '/System/Library/.../mds_stores' },
        { pid: 4, rssMb: 150, cpu: 5, perintah: '/Users/x/.local/bin/claude' },
        { pid: 5, rssMb: 50, cpu: 0, perintah: '/Applications/WhatsApp.app/WhatsApp' },
      ],
      [['Slot 1', '/w/v2-slot1']],
    )
    expect(g.map((x) => [x.nama, x.mb])).toEqual([
      ['VM Colima (Docker)', 400],
      ['Slot 1', 300],
      ['Sesi Claude', 150],
      ['Spotlight', 100],
      ['Lainnya', 50],
    ])
  })

  it('memori tertekan menolak slot baru dan menyarankan slot yang diam', () => {
    const dasar = { cpu: { beban: 2, core: 8 }, disk: { sisaGiB: 50, totalGiB: 228 }, kelompok: [] }
    const ketat = nilaiKomputer(
      { ...dasar, memori: { totalGiB: 8, bebasPersen: AMBANG.tolakSlotPersen - 1 } },
      ['slot 2'],
    )
    expect(ketat.bolehNyalakanSlot).toBe(false)
    expect(ketat.peringatan[0]?.saran).toBe('matikan server slot 2 yang sedang diam')
    expect(
      nilaiKomputer({ ...dasar, memori: { totalGiB: 8, bebasPersen: 40 } }).bolehNyalakanSlot,
    ).toBe(true)
  })

  it('Spotlight sibuk → saran mengecualikan ~/work', () => {
    const n = nilaiKomputer({
      cpu: { beban: 15, core: 8 },
      memori: { totalGiB: 8, bebasPersen: 40 },
      disk: { sisaGiB: 14, totalGiB: 228 },
      kelompok: [{ nama: 'Spotlight', mb: 140, cpu: 160 }],
    })
    expect(n.peringatan.map((p) => p.teks)).toEqual([
      'Disk sisa 14 GiB',
      'Beban CPU 15.0 untuk 8 core',
    ])
    expect(n.peringatan[1]?.saran).toContain('Spotlight')
  })
})

describe('Workspace: render', () => {
  const slot = {
    n: 1,
    worktree: '/w/v2-slot1',
    portApi: 3010,
    portWeb: 5181,
    db: 'fleetify_slot1',
    tmux: 'slot-1',
    ada: true,
    head: 'b11b1c8d',
    branch: 'feat/fms-160',
    bersih: true,
    api: true,
    web: true,
    dbUkuran: '55 MB',
    pemakai: [{ key: 'FMS-160', judul: 'J', branch: 'feat/fms-160' }],
    sesi: { status: 'menunggu', fase: 'kerjakan', at: '2026-11-17T04:00:00Z' },
    diam: true,
  }
  const komputer = {
    cpu: { beban: 12, core: 8 },
    memori: { totalGiB: 8, bebasPersen: 36 },
    disk: { sisaGiB: 14, totalGiB: 228 },
    kelompok: [{ nama: 'Slot 1', mb: 300, cpu: 1 }],
    peringatan: [{ teks: 'Disk sisa 14 GiB', saran: 'bersihkan runs/ lama' }],
  }

  it('strip komputer: status punya teks, bukan hanya warna; peringatan dengan saran', () => {
    const h = stripKomputer(komputer)
    expect(h).toContain('beban 12.0 / 8 core')
    expect(h).toContain('36% bebas dari 8 GiB')
    expect(h).toContain('Disk sisa 14 GiB')
    expect(h).toContain('→ bersihkan runs/ lama')
  })

  it('kartu slot: pemakai, sesi, server hidup, Reset DB nonaktif saat server menyala', () => {
    const h = halamanWorkspace({
      slot: [slot],
      layanan: [{ id: 'postgres', nama: 'Postgres native :5433', ok: true, saran: '' }],
      antre: [{ key: 'FMS-170', judul: 'K' }],
      komputer,
    })
    expect(h).toContain('href="#/kerja/FMS-160"')
    expect(h).toContain('◆ Menunggu kamu')
    expect(h).toContain('<span class="chip">diam</span>')
    expect(h).toMatch(/data-ws-aksi="reset" disabled/)
    expect(h).toContain('data-ws-tempatkan="FMS-170"')
  })

  it('dialog Ambil: slot belum siap nonaktif, Antrekan selalu ada', () => {
    const h = isiPilihSlot('FMS-170', [
      { n: 1, keadaan: 'kosong', pemakai: [], keterangan: 'baru' },
      { n: 3, keadaan: 'tidak-siap', pemakai: [], keterangan: 'belum ada' },
    ])
    expect(h).toContain('Slot 1 · kosong')
    expect(h).toMatch(/value="3" disabled/)
    expect(h).toContain('value="antre"')
    expect(h).toContain('feat/fms-170')
  })
})

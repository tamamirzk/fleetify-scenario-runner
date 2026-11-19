import { describe, expect, it } from 'vitest'
import { butirTertahan, stripMini } from '../panel/js/dasbor.js'
import { barisRencana, halamanWorkspace, isiPilihSlot, kartuSlot } from '../panel/js/workspace.js'
import { butuhKamu, lajurKerja } from '../src/core/butuh-kamu.ts'
import { kerjaLokal } from '../src/core/kerja-lokal.ts'

const ok = { ok: true, masalah: [] } as never
const slotDasar = {
  n: 1,
  chat: false,
  pemakai: [{ key: 'FMS-10', judul: 'Tiket sepuluh' }],
  ada: true,
  bersih: true,
  branch: 'feat/fms-10',
  head: 'h',
  api: false,
  web: false,
  portApi: 3010,
  portWeb: 5181,
  db: 'd',
  dbUkuran: null,
  worktree: '/x',
}

describe('antrean per slot di panel', () => {
  it('kartu slot: Sedang + Berikutnya berurutan dengan aksi per butir', () => {
    const h = kartuSlot({
      ...slotDasar,
      antrean: [
        { key: 'FMS-11', judul: 'A', urutan: 1 },
        { key: 'FMS-12', judul: 'B', urutan: 2, ditunda: true },
      ],
    })
    expect(h).toContain('>Sedang<')
    expect(h).toContain('Berikutnya')
    expect(h.indexOf('FMS-11')).toBeLessThan(h.indexOf('FMS-12'))
    for (const a of [
      'data-ws-urut="FMS-11"',
      'data-arah="turun"',
      'data-ws-pindah="FMS-12"',
      'data-ws-keluar="FMS-12"',
    ])
      expect(h).toContain(a)
    // butir pertama tidak bisa naik, terakhir tidak bisa turun
    expect(h).toMatch(/data-ws-urut="FMS-11" data-arah="naik"[^>]*disabled/)
    expect(h).toMatch(/data-ws-urut="FMS-12" data-arah="turun"[^>]*disabled/)
    expect(h).not.toContain('Mulai antrean')
    expect(h).toContain('ditunda')
  })
  it('slot kosong dengan antrean menawarkan Mulai antrean; tanpa antrean tidak ada daftar', () => {
    const h = kartuSlot({
      ...slotDasar,
      pemakai: [],
      antrean: [{ key: 'FMS-11', judul: 'A', urutan: 1 }],
    })
    expect(h).toContain('data-ws-mulai="1"')
    expect(kartuSlot({ ...slotDasar, antrean: [] })).not.toContain('Berikutnya')
  })
  it('rencana slot: opsi pertama = usulan, peringatan klaster muncul bila >= 2 tiket', () => {
    const u = (key: string) => ({
      key,
      judul: 'J',
      modul: 'fleet',
      alasan: 'modul fleet sama dengan FMS-10 di slot 1',
      usulan: { jenis: 'antre', n: 1, label: 'Antre di slot 1' },
      opsi: [
        { jenis: 'antre', n: 1, label: 'Antre di slot 1' },
        { jenis: 'klaster', n: 1, label: 'Satu klaster dengan FMS-10 (slot 1)' },
      ],
    })
    expect(barisRencana(u('FMS-5'))).toContain('value="antre:1" selected')
    const dasar = { slot: [], layanan: [], komputer: null, antre: [], pilihan: [] }
    const dua = halamanWorkspace({
      ...dasar,
      rencana: {
        usulan: [u('FMS-5'), u('FMS-6')],
        peringatan: 'Bila tiket bergantung pada tiket lain yang belum di-merge, pakai klaster.',
      },
    })
    expect(dua).toContain('Rencana slot')
    expect(dua).toContain('pakai klaster')
    const satu = halamanWorkspace({
      ...dasar,
      rencana: { usulan: [u('FMS-5')], peringatan: 'pakai klaster' },
    })
    expect(satu).not.toContain('pakai klaster')
    expect(halamanWorkspace({ ...dasar, rencana: { usulan: [], peringatan: '' } })).toContain(
      'Tidak ada tiket yang menunggu slot',
    )
  })
  it('dialog Ambil menawarkan antre di slot terisi', () => {
    const h = isiPilihSlot('FMS-9', [
      { n: 1, keadaan: 'klaster', pemakai: [{ key: 'FMS-10' }], keterangan: 'k' },
      { n: 2, keadaan: 'kosong', pemakai: [], keterangan: 'k' },
    ])
    expect(h).toContain('value="antre:1"')
    expect(h).not.toContain('value="antre:2"')
    expect(h).toContain('value="antre"')
  })
  it('strip Dashboard menyebut jumlah antrean', () => {
    const h = stripMini({
      slot: [
        { n: 1, pemakai: ['FMS-10'], antre: 2, api: false, web: false, sesi: null, chat: false },
      ],
      komputer: { beban: 1, core: 8, memoriBebas: 50, diskSisa: 100, peringatan: 0 },
    })
    expect(h).toContain('FMS-10 · antre 2')
  })
  it('butir antrean tertahan: alasan, sisa antrean, dan pilihan tujuan', () => {
    const h = butirTertahan({
      slot: 1,
      oleh: 'FMS-10',
      judulOleh: 'x',
      alasan: 'menunggu review ◆B',
      antrean: [{ key: 'FMS-11', judul: 'a' }],
    })
    expect(h).toContain('Antrean slot 1 tertahan oleh FMS-10 (menunggu review ◆B)')
    expect(h).toContain('data-db-sisa="1"')
    expect(h).toContain('Pindahkan sisa antrean ke slot lain')
    expect(h).not.toContain('<option value="1">')
    expect(h).toContain('<option value="global">')
  })
})

describe('Butuh kamu untuk pergantian otomatis', () => {
  const k = {
    ...kerjaLokal('FMS-11', 'T', 's', '2026-11-19T00:00:00.000Z'),
    url: 'https://p',
    plane: { id: '1', projectId: 'p', status: 'Todo' },
  }
  it('dilewati: tampil dengan alasan; gagal: tampil; hilang bila sudah punya slot', () => {
    const lewat = {
      ...k,
      peringatanAntre: {
        at: 'x',
        jenis: 'dilewati',
        slot: 1,
        alasan: 'sudah selesai di Plane (Done)',
      },
    } as never
    const b = butuhKamu(lewat, { brief: ok, akhir: ok })
    expect(b?.alasan).toBe('Dilewati dari antrean slot 1: sudah selesai di Plane (Done)')
    expect(lajurKerja(lewat, { brief: ok, akhir: ok }).lajur).toBe('butuh')
    const gagal = {
      ...k,
      peringatanAntre: { at: 'x', jenis: 'gagal', slot: 1, alasan: 'kotor' },
    } as never
    expect(butuhKamu(gagal, { brief: ok, akhir: ok })?.alasan).toContain(
      'Penempatan otomatis ke slot 1 gagal',
    )
    expect(
      butuhKamu({ ...(gagal as object), slot: 1 } as never, { brief: ok, akhir: ok })?.alasan ?? '',
    ).not.toContain('gagal')
  })
  it('lajur antre menyebut slot tujuan', () => {
    const a = { ...k, tahap: 'didokumentasikan', antre: { at: 'x', slot: 2, urutan: 1 } } as never
    const l = lajurKerja(a, { brief: ok, akhir: ok })
    expect(l.lajur).toBe('antre')
    expect(l.alasan).toBe('Antre di slot 2')
    expect(
      lajurKerja({ ...(a as object), antre: { at: 'x' } } as never, { brief: ok, akhir: ok })
        .alasan,
    ).toBe('Menunggu slot kosong')
  })
})

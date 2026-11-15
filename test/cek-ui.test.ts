// Pemeriksaan UI terstruktur: skema `cek`, pencatatan dari aksi pastikan*, penilaian field
// cek (semua dinilai dulu, baru gagal), dan data laporan per langkah.
import { describe, expect, it } from 'vitest'
import {
  type CatatanCek,
  cocokNilai,
  jalankanAksi,
  jalankanCek,
  type Layar,
  type Lingkungan,
} from '../src/core/interpreter.ts'
import { statusHasil, susunDataLaporan } from '../src/core/laporan-data.ts'
import type { HasilCek, RunResult, StepResult } from '../src/core/run-types.ts'
import { CekSchema, LangkahSchema, type Sasaran } from '../src/core/skema.ts'

function layarCek(o: { terlihat?: (s: Sasaran) => boolean; teks?: string | null } = {}) {
  const l = {
    terlihat: async (s: Sasaran) => o.terlihat?.(s) ?? true,
    hilang: async (s: Sasaran) => !(o.terlihat?.(s) ?? false),
    nonaktif: async () => false,
    teksElemen: async () => (o.teks === undefined ? 'sisa 1' : o.teks),
  }
  return l as unknown as Layar
}
function envCek(layar: Layar, data: Record<string, unknown> = {}) {
  const dicatat: CatatanCek[] = []
  const catatan: string[] = []
  const e: Lingkungan = {
    layar,
    data,
    catat: (t) => catatan.push(t),
    log: () => {},
    pustaka: async () => null,
    cek: async (c) => {
      dicatat.push(c)
    },
  }
  return { e, dicatat, catatan }
}

describe('skema cek', () => {
  it('tepat satu jenis; diharapkan hanya bersama nilai', () => {
    expect(CekSchema.safeParse({ terlihat: 'Menunggu persetujuan' }).success).toBe(true)
    expect(
      CekSchema.safeParse({ id: '5.2', nilai: { label: 'Sisa' }, diharapkan: '1', lunak: true })
        .success,
    ).toBe(true)
    expect(CekSchema.safeParse({ terlihat: 'a', tidakTerlihat: 'b' }).success).toBe(false)
    expect(CekSchema.safeParse({ nilai: { label: 'x' } }).success).toBe(false)
    expect(CekSchema.safeParse({ terlihat: 'a', diharapkan: '1' }).success).toBe(false)
    expect(CekSchema.safeParse({ id: '5', terlihat: 'a' }).success).toBe(false)
  })

  it('langkah lama tanpa cek/deskripsi tetap valid', () => {
    const l = {
      id: 'a',
      judul: 'Wati membuka',
      harusTerlihat: 'Tabel tampil',
      aksi: [{ buka: '/x' }],
    }
    expect(LangkahSchema.safeParse(l).success).toBe(true)
    expect(LangkahSchema.safeParse({ ...l, cek: [] }).success).toBe(false)
  })
})

describe('cek dari aksi pastikan*', () => {
  it('lulus dan gagal tercatat dengan diharapkan vs terlihat; gagal tetap melempar', async () => {
    const { e, dicatat } = envCek(layarCek({ terlihat: (s) => s.teks === 'Ada' }))
    await jalankanAksi({ pastikanTerlihat: 'Ada' }, e)
    await expect(jalankanAksi({ pastikanTerlihat: 'Hilang', batas: 2000 }, e)).rejects.toThrow(
      /tidak terpenuhi/,
    )
    expect(dicatat).toHaveLength(2)
    expect(dicatat[0]).toMatchObject({ jenis: 'terlihat', lulus: true, terlihat: 'terlihat' })
    expect(dicatat[1]).toMatchObject({
      lulus: false,
      diharapkan: '“Hilang” terlihat',
      terlihat: 'tidak ditemukan dalam 2 dtk',
    })
  })

  it('lunak: tercatat gagal tanpa melempar', async () => {
    const { e, dicatat, catatan } = envCek(layarCek({ terlihat: () => false }))
    await jalankanAksi({ pastikanTerlihat: 'X', lunak: true }, e)
    expect(dicatat[0]).toMatchObject({ lulus: false, lunak: true })
    expect(catatan).toHaveLength(1)
  })

  it('pastikanNonaktif tercatat', async () => {
    const { e, dicatat } = envCek(layarCek())
    await expect(jalankanAksi({ pastikanNonaktif: { tombol: 'Ajukan' } }, e)).rejects.toThrow()
    expect(dicatat[0]).toMatchObject({ jenis: 'nonaktif', terlihat: 'masih aktif', lulus: false })
  })
})

describe('field cek', () => {
  it('nilai: cocok persis tanpa beda huruf/spasi, atau pola', () => {
    expect(cocokNilai('  Sisa  1 ', 'sisa 1')).toBe(true)
    expect(cocokNilai('sisa 2', 'sisa 1')).toBe(false)
    expect(cocokNilai('PR-2026-0001', '/^PR-\\d{4}-\\d{4}$/')).toBe(true)
  })

  it('semua cek dinilai dulu, lalu gagal sekali dengan semua yang gagal', async () => {
    const { e, dicatat } = envCek(
      layarCek({ terlihat: (s) => s.teks !== 'Belum', teks: 'sisa 2' }),
      {
        mr: { nomor: 'MR-1' },
      },
    )
    await expect(
      jalankanCek(
        [
          { terlihat: '{mr.nomor}' },
          { nilai: { label: 'Sisa' }, diharapkan: 'sisa 1', judul: 'Sisa pinjaman Made' },
          { terlihat: 'Belum', lunak: true },
        ],
        e,
      ),
    ).rejects.toThrow(/Sisa pinjaman Made: diharapkan sisa 1, terlihat sisa 2/)
    expect(dicatat.map((c) => c.lulus)).toEqual([true, false, false])
    expect(dicatat[0]?.diharapkan).toBe('“MR-1” terlihat')
    expect(dicatat[1]).toMatchObject({ jenis: 'nilai', terlihat: 'sisa 2' })
  })

  it('elemen nilai tidak ditemukan', async () => {
    const { e, dicatat } = envCek(layarCek({ teks: null }))
    await expect(
      jalankanCek([{ nilai: { label: 'x' }, diharapkan: '1', batas: 1000 }], e),
    ).rejects.toThrow()
    expect(dicatat[0]?.terlihat).toBe('tidak ditemukan dalam 1 dtk')
  })
})

const cek = (id: string, lulus: boolean | null, extra: Partial<HasilCek> = {}): HasilCek => ({
  id,
  langkah: Number(id.split('.')[0]),
  jenis: lulus === null ? 'manual' : 'terlihat',
  sumber: lulus === null ? 'harus_terlihat' : 'aksi',
  judul: id,
  diharapkan: 'x',
  terlihat: lulus === null ? null : lulus ? 'terlihat' : 'tidak ditemukan',
  lulus,
  screenshot: null,
  bbox: null,
  waktu: '2026-11-14T10:00:00Z',
  ...extra,
})
const step = (n: number, status: StepResult['status'], c: HasilCek[]) =>
  ({ n, title: `L${n}`, status, cek: c }) as unknown as StepResult

describe('data laporan UI', () => {
  it('status hasil per langkah', () => {
    expect(statusHasil(step(1, 'lulus', [cek('1.1', true)]))).toBe('lulus')
    expect(statusHasil(step(1, 'lulus', [cek('1.0', null)]))).toBe('tidak_diperiksa')
    expect(statusHasil(step(1, 'lulus', [cek('1.1', false, { lunak: true })]))).toBe('peringatan')
    expect(statusHasil(step(1, 'gagal', [cek('1.1', false)]))).toBe('gagal')
    expect(statusHasil(step(1, 'menunggu', []))).toBe('menunggu')
    expect(statusHasil(step(1, 'dilompati', []))).toBe('dilewati')
  })

  it('ringkasan UI x/y hanya menghitung cek yang dinilai otomatis', () => {
    const r = {
      status: 'gagal',
      findings: [{}],
      duration_ms: 1000,
      steps: [
        step(1, 'lulus', [cek('1.1', true), cek('1.2', true)]),
        step(2, 'lulus', [cek('2.0', null)]),
        step(3, 'gagal', [cek('3.1', true), cek('3.2', false)]),
      ],
    } as unknown as RunResult
    const d = susunDataLaporan(r)
    expect(d.ringkasan.ui).toEqual({ lulus: 3, total: 4, gagal: 1, lunak: 0 })
    expect(d.ringkasan.temuan).toBe(1)
    expect(d.langkah.map((l) => `${l.n}·${l.lulus}/${l.total}·${l.status}`)).toEqual([
      '1·2/2·lulus',
      '2·0/0·tidak_diperiksa',
      '3·1/2·gagal',
    ])
    expect(d.cek).toHaveLength(5)
  })
})

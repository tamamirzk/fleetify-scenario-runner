import { describe, expect, it } from 'vitest'
import { lapisanKode, paketReview } from '../panel/js/kerja.js'
import { bagianPerhatian, jenisBagian } from '../src/core/catatan.ts'

const kode = {
  commits: [
    {
      berkas: [
        { path: 'Backend/prisma/schema/migrations/2026_x/migration.sql', tambah: 39, hapus: 0 },
        { path: 'Backend/src/modules/fleet/x.ts', tambah: 100, hapus: 10 },
        { path: 'Backend/src/modules/fleet/__tests__/x.test.ts', tambah: 50, hapus: 0 },
        { path: 'Frontend/src/modules/fleet/Dialog.tsx', tambah: 80, hapus: 5 },
        { path: 'Frontend/src/shared/i18n/locales/id.json', tambah: 20, hapus: 1 },
        { path: 'Frontend/src/shared/i18n/locales/en.json', tambah: 20, hapus: 1 },
      ],
    },
  ],
}

describe('paket review ◆B (R-9.2)', () => {
  it('perubahan kode dikelompokkan per lapisan dalam urutan tetap', () => {
    expect(lapisanKode(kode).map((x) => [x.lapisan, x.berkas, x.tambah])).toEqual([
      ['DB: migrasi & skema', 1, 39],
      ['Backend', 1, 100],
      ['Frontend', 1, 80],
      ['Teks (i18n)', 2, 40],
      ['Tes', 1, 50],
    ])
  })

  it('"Perlu diperhatikan" dikenali sebagai bagian sendiri; komentar panduan dibuang', () => {
    expect(jenisBagian('Perlu diperhatikan')).toBe('perhatian')
    expect(jenisBagian('Risiko')).toBe('perhatian')
    expect(
      bagianPerhatian(
        '## Perlu diperhatikan\n<!-- panduan -->\nMigrasi menyentuh tabel besar.\n## Kendala\nx',
      ),
    ).toBe('Migrasi menyentuh tabel besar.')
  })

  it('satu layar: kriteria + bukti, keputusan AI, kriteria terbuka, peringatan gerbang, kode, tombol', () => {
    const d = {
      perhatian: 'Ada penyimpangan dari tiket: label diganti.',
      periksa: { akhir: { ok: true, masalah: [] } },
      kerja: {
        key: 'FMS-9',
        verifikasi: [
          { kriteria: 'Total berlanjut', hasil: 'lulus', bukti: '118.620 km (verifikasi/2-a.png)' },
          { kriteria: 'HM ikut', hasil: 'belum' },
        ],
        keputusan: [
          { id: 1, apa: 'Odometer tetap total', oleh: 'ai', at: '', alasan: 'PM tetap benar' },
        ],
        gerbang: {
          fokus: {
            tingkat: 'fokus',
            hasil: 'peringatan',
            langkah: [
              { judul: 'Frontend: tes', hasil: 'peringatan', ringkas: 'sama dengan development' },
            ],
          },
        },
      },
    }
    const h = paketReview(d, kode)
    for (const x of [
      'Total berlanjut',
      'src="/kerja/FMS-9/verifikasi/2-a.png"',
      '<b>Diputuskan AI:</b> Odometer tetap total',
      'Kriteria belum: HM ikut',
      'Gerbang fokus: Frontend: tes — sama dengan development',
      'Ada penyimpangan dari tiket',
      'DB: migrasi &amp; skema',
      'Setuju &amp; Serahkan',
      'Minta ubah',
      '○ gerbang CI belum',
    ])
      expect(h).toContain(x)
    expect(
      paketReview({ ...d, periksa: { akhir: { ok: false, masalah: ['x'] } } }, kode),
    ).toContain('disabled title="Catatan akhir belum lengkap"')
  })
})

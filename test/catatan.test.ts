import { describe, expect, it } from 'vitest'
import {
  centangCekStaging,
  DATA_CATATAN_KOSONG,
  jawabPertanyaan,
  jenisBagian,
  pecahCatatan,
  periksaCatatan,
  renderCatatan,
  selesaikanMintaUbah,
  tambahCekStaging,
  tambahKeputusan,
  tambahMintaUbah,
  tambahPertanyaan,
  templatCatatan,
} from '../src/core/catatan.ts'

const lulus = [{ kriteria: 'A', hasil: 'lulus' }]

describe('catatan: data terstruktur', () => {
  it('menjawab pertanyaan menutupnya dan mencatat keputusan Tams', () => {
    let d = tambahPertanyaan(DATA_CATATAN_KOSONG, 'Odometer tetap total?', ['Ya', 'Tidak'])
    expect(d.pertanyaan[0]).toMatchObject({ id: 1, usulan: ['Ya', 'Tidak'], jawaban: null })
    d = jawabPertanyaan(d, 1, 'Ya')
    expect(d.pertanyaan[0]?.jawaban).toBe('Ya')
    expect(d.keputusan[0]).toMatchObject({
      id: 1,
      oleh: 'tams',
      pertanyaan: 1,
      apa: 'Odometer tetap total? → Ya',
    })
    expect(() => jawabPertanyaan(d, 1, 'Tidak')).toThrow('sudah dijawab')
    expect(() => jawabPertanyaan(d, 9, 'x')).toThrow('tidak ada')
  })

  it('nomor naik per jenis; minta ubah dan cek staging bisa ditutup', () => {
    let d = tambahKeputusan(
      DATA_CATATAN_KOSONG,
      'Pakai merge, bukan rebase',
      'ai',
      'branch sudah di-push',
    )
    d = tambahKeputusan(d, 'Kedua', 'tams')
    expect(d.keputusan.map((k) => k.id)).toEqual([1, 2])
    d = tambahMintaUbah(d, 'Tambah tes HM', 'B')
    d = selesaikanMintaUbah(d, 1)
    expect(d.mintaUbah[0]?.selesai).toBeTruthy()
    d = tambahCekStaging(d, 'sync-rbac --apply')
    d = centangCekStaging(d, 1)
    expect(d.cekStaging[0]?.selesai).toBeTruthy()
    expect(centangCekStaging(d, 1, false).cekStaging[0]?.selesai).toBeNull()
  })
})

describe('catatan: bagian tulisan', () => {
  it('judul lama dipetakan ke jenis tetap', () => {
    expect(jenisBagian('Masalahnya: kenapa input MCR jadi anomali')).toBe('masalah')
    expect(jenisBagian('Yang kita lakukan')).toBe('dikerjakan')
    expect(jenisBagian('Verifikasi (lokal)')).toBe('verifikasi')
    expect(jenisBagian('Setelah merge dan deploy')).toBe('deploy')
    expect(jenisBagian('Merge development (16 Nov)')).toBe('lain')
  })

  it('## di dalam blok kode tidak memecah bagian', () => {
    const { pembuka, bagian } = pecahCatatan(
      '# X\n\npembuka\n\n## Masalah\nisi\n```\n## bukan judul\n```\n## Rencana\nr',
    )
    expect(pembuka).toBe('# X\n\npembuka')
    expect(bagian.map((b) => b.jenis)).toEqual(['masalah', 'rencana'])
    expect(bagian[0]?.isi).toContain('## bukan judul')
  })
})

describe('catatan: gerbang', () => {
  it('templat kosong belum lolos brief; komentar panduan tidak dihitung sebagai isi', () => {
    const p = periksaCatatan(templatCatatan('FMS-1'), DATA_CATATAN_KOSONG, [], 'brief')
    expect(p.ok).toBe(false)
    expect(p.masalah).toEqual([
      'bagian "Masalah & penyebab" kosong',
      'bagian "Rencana" kosong',
      'belum ada kriteria (bun run kerja cek KEY belum "kriteria" "cara membuktikan")',
    ])
  })

  it('brief lengkap: masalah, rencana, dan kriteria', () => {
    const md = '## Masalah & penyebab\nMeter diganti.\n## Rencana\nTabel baru.'
    expect(
      periksaCatatan(md, DATA_CATATAN_KOSONG, [{ kriteria: 'A', hasil: 'belum' }], 'brief').ok,
    ).toBe(true)
  })

  it('akhir menolak catatan basi seperti kasus FMS-105 (usulan dan pertanyaan terbuka)', () => {
    const basi =
      '## Masalah\nm\n## Usulan desain (perlu disetujui sebelum dikerjakan)\nx\n## Yang dikerjakan\ny\nMasih menunggu keputusan PO.'
    const d = tambahPertanyaan(
      tambahMintaUbah(DATA_CATATAN_KOSONG, 'ubah', 'B'),
      'Siapa yang ganti meter?',
    )
    const p = periksaCatatan(
      basi,
      d,
      [
        { kriteria: 'A', hasil: 'lulus' },
        { kriteria: 'B', hasil: 'belum' },
      ],
      'akhir',
    )
    expect(p.masalah).toEqual([
      '1 kriteria belum dicek',
      '1 pertanyaan belum dijawab',
      '1 permintaan ubah belum selesai',
      'bagian "Usulan desain (perlu disetujui sebelum dikerjakan)" masih berupa usulan/pertanyaan',
      'teks basi: "menunggu keputusan"',
    ])
  })

  it('akhir lolos: rencana tak lagi wajib, "Usulan" di dalam kalimat keputusan boleh', () => {
    const md =
      '## Masalah & penyebab\nm\n## Keputusan\nUsulan alur PENDING tidak dikerjakan.\n## Yang dikerjakan\ny'
    expect(periksaCatatan(md, DATA_CATATAN_KOSONG, lulus, 'akhir')).toEqual({
      ok: true,
      masalah: [],
    })
  })
})

describe('catatan: render dokumen hidup', () => {
  const md = `# FMS-9 · Catatan

## Yang dikerjakan
Kode.

## Masalah & penyebab
Masalah.

## Verifikasi (lokal)
| tabel lama | basi |

## Merge development
Merge.
`

  it('urutan tetap, bagian data dirender, verifikasi tulisan lama diganti data, bagian lain tetap ikut', () => {
    let d = tambahPertanyaan(DATA_CATATAN_KOSONG, 'Pakai template?', ['Ya'])
    d = tambahKeputusan(d, 'Merge, bukan rebase', 'ai', 'sudah di-push')
    d = tambahCekStaging(d, 'Jalankan migrasi')
    const r = renderCatatan({
      key: 'FMS-9',
      md,
      data: d,
      verifikasi: [
        { kriteria: 'Total berlanjut', hasil: 'lulus', bukti: '118.620 km (verifikasi/2-a.png)' },
      ],
    })
    const judul = [...r.matchAll(/^## (.+)$/gm)].map((m) => m[1])
    expect(judul).toEqual([
      'Masalah & penyebab',
      'Pertanyaan terbuka',
      'Keputusan',
      'Yang dikerjakan',
      'Verifikasi',
      'Setelah deploy',
      'Merge development',
    ])
    expect(r).toContain('- ○ **#1** Pakai template? — usulan: Ya')
    expect(r).toContain('| 1 | Merge, bukan rebase — sudah di-push | **AI — tinjau** |')
    expect(r).toContain('| Total berlanjut | ✓ 118.620 km |')
    expect(r).not.toContain('tabel lama')
    expect(r).toContain('- ○ Jalankan migrasi')
  })
})

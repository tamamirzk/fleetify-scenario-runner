// Daftar aksi pustaka yang bisa dipanggil skenario JSON dengan nama.
// Menambah aksi: tulis di salah satu berkas pustaka, daftarkan di sini, lalu tulis di
// docs/SKEMA-SKENARIO.md (bun run docs:pustaka mencetak tabelnya).

import type { ZodType } from 'zod'
import { rujukan } from '../core/placeholder.ts'
import { formatPath, type MasalahSkema } from '../core/skema.ts'
import * as approval from './approval.ts'
import * as lingkungan from './lingkungan.ts'
import * as material from './material.ts'
import * as tiket from './tiket.ts'
import type { AksiPustaka } from './types.ts'
import * as umum from './umum.ts'
import * as wo from './wo.ts'

export const PUSTAKA: Record<string, AksiPustaka> = {
  barang: umum.barang,
  'tambah-foto': umum.tambahFoto,
  'pilih-mekanik': umum.pilihMekanik,
  'mr-mandiri': material.mrMandiri,
  'ajukan-mr': material.ajukanMr,
  'setujui-semua': material.setujuiSemua,
  'serah-alat': material.serahAlat,
  'kembalikan-alat': material.kembalikanAlat,
  'periksa-pinjaman': material.periksaPinjaman,
  'mr-disetujui-wo': material.mrDisetujuiWo,
  'serah-mr-wo': material.serahMrWo,
  'retur-wo': material.returWo,
  'wo-dirilis': wo.woDirilis,
  'buka-sesi': wo.bukaSesi,
  'dokumentasi-kerja': wo.dokumentasiKerja,
  'akhiri-sesi': wo.akhiriSesi,
  'putuskan-sesi': wo.putuskanSesi,
  'alur-persetujuan': approval.alurPersetujuan,
  'periksa-alur-kosong': approval.periksaAlurKosong,
  'buka-ubah-alur': approval.bukaUbahAlur,
  'simpan-alur': approval.simpanAlur,
  po: approval.po,
  'majukan-tenggat-sla': approval.majukanTenggatSla,
  tiket: tiket.tiket,
  order: tiket.order,
  'pemeriksaan-order': tiket.pemeriksaanOrder,
  'isi-pemeriksaan': tiket.isiPemeriksaan,
  'lapor-tiket': tiket.laporTiket,
  'zona-waktu': lingkungan.zonaWaktu,
  'konfirmasi-zona-waktu': lingkungan.konfirmasiZonaWaktu,
}

/** Kunci aksi pustaka → jenis pustaka yang boleh dipanggil. */
export const KUNCI_PUSTAKA = { siapkan: 'api', api: 'api', layar: 'layar' } as const

export function argumenAksi(aksi: Record<string, unknown>, kunci: string) {
  const { [kunci]: _nama, simpan: _simpan, ...args } = aksi
  return args
}

/** Periksa nama, jenis, dan argumen aksi pustaka saat berkas dibaca. Nilai yang memuat
 * placeholder baru bisa diperiksa saat jalan, jadi hanya kuncinya yang diperiksa di sini. */
export function periksaAksiPustaka(
  aksi: Record<string, unknown>,
  kunci: keyof typeof KUNCI_PUSTAKA,
  path: string,
): MasalahSkema[] {
  const nama = String(aksi[kunci])
  const p = PUSTAKA[nama]
  if (!p)
    return [{ path, message: `aksi pustaka "${nama}" tidak ada (lihat docs/SKEMA-SKENARIO.md)` }]
  if (p.jenis !== KUNCI_PUSTAKA[kunci])
    return [
      {
        path,
        message: `"${nama}" adalah aksi ${p.jenis}; panggil dengan "${p.jenis === 'api' ? 'api' : 'layar'}"${p.jenis === 'api' ? ' (atau "siapkan" di bagian siapkan)' : ''}`,
      },
    ]
  const out: MasalahSkema[] = []
  const shape = p.argumen.shape as Record<string, ZodType>
  const args = argumenAksi(aksi, kunci)
  for (const k of Object.keys(args))
    if (!(k in shape))
      out.push({
        path: `${path}.${k}`,
        message: `argumen "${k}" tidak dikenal untuk ${nama}; yang ada: ${Object.keys(shape).join(', ') || '(tanpa argumen)'}`,
      })
  for (const [k, field] of Object.entries(shape)) {
    const v = args[k]
    if (v !== undefined && rujukan(v).length > 0) continue
    const r = field.safeParse(v)
    if (!r.success)
      for (const i of r.error?.issues ?? [])
        out.push({
          path: `${path}.${formatPath([k, ...i.path])}`,
          message: v === undefined ? `argumen "${k}" wajib untuk ${nama}` : i.message,
        })
  }
  return out
}

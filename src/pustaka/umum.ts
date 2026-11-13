// Aksi pustaka umum: barang uji baru, foto lewat URL, pilih mekanik di dialog.
import { z } from 'zod'
import { PERSONA_IDS } from '../core/personas.ts'
import { pola } from '../core/placeholder.ts'
import { cariLocator } from '../core/sasaran.ts'
import { type Sasaran, SasaranSchema } from '../core/skema.ts'
import { api, type DokumenRujukan, layar } from './types.ts'

const persona = z.enum(PERSONA_IDS)

export const barang = api({
  ringkasan:
    'Buat barang baru dengan saldo awal di satu gudang. SKU = <kode>-<stempel>, nama = <nama> <stempel>; nomor seri = <kode>-<stempel>-<n>.',
  hasil: '{ id, sku, nama, seri: string[], gudang_id }',
  dokumen: (h): DokumenRujukan[] => {
    const b = h as { id: string; gudang_id: string }
    return [
      { tabel: 'parts', where: { id: b.id } },
      {
        tabel: 'warehouse_stock',
        where: { warehouse_id: b.gudang_id, part_id: b.id },
        label: 'stok',
      },
    ]
  },
  argumen: z
    .object({
      sebagai: persona.default('mbl.storekeeper'),
      gudang: z.string().min(1).describe('Nama atau kode gudang, mis. "WH-ALPHA"'),
      kode: z.string().regex(/^[A-Z0-9-]+$/, 'huruf besar, angka, tanda hubung'),
      nama: z.string().min(3),
      jenis: z.enum(['SPAREPART', 'CONSUMABLE', 'TOOL']).default('SPAREPART'),
      jumlah: z.number().int().positive().optional().describe('Untuk barang tanpa nomor seri'),
      seri: z.number().int().positive().optional().describe('Banyak nomor seri (barang SERIAL)'),
      harga: z.string().regex(/^\d+$/).default('100000'),
    })
    .strict()
    .refine((a) => (a.jumlah === undefined) !== (a.seri === undefined), {
      message: 'isi tepat satu dari jumlah atau seri',
    }),
  urai: (a) => `Buat barang ${a.nama}`,
  async jalankan(ctx, a) {
    const rc = await ctx.as(a.sebagai)
    const wh = await ctx.kit.findWarehouse(rc, a.gudang)
    const sku = `${a.kode}-${ctx.stempel}`
    const serials = a.seri ? Array.from({ length: a.seri }, (_, i) => `${sku}-${i + 1}`) : undefined
    const item = await ctx.kit.newItem(ctx, rc, wh.id, {
      sku,
      name: `${a.nama} ${ctx.stempel}`,
      kind: a.jenis,
      quantity: a.jumlah,
      serials,
      price: a.harga,
    })
    return { id: item.id, sku, nama: item.name, seri: serials ?? [], gudang_id: wh.id }
  },
})

export const tambahFoto = layar({
  ringkasan:
    'Lampirkan satu foto lewat jalur "tempel URL" di dalam sasaran (penyimpanan media lokal biasanya tidak dikonfigurasi).',
  argumen: z
    .object({
      dalam: SasaranSchema,
      nama: z
        .string()
        .min(1)
        .default('foto')
        .describe('nama foto contoh (URL contoh dibuat dari nama)'),
      url: z.string().min(1).optional().describe('URL foto apa adanya; menggantikan nama'),
    })
    .strict(),
  urai: () => 'Lampirkan foto bukti',
  async jalankan(ctx, a) {
    await ctx.kit.addPhotoByUrl(
      ctx.page,
      cariLocator(ctx.page, a.dalam as Sasaran),
      a.url ?? ctx.kit.photoUrl(a.nama),
    )
    await ctx.wait(2500)
  },
})

export const pilihMekanik = layar({
  ringkasan: 'Pilih satu mekanik di multi-select "Mekanik" dalam dialog, dan pastikan tercatat.',
  argumen: z.object({ dalam: SasaranSchema, nama: z.string().default('/Made Mekanik/') }).strict(),
  urai: (a) => `Pilih mekanik ${String(a.nama).replaceAll('/', '')}`,
  async jalankan(ctx, a) {
    await ctx.kit.chooseMechanic(
      ctx.page,
      ctx.k,
      cariLocator(ctx.page, a.dalam as Sasaran),
      pola(a.nama),
    )
  },
})

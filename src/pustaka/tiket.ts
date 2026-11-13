// Aksi pustaka tiket, Order, dan pemeriksaan mekanik.
import { z } from 'zod'
import { PERSONA_IDS } from '../core/personas.ts'
import type { Body } from '../core/types.ts'
import { api, layar } from './types.ts'

const persona = z.enum(PERSONA_IDS)
const id = z.string().min(1)

export const tiket = api({
  ringkasan: 'Laporkan tiket kerusakan baru untuk satu unit (dengan satu foto lewat URL).',
  hasil: '{ id, nomor, status }',
  argumen: z
    .object({
      sebagai: persona.default('mbl.mcr'),
      unit: z.string().min(2),
      judul: z.string().min(3),
      deskripsi: z.string().min(3),
      lokasi: z.string().default('Workshop Site Alpha'),
    })
    .strict(),
  urai: () => 'Laporkan tiket (di belakang layar)',
  async jalankan(ctx, a) {
    const rc = await ctx.as(a.sebagai)
    const veh = await ctx.kit.findVehicle(rc, a.unit)
    const c = ctx.ok(
      await ctx.api.send(rc, 'POST', '/work-orders/complaints', {
        vehicle_id: veh.id,
        location_id: veh.location_id ?? veh.location?.id ?? null,
        title: a.judul,
        description: a.deskripsi,
        attributes: { location: a.lokasi },
        attachments: [{ name: 'rem.jpg', url: ctx.kit.photoUrl('rem') }],
      }),
      'buat tiket',
    )
    ctx.log(`Tiket ${c.complaint_number} status ${c.status}`)
    return { id: c.id, nomor: c.complaint_number, status: c.status }
  },
})

export const order = api({
  ringkasan: 'Baca Order lewat API.',
  hasil: '{ id, nomor }',
  argumen: z.object({ sebagai: persona.default('mbl.planner'), id }).strict(),
  urai: () => 'Baca Order',
  async jalankan(ctx, a) {
    const o = ctx.ok(
      await ctx.api.get(await ctx.as(a.sebagai), `/work-orders/order-list/${a.id}`),
      'order',
    )
    return { id: a.id, nomor: o.order_number }
  },
})

export const pemeriksaanOrder = api({
  ringkasan: 'Cari pemeriksaan (DGN) Order yang tidak dibatalkan, selain id tertentu bila diisi.',
  hasil: '{ id, nomor, status }',
  argumen: z
    .object({ sebagai: persona.default('mbl.planner'), order: id, selain: z.string().optional() })
    .strict(),
  urai: () => 'Cari pemeriksaan Order',
  async jalankan(ctx, a) {
    const o = ctx.ok(
      await ctx.api.get(await ctx.as(a.sebagai), `/work-orders/order-list/${a.order}`),
      'order',
    )
    const row = ((o.inspections ?? []) as Body[]).find(
      (x) => x.id !== a.selain && x.status !== 'CANCELLED',
    )
    if (!row) throw new Error('Pemeriksaan belum terbit di Order')
    return { id: row.id, nomor: row.inspection_number, status: row.status }
  },
})

export const isiPemeriksaan = layar({
  ringkasan:
    'Mekanik membuka pemeriksaan dari daftar, mulai inspeksi, mengisi odometer, perlu perbaikan, temuan, satu RPL jasa "Servis rem", menyimpan, lalu Submit.',
  argumen: z
    .object({
      nomor: z.string().min(3).describe('nomor DGN'),
      odometer: z.string().regex(/^\d+$/),
      temuan: z.string().min(3),
    })
    .strict(),
  urai: (a) => `Isi dan ajukan pemeriksaan ${a.nomor}`,
  async jalankan(ctx, a) {
    const { page: m, k } = ctx
    await ctx.open('/work-orders/mechanic-inspections')
    await ctx.wait(2500)
    await k.click(m, m.getByText(a.nomor).filter({ visible: true }).first(), 2500)
    await m
      .waitForURL(/mechanic-inspections\/[0-9a-f-]{36}|inspections\/[0-9a-f-]{36}/, {
        timeout: 15_000,
      })
      .catch(() => {})
    await ctx.wait(2500)
    const start = m.getByRole('button', { name: 'Mulai inspeksi' })
    await start
      .or(m.getByLabel(/^Odometer \(km\)/))
      .first()
      .waitFor({ timeout: 20_000 })
    if (await start.count()) {
      await k.click(m, start.first(), 2500)
      const sd = m.getByRole('dialog')
      if (await sd.count()) {
        await ctx.wait(2000)
        await k.click(m, sd.getByRole('button', { name: 'Konfirmasi' }), 2000)
      }
      await ctx.wait(3000)
    }
    await k.fill(
      m,
      m
        .getByLabel(/^Odometer \(km\)/)
        .filter({ visible: true })
        .first(),
      a.odometer,
    )
    const repair = m.locator('main button[value=REPAIR_REQUIRED]').filter({ visible: true }).first()
    for (let i = 0; i < 3 && (await repair.getAttribute('aria-pressed')) !== 'true'; i++) {
      await k.click(m, repair)
      await ctx.wait(800)
    }
    await k.fill(
      m,
      m
        .getByLabel(/^Temuan \/ catatan/)
        .filter({ visible: true })
        .first(),
      a.temuan,
    )
    await k.click(
      m,
      m.getByRole('button', { name: 'Tambah Item' }).filter({ visible: true }).first(),
    )
    await k.click(m, m.locator('main button[value=JASA]').filter({ visible: true }).last(), 1200)
    await k.fill(
      m,
      m
        .getByLabel(/^Nama item/)
        .filter({ visible: true })
        .last(),
      'Servis rem',
    )
    const qty = m.getByLabel(/^Qty/).filter({ visible: true }).last()
    if (await qty.count()) await k.fill(m, qty, '1')
    await ctx.shot(`isi-${a.nomor}`)
    await k.click(
      m,
      m
        .getByRole('button', { name: /^Simpan (Rekomendasi|Pemeriksaan)$/ })
        .filter({ visible: true })
        .first(),
    )
    await ctx.wait(2500)
    await k.click(
      m,
      m.getByRole('button', { name: 'Submit', exact: true }).filter({ visible: true }).first(),
    )
    const sub = m.getByRole('dialog')
    await sub.waitFor({ timeout: 10_000 }).catch(() => {})
    if (await sub.count()) {
      await ctx.wait(2500)
      await k.click(m, sub.getByRole('button').last(), 2500)
    }
    await ctx.wait(3500)
  },
})

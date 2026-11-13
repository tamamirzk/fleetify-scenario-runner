// Aksi pustaka Work Order: WO langsung dirilis, sesi kerja, dokumentasi, keputusan sesi.
import { z } from 'zod'
import { PERSONA_IDS } from '../core/personas.ts'
import type { StepCtx } from '../core/types.ts'
import { api, layar } from './types.ts'

const persona = z.enum(PERSONA_IDS)
const id = z.string().min(1)
const TAHAN = 4000

export const woDirilis = api({
  ringkasan:
    'Buat WO langsung (bengkel internal) dengan baris part, lalu rilis sehingga MR awal Disetujui.',
  hasil: '{ id, nomor }',
  dokumen: (h) => [{ tabel: 'work_orders', where: { id: (h as { id: string }).id } }],
  argumen: z
    .object({
      pembuat: persona.default('mbl.planner'),
      perilis: persona.default('mbl.supervisor'),
      unit: z.string().min(2).describe('nomor lambung atau pelat, mis. "DT-014"'),
      bengkel: z.string().min(2),
      gudang: id.describe('id gudang sumber'),
      baris: z
        .array(
          z
            .object({
              barang: z.object({ id, nama: z.string() }).passthrough(),
              jumlah: z.number().positive(),
            })
            .strict(),
        )
        .min(1),
    })
    .strict(),
  urai: () => 'Buat dan rilis WO (di belakang layar)',
  async jalankan(ctx, a) {
    const rc = await ctx.as(a.pembuat)
    const vehicle = await ctx.kit.findVehicle(rc, a.unit)
    const workshop = await ctx.kit.findWorkshop(rc, a.bengkel)
    const wo = ctx.ok(
      await ctx.api.send(rc, 'POST', '/work-orders/orders/direct', {
        vehicle_id: vehicle.id,
        workshop_location_id: workshop.id,
        service_mode: 'WORKSHOP',
        lines: a.baris.map((b) => ({
          item_kind: 'PART',
          part_id: b.barang.id,
          item_name: b.barang.nama,
          quantity: b.jumlah,
          unit_price_rupiah: '100000',
          warehouse_id: a.gudang,
        })),
      }),
      'WO langsung',
    )
    ctx.ok(
      await ctx.api.send(
        await ctx.as(a.perilis),
        'POST',
        `/work-orders/orders/${wo.id}/release-spk-gated`,
        {},
      ),
      'rilis WO',
    )
    const detail = ctx.ok(await ctx.api.get(rc, `/work-orders/orders/${wo.id}`), 'detail WO')
    ctx.log(`WO ${detail.wo_number} dirilis`)
    return { id: wo.id, nomor: detail.wo_number }
  },
})

export const bukaSesi = api({
  ringkasan: 'Buka sesi kerja di WO untuk satu mekanik lalu mulai pengerjaan.',
  argumen: z
    .object({
      sebagai: persona.default('mbl.foreman'),
      wo: id,
      nama: z.string().min(1).describe('nama sesi, mis. "Sesi 1"'),
      mekanik: persona.default('mbl.mechanic'),
    })
    .strict(),
  urai: (a) => `Buka ${a.nama} untuk mekanik (di belakang layar)`,
  async jalankan(ctx, a) {
    const rc = await ctx.as(a.sebagai)
    const base = `/work-orders/orders/${a.wo}/shifts`
    ctx.ok(
      await ctx.api.send(rc, 'POST', `${base}/start`, {
        shift_name: a.nama,
        mechanic_ids: [await ctx.lib.personaUserId(a.mekanik)],
      }),
      'shifts/start',
    )
    ctx.ok(await ctx.api.send(rc, 'POST', `${base}/start-work`, {}), 'start-work')
  },
})

const halamanWo = async (ctx: StepCtx, wo: string) => {
  await ctx.open(`/work-orders/wo/${wo}`)
  await ctx.wait(2500)
}

export const dokumentasiKerja = layar({
  ringkasan:
    'Mekanik membuka WO, menekan Mulai bila perlu, mengisi catatan pengerjaan item (dan satu foto), lalu mengirim dokumentasi.',
  hasil: '{ catatanAwal } isi catatan sebelum diubah (kosong bila belum ada)',
  argumen: z
    .object({
      wo: id,
      item: z.string().min(2).describe('nama barang di WO'),
      catatan: z.string().min(3),
      foto: z.string().optional().describe('nama foto contoh; tanpa ini tidak menambah foto'),
      catatanLamaWajib: z
        .boolean()
        .default(false)
        .describe('catat di hasil langkah bila catatan awal kosong'),
    })
    .strict(),
  urai: (a) => `Dokumentasikan ${a.item}${a.foto ? ' dengan foto' : ''} lalu kirim`,
  async jalankan(ctx, a) {
    const { page: m, k } = ctx
    await ctx.open(`/work-orders/wo/${a.wo}`)
    await m.getByText('Dokumentasi pengerjaan').first().waitFor({ timeout: 20_000 })
    const mulai = m.getByRole('button', { name: 'Mulai', exact: true })
    if (await mulai.count()) {
      await k.click(m, mulai.first(), TAHAN)
      const dlg = m.getByRole('dialog').filter({ hasText: `Mulai mengerjakan ${a.item}?` })
      await dlg.waitFor({ timeout: 10_000 })
      await ctx.wait(2500)
      await k.click(m, dlg.getByRole('button', { name: 'Mulai', exact: true }), 2500)
    }
    const form = m
      .getByText(`Dokumentasi · ${a.item}`, { exact: true })
      .locator('xpath=ancestor::div[contains(@class,"MuiStack-root")][1]')
    await form.waitFor({ timeout: 15_000 })
    await ctx.wait(2500)
    const note = form.getByRole('textbox', { name: /^Catatan pengerjaan/ })
    const awal = await note.inputValue()
    await k.fill(m, note, a.catatan, TAHAN)
    if (a.foto) {
      await ctx.kit.addPhotoByUrl(m, form, ctx.kit.photoUrl(a.foto))
      await ctx.wait(3000)
    }
    await k.click(
      m,
      m.getByRole('button', { name: /^(Selesai|Perbarui dokumentasi)$/ }).first(),
      TAHAN,
    )
    const kirim = m
      .getByRole('dialog')
      .filter({ hasText: /Kirim dokumentasi|Kirim ulang tanpa perubahan/ })
    await kirim.waitFor({ timeout: 10_000 })
    await ctx.wait(3000)
    await k.click(m, kirim.getByRole('button', { name: /^(Kirim|Kirim ulang)$/ }), 3000)
    await kirim.waitFor({ state: 'hidden', timeout: 20_000 })
    await ctx.wait(2500)
    if (a.catatanLamaWajib && !awal)
      ctx.note('Catatan kosong saat dibuka; dokumentasi lama tidak terbawa?')
    return { catatanAwal: awal }
  },
})

export const akhiriSesi = layar({
  ringkasan: 'Isi catatan serah terima, tekan Akhiri sesi, dan konfirmasi.',
  argumen: z.object({ wo: id, catatan: z.string().min(3) }).strict(),
  urai: () => 'Akhiri sesi dengan catatan serah terima',
  async jalankan(ctx, a) {
    const { page: f, k } = ctx
    await halamanWo(ctx, a.wo)
    const note = f
      .getByLabel('Catatan serah terima', { exact: true })
      .filter({ visible: true })
      .first()
    await k.fill(f, note, a.catatan, TAHAN)
    await k.click(
      f,
      f.getByRole('button', { name: /^(Akhiri sesi|Tutup sesi & verifikasi)$/ }).first(),
      TAHAN,
    )
    const dlg = f.getByRole('dialog').filter({ hasText: 'Akhiri sesi?' })
    await dlg.waitFor({ timeout: 10_000 })
    await ctx.wait(3000)
    await k.click(f, dlg.getByRole('button', { name: 'Akhiri sesi', exact: true }), 3000)
    await dlg.waitFor({ state: 'hidden', timeout: 20_000 })
    await ctx.wait(3000)
  },
})

export const putuskanSesi = layar({
  ringkasan: 'Isi catatan pemeriksaan sesi (dan foto), lalu Tolak sesi atau Setujui sesi.',
  argumen: z
    .object({
      wo: id,
      keputusan: z.enum(['tolak', 'setujui']),
      catatan: z.string().min(3),
      foto: z.string().optional(),
    })
    .strict(),
  urai: (a) =>
    a.keputusan === 'tolak' ? 'Tolak sesi dengan catatan' : 'Setujui sesi dengan catatan',
  async jalankan(ctx, a) {
    const { page: f, k } = ctx
    await halamanWo(ctx, a.wo)
    const review = f
      .getByLabel(/^Catatan pemeriksaan/)
      .filter({ visible: true })
      .first()
    await review.scrollIntoViewIfNeeded()
    await k.fill(f, review, a.catatan, TAHAN)
    if (a.foto) {
      await ctx.kit.addPhotoByUrl(
        f,
        review.locator('xpath=ancestor::div[contains(@class,"MuiStack-root")][1]'),
        ctx.kit.photoUrl(a.foto),
      )
      await ctx.wait(3000)
    }
    const tolak = a.keputusan === 'tolak'
    await k.click(
      f,
      f.getByRole('button', { name: tolak ? 'Tolak sesi' : 'Setujui sesi' }).first(),
      TAHAN,
    )
    const dlg = f.getByRole('dialog')
    await dlg.waitFor({ timeout: 10_000 })
    await ctx.wait(3000)
    await k.click(
      f,
      dlg.getByRole('button', { name: tolak ? 'Tolak' : 'Setujui', exact: true }),
      3000,
    )
    await dlg.waitFor({ state: 'hidden', timeout: 20_000 })
    await ctx.wait(3500)
  },
})

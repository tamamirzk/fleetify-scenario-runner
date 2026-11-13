// Aksi pustaka Material Request: MR mandiri, approval, serah terima, pinjaman alat, retur.
import { z } from 'zod'
import { PERSONA_IDS } from '../core/personas.ts'
import type { BaseCtx, Body } from '../core/types.ts'
import { api } from './types.ts'

const persona = z.enum(PERSONA_IDS)
const id = z.string().min(1)
const mrUrl = (mr: string) => `/inventory/material-requests/${mr}`

export const mrMandiri = api({
  ringkasan: 'Buat MR mandiri (draf) di satu gudang dengan baris barang ber-part.',
  hasil: '{ id, nomor, gudang_id, baris: string[] } (id baris MR, urut sama dengan argumen baris)',
  dokumen: (h) => [{ tabel: 'material_requests', where: { id: (h as { id: string }).id } }],
  argumen: z
    .object({
      sebagai: persona.default('mbl.storekeeper'),
      gudang: z.string().min(1),
      keterangan: z.string().min(3),
      baris: z
        .array(
          z
            .object({
              barang: z.object({ id, nama: z.string() }).passthrough(),
              jenis: z.enum(['SPAREPART', 'CONSUMABLE', 'TOOL']).default('SPAREPART'),
              jumlah: z.number().positive(),
            })
            .strict(),
        )
        .min(1),
    })
    .strict(),
  urai: () => 'Buat MR mandiri (draf)',
  async jalankan(ctx, a) {
    const rc = await ctx.as(a.sebagai)
    const wh = await ctx.kit.findWarehouse(rc, a.gudang)
    const mr = ctx.ok(
      await ctx.api.send(rc, 'POST', '/inventory/material-requests', {
        warehouse_id: wh.id,
        description: a.keterangan,
        lines: a.baris.map((b) => ({
          part_id: b.barang.id,
          item_kind: b.jenis,
          description: b.barang.nama,
          quantity: b.jumlah,
        })),
      }),
      'buat MR',
    )
    ctx.log(`MR ${mr.mr_number} dibuat (draf)`)
    const baris = a.baris.map((b) => {
      const line = mr.lines.find((l: Body) => l.part_id === b.barang.id)
      if (!line) throw new Error(`Baris MR untuk ${b.barang.nama} tidak ditemukan`)
      return line.id as string
    })
    return { id: mr.id, nomor: mr.mr_number, gudang_id: wh.id, baris }
  },
})

export const ajukanMr = api({
  ringkasan: 'Ajukan MR bila masih draf.',
  argumen: z.object({ sebagai: persona.default('mbl.storekeeper'), mr: id }).strict(),
  urai: () => 'Ajukan MR (di belakang layar)',
  async jalankan(ctx, a) {
    const rc = await ctx.as(a.sebagai)
    const cur = ctx.ok(await ctx.api.get(rc, mrUrl(a.mr)), 'detail MR')
    if (cur.status === 'DRAFT')
      ctx.ok(await ctx.api.send(rc, 'POST', `${mrUrl(a.mr)}/submit`), 'ajukan MR')
  },
})

export const setujuiSemua = api({
  ringkasan:
    'Setujui request approval sebuah dokumen tahap demi tahap oleh persona yang dicoba berurutan, sampai tidak menunggu lagi; gagal bila hasil akhirnya bukan Disetujui.',
  argumen: z
    .object({
      dokumen: z.string().regex(/^[A-Z_]+$/, 'document_type, mis. MATERIAL_REQUEST'),
      id,
      persetuju: z.array(persona).min(1),
      pembaca: persona.default('mbl.storekeeper'),
    })
    .strict(),
  urai: (a) => `Approver menyetujui ${a.dokumen} (di belakang layar)`,
  async jalankan(ctx, a) {
    const rc = await ctx.as(a.pembaca)
    const url = `/approval/requests/for-document?document_type=${a.dokumen}&document_id=${a.id}`
    for (let putaran = 0; putaran < a.persetuju.length * 2; putaran++) {
      const req = (await ctx.api.get(rc, url)).body?.data
      if (req?.status !== 'PENDING') break
      let maju = false
      for (const who of a.persetuju) {
        const r = await ctx.api.send(
          await ctx.as(who),
          'POST',
          `/approval/requests/${req.id}/act`,
          {
            decision: 'APPROVE',
            note: 'Uji skenario',
          },
        )
        if (r.status < 300) {
          maju = true
          break
        }
      }
      if (!maju) break
    }
    const akhir = (await ctx.api.get(rc, url)).body?.data
    if (akhir && akhir.status !== 'APPROVED')
      throw new Error(`Approval ${a.dokumen} belum Disetujui (status ${akhir.status})`)
  },
})

export const serahAlat = api({
  ringkasan:
    'Serahkan baris alat MR ke satu penerima (dicari dari daftar penerima MR) beserta nomor serinya.',
  argumen: z
    .object({
      sebagai: persona.default('mbl.storekeeper'),
      mr: id,
      gudang: id.describe('id gudang'),
      penerima: z.string().min(2).describe('potongan nama penerima, mis. "Made"'),
      baris: z
        .array(
          z
            .object({ baris: id, jumlah: z.number().positive(), seri: z.array(z.string()) })
            .strict(),
        )
        .min(1),
    })
    .strict(),
  urai: (a) => `Serahkan alat ke ${a.penerima} (di belakang layar)`,
  async jalankan(ctx, a) {
    const rc = await ctx.as(a.sebagai)
    const penerima = ctx.lib
      .rows((await ctx.api.get(rc, `${mrUrl(a.mr)}/recipients?search=`)).body)
      .find((x) => (x.name ?? x.label ?? '').toLowerCase().includes(a.penerima.toLowerCase()))
    if (!penerima) throw new Error(`Penerima ${a.penerima} tidak ada`)
    ctx.ok(
      await ctx.api.send(rc, 'POST', `${mrUrl(a.mr)}/issue`, {
        warehouse_id: a.gudang,
        note: 'Serah terima uji skenario',
        receiver: { id: penerima.id, kind: penerima.kind },
        lines: a.baris.map((b) => ({ line_id: b.baris, issue_quantity: b.jumlah })),
        tracking_selections: a.baris.map((b) => ({
          line_id: b.baris,
          entries: b.seri.map((code) => ({ code, quantity: 1 })),
        })),
        idempotency_key: `skenario-${a.mr}-${penerima.id}`,
      }),
      'serah terima',
    )
  },
})

async function mrDetail(ctx: BaseCtx, sebagai: (typeof PERSONA_IDS)[number], mr: string) {
  return ctx.ok(await ctx.api.get(await ctx.as(sebagai), mrUrl(mr)), 'detail MR')
}

export const kembalikanAlat = api({
  ringkasan: 'Terima kembali alat dari pinjaman terbuka pertama di satu baris MR.',
  argumen: z
    .object({
      sebagai: persona.default('mbl.storekeeper'),
      mr: id,
      gudang: id,
      baris: id,
      seri: z.string().min(1),
      jumlah: z.number().positive().default(1),
    })
    .strict(),
  urai: (a) => `Alat ${a.seri} kembali (di belakang layar)`,
  async jalankan(ctx, a) {
    const mr = await mrDetail(ctx, a.sebagai, a.mr)
    const loan = mr.lines
      .find((l: Body) => l.id === a.baris)
      ?.tool_loans.find((x: Body) => Number(x.outstanding_quantity) > 0)
    if (!loan) throw new Error('Pinjaman terbuka tidak ada')
    ctx.ok(
      await ctx.api.send(await ctx.as(a.sebagai), 'POST', `${mrUrl(a.mr)}/return-tool`, {
        line_id: a.baris,
        warehouse_id: a.gudang,
        loan_id: loan.id,
        quantity: a.jumlah,
        tracking_selections: [{ code: a.seri, quantity: a.jumlah }],
        idempotency_key: `skenario-kembali-${loan.id}-${loan.returned_quantity}`,
      }),
      'kembalikan alat',
    )
  },
})

export const periksaPinjaman = api({
  ringkasan:
    'Periksa pinjaman pertama di satu baris MR lewat API: jumlah kembali dan tidak kembali harus sama dengan yang diharapkan.',
  argumen: z
    .object({
      sebagai: persona.default('mbl.storekeeper'),
      mr: id,
      baris: id,
      kembali: z.number().min(0),
      tidakKembali: z.number().min(0),
    })
    .strict(),
  urai: (a) => `Periksa pinjaman: kembali ${a.kembali}, tidak kembali ${a.tidakKembali}`,
  async jalankan(ctx, a) {
    const mr = await mrDetail(ctx, a.sebagai, a.mr)
    for (const l of mr.lines)
      for (const loan of l.tool_loans ?? [])
        ctx.log(
          `  ${l.description} · ${loan.borrower_name}: pinjam ${loan.quantity}, kembali ${loan.returned_quantity}, tidak kembali ${loan.written_off_quantity ?? 0}`,
        )
    const loan = mr.lines.find((l: Body) => l.id === a.baris)?.tool_loans?.[0]
    const kembali = Number(loan?.returned_quantity ?? 0)
    const tidak = Number(loan?.written_off_quantity ?? 0)
    if (kembali !== a.kembali || tidak !== a.tidakKembali)
      throw new Error(
        `Pinjaman: kembali ${kembali}, tidak kembali ${tidak}; seharusnya ${a.kembali} dan ${a.tidakKembali}`,
      )
  },
})

export const mrDisetujuiWo = api({
  ringkasan: 'Cari MR berstatus Disetujui milik sebuah WO.',
  hasil: '{ id, nomor }',
  dokumen: (h) => [{ tabel: 'material_requests', where: { id: (h as { id: string }).id } }],
  argumen: z.object({ sebagai: persona.default('mbl.storekeeper'), wo: id }).strict(),
  urai: () => 'Cari MR Disetujui milik WO',
  async jalankan(ctx, a) {
    const mr = ctx.lib
      .rows(
        ctx.ok(
          await ctx.api.get(
            await ctx.as(a.sebagai),
            `/inventory/material-requests?work_order_id=${a.wo}`,
          ),
          'daftar MR',
        ),
      )
      .find((r) => r.status === 'APPROVED')
    if (!mr) throw new Error('MR Disetujui untuk WO ini tidak ada')
    return { id: mr.id, nomor: mr.mr_number }
  },
})

export const serahMrWo = api({
  ringkasan:
    'Keluarkan seluruh MR Disetujui milik WO ke seorang persona (dengan foto bukti lewat URL).',
  hasil: '{ id, nomor } MR yang dikeluarkan',
  dokumen: (h) => [{ tabel: 'material_requests', where: { id: (h as { id: string }).id } }],
  argumen: z
    .object({
      sebagai: persona.default('mbl.storekeeper'),
      wo: id,
      gudang: id,
      penerima: persona,
    })
    .strict(),
  urai: () => 'Serahkan material WO (di belakang layar)',
  async jalankan(ctx, a) {
    const rc = await ctx.as(a.sebagai)
    const mr = (await mrDisetujuiWo.jalankan(ctx, { sebagai: a.sebagai, wo: a.wo })) as Body
    ctx.ok(
      await ctx.api.send(rc, 'POST', `${mrUrl(mr.id)}/issue`, {
        warehouse_id: a.gudang,
        note: 'Uji skenario: serah material',
        receiver: { id: await ctx.lib.personaUserId(a.penerima), kind: 'USER' },
        attachments: [{ name: 'bukti.png', url: ctx.kit.photoUrl('serah') }],
      }),
      'serah material',
    )
    return mr
  },
})

export const returWo = api({
  ringkasan:
    'Cari permintaan retur material milik sebuah WO (yang belum selesai diterima bila ada).',
  hasil: '{ id }',
  dokumen: (h) => [
    { tabel: 'work_order_material_return_requests', where: { id: (h as { id: string }).id } },
  ],
  argumen: z
    .object({ sebagai: persona.default('mbl.storekeeper'), nomorWo: z.string().min(3) })
    .strict(),
  urai: () => 'Cari retur milik WO',
  async jalankan(ctx, a) {
    const list = ctx.ok(
      await ctx.api.get(
        await ctx.as(a.sebagai),
        '/inventory/return-material-requests?page_size=50',
      ),
      'daftar retur',
    )
    const rows = ctx.lib.rows(list).filter((r) => JSON.stringify(r).includes(a.nomorWo))
    const target =
      rows.find((r) => ['APPROVED', 'PARTIALLY_RECEIVED'].includes(r.status)) ?? rows[0]
    if (!target) throw new Error('Retur untuk WO ini tidak ditemukan')
    return { id: target.id }
  },
})

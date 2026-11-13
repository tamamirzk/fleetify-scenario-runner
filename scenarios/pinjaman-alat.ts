// Pinjaman alat per peminjam: MR mandiri dua alat, diserahkan ke Made, kembali sebagian
// (nomor seri), kembali dengan nomor seri, lalu sisa dicatat tidak kembali.
import type { BaseCtx, Doc, Page, PersonaId } from '../src/core/types.ts'
import { defineScenario } from '../src/core/types.ts'

const APPROVERS: PersonaId[] = [
  'mbl.foreman',
  'mbl.supervisor',
  'mbl.superintendent',
  'mbl.plant-superintendent',
  'mbl.planner',
]
const STORE = 'mbl.storekeeper'
const WAREHOUSE = 'Gudang Site Alpha'

interface Data {
  docs: Doc[]
  mr_id: string
  mr_number: string
  wh_id: string
  wrench_serials: [string, string]
  scanner_serial: string
  wrench_line: string
  scanner_line: string
}

const mrUrl = (d: Data) => `/inventory/material-requests/${d.mr_id}`

// ── Langkah lewat API (dipakai langkah sendiri dan reach) ───────────────────
async function submit(ctx: BaseCtx, d: Data) {
  const rc = await ctx.as(STORE)
  const cur = ctx.ok(await ctx.api.get(rc, mrUrl(d)), 'detail MR')
  if (cur.status === 'DRAFT')
    ctx.ok(await ctx.api.send(rc, 'POST', `${mrUrl(d)}/submit`), 'ajukan MR')
}

async function approveAll(ctx: BaseCtx, d: Data) {
  const rc = await ctx.as(STORE)
  const url = `/approval/requests/for-document?document_type=MATERIAL_REQUEST&document_id=${d.mr_id}`
  for (const who of APPROVERS) {
    const req = (await ctx.api.get(rc, url)).body?.data
    if (req?.status !== 'PENDING') break
    const ap = await ctx.as(who)
    await ctx.api.send(ap, 'POST', `/approval/requests/${req.id}/act`, {
      decision: 'APPROVE',
      note: 'Uji skenario',
    })
  }
  const status = (await ctx.api.get(rc, mrUrl(d))).body?.status
  if (status !== 'APPROVED') throw new Error(`MR belum Disetujui (status ${status})`)
}

async function issueToMade(ctx: BaseCtx, d: Data) {
  const rc = await ctx.as(STORE)
  const made = ctx.lib
    .rows((await ctx.api.get(rc, `${mrUrl(d)}/recipients?search=`)).body)
    .find((x) => (x.name ?? x.label ?? '').toLowerCase().includes('made'))
  if (!made) throw new Error('Penerima Made tidak ada')
  ctx.ok(
    await ctx.api.send(rc, 'POST', `${mrUrl(d)}/issue`, {
      warehouse_id: d.wh_id,
      note: 'Serah terima uji skenario',
      receiver: { id: made.id, kind: made.kind },
      lines: [
        { line_id: d.wrench_line, issue_quantity: 2 },
        { line_id: d.scanner_line, issue_quantity: 1 },
      ],
      tracking_selections: [
        {
          line_id: d.wrench_line,
          entries: d.wrench_serials.map((code) => ({ code, quantity: 1 })),
        },
        { line_id: d.scanner_line, entries: [{ code: d.scanner_serial, quantity: 1 }] },
      ],
      idempotency_key: `skenario-${d.mr_id}-${made.id}`,
    }),
    'serah terima',
  )
}

async function returnTool(ctx: BaseCtx, d: Data, line: string, code: string, quantity: number) {
  const rc = await ctx.as(STORE)
  const mr = ctx.ok(await ctx.api.get(rc, mrUrl(d)), 'detail MR')
  const loan = mr.lines
    .find((l: { id: string }) => l.id === line)
    ?.tool_loans.find((x: { outstanding_quantity: string }) => Number(x.outstanding_quantity) > 0)
  if (!loan) throw new Error('Pinjaman terbuka tidak ada')
  ctx.ok(
    await ctx.api.send(rc, 'POST', `${mrUrl(d)}/return-tool`, {
      line_id: line,
      warehouse_id: d.wh_id,
      loan_id: loan.id,
      quantity,
      tracking_selections: [{ code, quantity }],
      idempotency_key: `skenario-kembali-${loan.id}-${loan.returned_quantity}`,
    }),
    'kembalikan alat',
  )
}

// Baris pinjaman di halaman MR.
const loanRow = (page: Page, dipinjam: number) =>
  page
    .locator('div, li, tr')
    .filter({ hasText: /Peminjam: Made/ })
    .filter({ hasText: new RegExp(`dipinjam ${dipinjam}`) })
    .last()

export default defineScenario<Data>({
  meta: {
    id: 'pinjaman-alat',
    title: 'Pinjaman alat per peminjam',
    group: 'material',
    tickets: ['FMS-63'],
    estimasi: '4 menit',
    tujuan:
      'Membuktikan alat yang dipinjamkan lewat MR mandiri tercatat per peminjam: bisa kembali sebagian (nomor seri), kembali dengan nomor seri, dan sisanya dicatat tidak kembali dengan alasan.',
    personas: [
      {
        who: STORE,
        peran: 'membuat dan mengajukan MR, menerima alat kembali, mencatat yang tidak kembali',
      },
      { who: 'mbl.foreman', peran: 'approver MR (lewat API, tanpa jendela)' },
      { who: 'mbl.mechanic', peran: 'peminjam alat (penerima serah terima)' },
    ],
    data: [
      `Dua barang alat baru tiap jalan dengan saldo awal di ${WAREHOUSE}: "Uji SR Torque Wrench <stempel>" (TOOL, 2 nomor seri) dan "Uji SR Scanner <stempel>" (TOOL, 1 nomor seri)`,
      'MR mandiri draf: 2 Torque Wrench dan 1 Scanner',
    ],
    setelan: [],
    prasyarat: [
      'Penjaga Gudang boleh membuat barang dan memasang saldo awal (inventory:items:create, post_opening_balance)',
    ],
    catatan: [
      'Semua baris diserahkan sekaligus ke Made (serah terima bertahap ke beberapa peminjam belum dicakup skenario ini).',
      'Approval MR dan serah terima dilakukan lewat API (di belakang layar).',
      'Torque Wrench memakai nomor seri, bukan batch: aplikasi menolak pelacakan Batch untuk barang baru. Pengembalian sebagian tetap terlihat (1 dari 2 seri).',
    ],
  },

  async setup(ctx) {
    const rc = await ctx.as(STORE)
    const wh = await ctx.kit.findWarehouse(rc, WAREHOUSE)
    // Barang baru tiap jalan, jadi skenario bisa diulang tanpa batas.
    const tag = ctx.kit.stamp()
    const wrenchSerials: [string, string] = [`SR-TRQ-${tag}-1`, `SR-TRQ-${tag}-2`]
    const scannerSerial = `SR-SCN-${tag}-1`
    const wrench = await ctx.kit.newItem(ctx, rc, wh.id, {
      kind: 'TOOL',
      sku: `SR-TRQ-${tag}`,
      name: `Uji SR Torque Wrench ${tag}`,
      serials: wrenchSerials,
    })
    const scanner = await ctx.kit.newItem(ctx, rc, wh.id, {
      kind: 'TOOL',
      sku: `SR-SCN-${tag}`,
      name: `Uji SR Scanner ${tag}`,
      serials: [scannerSerial],
    })
    const mr = ctx.ok(
      await ctx.api.send(rc, 'POST', '/inventory/material-requests', {
        warehouse_id: wh.id,
        description: 'Uji skenario: pinjaman alat per peminjam',
        lines: [
          { part_id: wrench.id, item_kind: 'TOOL', description: wrench.name, quantity: 2 },
          { part_id: scanner.id, item_kind: 'TOOL', description: scanner.name, quantity: 1 },
        ],
      }),
      'buat MR',
    )
    ctx.log(`MR ${mr.mr_number} dibuat (draf)`)
    const lineOf = (partId: string): string => {
      const line = mr.lines.find((l: { part_id: string }) => l.part_id === partId)
      if (!line) throw new Error('Baris MR tidak ditemukan')
      return line.id
    }
    return {
      mr_id: mr.id,
      mr_number: mr.mr_number,
      wh_id: wh.id,
      wrench_serials: wrenchSerials,
      scanner_serial: scannerSerial,
      wrench_line: lineOf(wrench.id),
      scanner_line: lineOf(scanner.id),
      docs: [
        {
          label: 'Barang Torque Wrench (2 seri)',
          nomor: wrench.sku,
          url: `/inventory/items/${wrench.id}`,
        },
        {
          label: 'Barang Scanner (1 seri)',
          nomor: scanner.sku,
          url: `/inventory/items/${scanner.id}`,
        },
        {
          label: 'Material Request (draf)',
          nomor: mr.mr_number,
          url: `/inventory/material-requests/${mr.id}`,
        },
      ],
    }
  },

  steps: [
    {
      id: 'buka',
      who: STORE,
      title: 'Wati membuka MR mandiri yang baru dibuat',
      expect: 'MR berstatus Draf berisi 2 Torque Wrench dan 1 Scanner',
      run: async (ctx, d) => {
        await ctx.open(mrUrl(d))
        await ctx.say(
          `Wati membuka ${d.mr_number}: MR mandiri berisi 2 Torque Wrench dan 1 Scanner (draf dibuat di belakang layar)`,
          3500,
        )
      },
    },
    {
      id: 'ajukan',
      who: STORE,
      title: 'Wati mengajukan MR mandiri',
      expect:
        'Status berubah menjadi Menunggu persetujuan (atau langsung Disetujui bila tanpa pemetaan)',
      reach: async () => {},
      run: async (ctx, d) => {
        await ctx.open(mrUrl(d))
        await ctx.say('Wati mengajukan MR mandiri', 2200)
        await ctx.k.click(
          ctx.page,
          ctx.page.getByRole('button', { name: 'Ajukan', exact: true }),
          1500,
        )
        await ctx.wait(2000)
      },
    },
    {
      id: 'approval',
      who: STORE,
      title: 'Approver menyetujui MR (di belakang layar)',
      expect: 'MR Disetujui',
      reach: (ctx, d) => submit(ctx, d),
      run: async (ctx, d) => {
        await ctx.open(mrUrl(d))
        await ctx.say('MR menunggu approval; approver menyetujui (di belakang layar)', 2500)
        await approveAll(ctx, d)
        await ctx.open(mrUrl(d))
        await ctx.say('MR Disetujui', 2500)
      },
    },
    {
      id: 'serah',
      who: STORE,
      title: 'Alat diserahkan ke Made (di belakang layar)',
      expect: 'Baris "Peminjam: Made" tampil: Torque Wrench dipinjam 2, Scanner dipinjam 1',
      reach: async (ctx, d) => {
        await submit(ctx, d)
        await approveAll(ctx, d)
      },
      run: async (ctx, d) => {
        await issueToMade(ctx, d)
        await ctx.open(mrUrl(d))
        await ctx.say(
          'Diserahkan ke Made: 2 Torque Wrench dan 1 Scanner (di belakang layar). Perhatikan baris "Peminjam"',
          1200,
        )
        await ctx.k.click(ctx.page, loanRow(ctx.page, 2), 2500).catch(() => {})
      },
    },
    {
      id: 'kembali-sebagian',
      who: STORE,
      title: 'Made mengembalikan 1 dari 2 Torque Wrench (nomor seri)',
      expect: 'Pinjaman Made: dipinjam 2 · kembali 1 · sisa 1',
      reach: async (ctx, d) => {
        await submit(ctx, d)
        await approveAll(ctx, d)
        await issueToMade(ctx, d)
      },
      run: async (ctx, d) => {
        const { page, k } = ctx
        await ctx.open(mrUrl(d))
        await ctx.say('Made mengembalikan 1 dari 2 Torque Wrench (nomor seri)', 2200)
        await k.click(page, loanRow(page, 2).getByRole('button', { name: 'Kembalikan alat' }), 1500)
        const dlg = page.getByRole('dialog')
        await k.fill(page, dlg.getByLabel('Jumlah diterima'), '1', 1200)
        await k.fill(
          page,
          dlg.getByLabel('Nomor seri / batch yang dikembalikan'),
          d.wrench_serials[0],
          1200,
        )
        await k.click(page, dlg.getByRole('button', { name: 'Terima ke stok' }), 1500)
        await dlg.waitFor({ state: 'hidden' })
        await ctx.say('Pinjaman Made: dipinjam 2 · kembali 1 · sisa 1', 3000)
      },
    },
    {
      id: 'kembali-serial',
      who: STORE,
      title: 'Made mengembalikan Scanner (nomor seri)',
      expect: 'Pinjaman Scanner: kembali 1, sisa 0',
      reach: async (ctx, d) => {
        await submit(ctx, d)
        await approveAll(ctx, d)
        await issueToMade(ctx, d)
        await returnTool(ctx, d, d.wrench_line, d.wrench_serials[0], 1)
      },
      run: async (ctx, d) => {
        const { page, k } = ctx
        await ctx.open(mrUrl(d))
        await ctx.say('Made mengembalikan Scanner (nomor seri)', 2200)
        await k.click(page, loanRow(page, 1).getByRole('button', { name: 'Kembalikan alat' }), 1500)
        const dlg = page.getByRole('dialog')
        await k.fill(
          page,
          dlg.getByLabel('Nomor seri / batch yang dikembalikan'),
          d.scanner_serial,
          1200,
        )
        await k.click(page, dlg.getByRole('button', { name: 'Terima ke stok' }), 1500)
        await dlg.waitFor({ state: 'hidden' })
        await ctx.wait(1500)
      },
    },
    {
      id: 'catat-tidak-kembali',
      who: STORE,
      title: 'Sisa 1 Torque Wrench dicatat tidak kembali dengan alasan',
      expect: 'Torque Wrench: kembali 1, tidak kembali 1 · Scanner: kembali 1',
      reach: async (ctx, d) => {
        await submit(ctx, d)
        await approveAll(ctx, d)
        await issueToMade(ctx, d)
        await returnTool(ctx, d, d.wrench_line, d.wrench_serials[0], 1)
        await returnTool(ctx, d, d.scanner_line, d.scanner_serial, 1)
      },
      run: async (ctx, d) => {
        const { page, k } = ctx
        await ctx.open(mrUrl(d))
        await ctx.say('Sisa 1 Torque Wrench Made tidak kembali: dicatat manual dengan alasan', 2200)
        await k.click(
          page,
          loanRow(page, 2).getByRole('button', { name: 'Catat tidak kembali' }),
          1500,
        )
        const dlg = page.getByRole('dialog')
        await k.fill(
          page,
          dlg.getByLabel('Alasan alat tidak kembali'),
          'Hilang di site saat pengerjaan malam',
          1200,
        )
        await k.click(page, dlg.getByRole('button', { name: 'Catat tidak kembali' }), 1500)
        await dlg.waitFor({ state: 'hidden' })
        await ctx.say(
          'Selesai · Torque Wrench: kembali 1, tidak kembali 1 · Scanner: kembali 1',
          4000,
        )
        const final = ctx.ok(await ctx.api.get(page, mrUrl(d)), 'MR akhir')
        for (const l of final.lines)
          for (const loan of l.tool_loans ?? [])
            ctx.log(
              `  ${l.description} · ${loan.borrower_name}: pinjam ${loan.quantity}, kembali ${loan.returned_quantity}, tidak kembali ${loan.written_off_quantity ?? 0}`,
            )
        const wrench = final.lines.find((l: { id: string }) => l.id === d.wrench_line)
          ?.tool_loans[0]
        if (Number(wrench?.written_off_quantity) !== 1)
          throw new Error(
            `Torque Wrench tidak kembali = ${wrench?.written_off_quantity}, seharusnya 1`,
          )
      },
    },
  ],
})

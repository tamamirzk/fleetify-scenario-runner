// Penyesuaian WO (FMS-71) lalu retur material sampai diterima gudang (FMS-61/62).
import type { BaseCtx, Doc } from '../src/core/types.ts'
import { type ApiTarget, defineScenario } from '../src/core/types.ts'

const UNIT = 'DT-014'
const WORKSHOP = 'Workshop Site Alpha'
const WAREHOUSE = 'WH-ALPHA'
const HOLD = 3000

interface Part {
  id: string
  name: string
}

interface Data {
  docs: Doc[]
  wo_id: string
  wo_number: string
  wh_id: string
  kampas: Part
  bearing: Part
  pengganti_sku: string
  adj_number?: string
  adj_id?: string
}

async function approvedMr(ctx: BaseCtx, rc: ApiTarget, d: Data) {
  const mr = ctx.lib
    .rows(
      ctx.ok(
        await ctx.api.get(rc, `/inventory/material-requests?work_order_id=${d.wo_id}`),
        'daftar MR',
      ),
    )
    .find((r) => r.status === 'APPROVED')
  if (!mr) throw new Error('MR Disetujui untuk WO ini tidak ada')
  return mr
}

export default defineScenario<Data>({
  meta: {
    id: 'penyesuaian-wo',
    title: 'Penyesuaian WO dan retur material',
    group: 'wo',
    tickets: ['FMS-71', 'FMS-61', 'FMS-62'],
    estimasi: '8 menit',
    tujuan:
      'Membuktikan penyesuaian WO berjalan (kurangi jumlah, ganti part) lewat approval, WO menampilkan bagian Penyesuaian dan peringatan "Harus kembali ke gudang", lalu peringatan hilang setelah retur diterima gudang.',
    personas: [
      { who: 'mbl.planner', peran: 'membuka WO dan mengajukan penyesuaian' },
      { who: 'mbl.storekeeper', peran: 'menyerahkan material dan menerima retur' },
      { who: 'mbl.plant-superintendent', peran: 'menyetujui penyesuaian' },
      { who: 'mbl.foreman', peran: 'melihat WO dan mengajukan retur' },
      { who: 'mbl.supervisor', peran: 'merilis WO (lewat API, tanpa jendela)' },
    ],
    data: [
      `Tiga barang part baru tiap jalan dengan saldo awal 10 di ${WAREHOUSE}: "Uji SR Kampas Rem <stempel>", "Uji SR Bearing Roda <stempel>", dan part pengganti "Uji SR Bearing Pengganti <stempel>"`,
      `WO langsung untuk ${UNIT} di ${WORKSHOP}: Kampas ×5 dan Bearing ×4, dirilis sehingga MR awal Disetujui`,
    ],
    setelan: [],
    prasyarat: ['Penjaga Gudang boleh membuat barang dan memasang saldo awal'],
    catatan: [
      'Foto bukti penerimaan retur memakai jalur tempel URL karena penyimpanan media lokal biasanya tidak dikonfigurasi.',
    ],
  },

  async setup(ctx) {
    const store = await ctx.as('mbl.storekeeper')
    const planner = await ctx.as('mbl.planner')
    const wh = await ctx.kit.findWarehouse(store, WAREHOUSE)
    const vehicle = await ctx.kit.findVehicle(planner, UNIT)
    const workshop = await ctx.kit.findWorkshop(planner, WORKSHOP)
    const tag = ctx.kit.stamp()
    const mk = (code: string, name: string) =>
      ctx.kit.newItem(ctx, store, wh.id, {
        sku: `SR-${code}-${tag}`,
        name: `Uji SR ${name} ${tag}`,
        quantity: 10,
      })
    const kampas = await mk('KPS', 'Kampas Rem')
    const bearing = await mk('BRG', 'Bearing Roda')
    const pengganti = await mk('BRP', 'Bearing Pengganti')
    const wo = ctx.ok(
      await ctx.api.send(planner, 'POST', '/work-orders/orders/direct', {
        vehicle_id: vehicle.id,
        workshop_location_id: workshop.id,
        service_mode: 'WORKSHOP',
        lines: [
          [kampas, 5],
          [bearing, 4],
        ].map(([p, quantity]) => ({
          item_kind: 'PART',
          part_id: p.id,
          item_name: p.name,
          quantity,
          unit_price_rupiah: '100000',
          warehouse_id: wh.id,
        })),
      }),
      'WO langsung',
    )
    ctx.ok(
      await ctx.api.send(
        await ctx.as('mbl.supervisor'),
        'POST',
        `/work-orders/orders/${wo.id}/release-spk-gated`,
        {},
      ),
      'rilis WO',
    )
    const detail = ctx.ok(await ctx.api.get(planner, `/work-orders/orders/${wo.id}`), 'detail WO')
    ctx.log(`WO ${detail.wo_number} dirilis`)
    return {
      wo_id: wo.id,
      wo_number: detail.wo_number,
      wh_id: wh.id,
      kampas: { id: kampas.id, name: kampas.name },
      bearing: { id: bearing.id, name: bearing.name },
      pengganti_sku: pengganti.sku,
      docs: [
        { label: 'Work Order (dirilis)', nomor: detail.wo_number, url: `/work-orders/wo/${wo.id}` },
        { label: 'Part pengganti', nomor: pengganti.sku, url: `/inventory/items/${pengganti.id}` },
      ],
    }
  },

  steps: [
    {
      id: 'buka-wo',
      who: 'mbl.planner',
      title: 'Putri membuka WO yang disiapkan di belakang layar',
      expect: 'WO berisi Kampas Rem ×5 dan Bearing Roda ×4',
      run: async (ctx, d) => {
        await ctx.open(`/work-orders/wo/${d.wo_id}`)
        await ctx.say(
          `Putri membuka ${d.wo_number}: ${d.kampas.name} ×5 dan ${d.bearing.name} ×4 (WO disiapkan di belakang layar)`,
          4000,
        )
      },
    },
    {
      id: 'serah-material',
      who: 'mbl.storekeeper',
      title: 'Wati mengeluarkan material dari stok untuk Fajar',
      expect: 'MR berstatus Dikeluarkan',
      reach: async () => {},
      run: async (ctx, d) => {
        const { page: w, k } = ctx
        const mr = await approvedMr(ctx, w, d)
        await ctx.open(`/inventory/material-requests/${mr.id}`)
        await ctx.say(
          `Wati membuka ${mr.mr_number}, lalu mengeluarkan material dari stok untuk Fajar`,
          4000,
        )
        await k.click(w, w.getByRole('button', { name: 'Keluarkan dari Stok' }).first(), HOLD)
        const issue = w.getByRole('dialog')
        await issue.waitFor({ timeout: 15_000 })
        await ctx.wait(1500)
        await k.search(w, issue.getByRole('combobox', { name: /Diterima oleh/ }), 'Fajar', 'Fajar')
        await k.fill(
          w,
          issue.getByLabel(/^Catatan pengambilan/),
          'Diserahkan lengkap ke Foreman Fajar',
          HOLD,
        )
        await k.click(w, issue.getByRole('button', { name: 'Keluarkan dari Stok' }), HOLD)
        await issue.waitFor({ state: 'hidden', timeout: 20_000 })
        await ctx.say('Material sudah diserahkan; MR berstatus Dikeluarkan', 4000)
      },
    },
    {
      id: 'sesuaikan',
      who: 'mbl.planner',
      title: 'Putri menyesuaikan WO: kurangi Kampas Rem, ganti Bearing',
      expect: 'Pratinjau "Yang akan terjadi" tampil; ADJ terbit dengan status Menunggu persetujuan',
      reach: async (ctx, d) => {
        const store = await ctx.as('mbl.storekeeper')
        const mr = await approvedMr(ctx, store, d)
        const fajar = await ctx.lib.personaUserId('mbl.foreman')
        ctx.ok(
          await ctx.api.send(store, 'POST', `/inventory/material-requests/${mr.id}/issue`, {
            warehouse_id: d.wh_id,
            note: 'Uji skenario: serah ke Fajar',
            receiver: { id: fajar, kind: 'USER' },
            attachments: [{ name: 'bukti.png', url: ctx.kit.photoUrl('serah') }],
          }),
          'serah material',
        )
      },
      run: async (ctx, d) => {
        const { page, k } = ctx
        await ctx.open(`/work-orders/wo/${d.wo_id}`)
        await ctx.say(`Putri membuka ${d.wo_number} dan memilih Sesuaikan Work Order`, 4000)
        await k.click(
          page,
          page.getByRole('button', { name: 'Sesuaikan Work Order' }).first(),
          HOLD,
        )
        await page.waitForURL(/adjustments\/new/, { timeout: 15_000 })
        await ctx.wait(2000)

        const rowKampas = page.locator('tr').filter({ hasText: d.kampas.name, visible: true })
        await ctx.say(`${d.kampas.name}: dikurangi dari 5 menjadi 3`, 2500)
        await k.pick(page, rowKampas.getByRole('combobox', { name: /Tindakan/ }), 'Kurangi jumlah')
        await k.fill(page, rowKampas.getByLabel(/Jumlah baru/).filter({ visible: true }), '3', 2500)

        const rowBearing = page.locator('tr').filter({ hasText: d.bearing.name, visible: true })
        await ctx.say(
          `${d.bearing.name}: diganti dengan part pengganti (SKU ${d.pengganti_sku}), jumlah 4`,
          2500,
        )
        await k.pick(page, rowBearing.getByRole('combobox', { name: /Tindakan/ }), 'Ganti part')
        await k.search(
          page,
          rowBearing.getByRole('combobox', { name: /Part pengganti/ }),
          d.pengganti_sku,
          d.pengganti_sku,
        )
        await k.fill(
          page,
          rowBearing.getByLabel(/^Jumlah pengganti/).filter({ visible: true }),
          '4',
          2500,
        )

        await ctx.kit.pickOption(page, /^Alasan/, 'Jumlah berlebih')
        await page
          .getByText('Yang akan terjadi')
          .filter({ visible: true })
          .waitFor({ timeout: 15_000 })
        await ctx.say(
          'Pratinjau "Yang akan terjadi": jumlah, nilai, dan barang yang harus kembali',
          6000,
        )
        await ctx.shot('pratinjau-penyesuaian')
        await k.click(page, page.getByRole('button', { name: 'Ajukan penyesuaian' }), HOLD)
        await page.waitForURL(/\/work-orders\/wo\/adjustments\/[0-9a-f-]{36}$/, { timeout: 15_000 })
        await ctx.wait(2500)
        const adj = (await page.locator('body').innerText()).match(/ADJ-\d{6}-\d{3}/)?.[0]
        const adjId = page.url().match(/adjustments\/([0-9a-f-]{36})/)?.[1]
        if (!adj || !adjId) throw new Error('Nomor ADJ tidak terbaca')
        d.adj_number = adj
        d.adj_id = adjId
        d.docs.push({
          label: 'Penyesuaian WO',
          nomor: adj,
          url: `/work-orders/wo/adjustments/${adjId}`,
        })
        await ctx.say(`${adj} diajukan: Menunggu persetujuan`, 4000)
      },
    },
    {
      id: 'setujui',
      who: 'mbl.plant-superintendent',
      title: 'Andi menyetujui penyesuaian dari Kotak Masuk',
      expect: 'Penyesuaian berstatus Diterapkan',
      run: async (ctx, d) => {
        const { page: a, k } = ctx
        if (!d.adj_number) throw new Error('Nomor ADJ belum ada (langkah sesuaikan belum jalan)')
        await ctx.open('/approvals')
        await ctx.say(`Andi membuka Kotak Masuk dan ${d.adj_number}`, 4000)
        await k.click(a, a.getByText(d.adj_number).filter({ visible: true }).first(), HOLD)
        await a.waitForURL(/\/work-orders\/wo\/adjustments\//, { timeout: 15_000 })
        await ctx.wait(2500)
        await k.click(a, a.getByRole('button', { name: 'Setujui' }), HOLD)
        await a
          .getByText('Diterapkan')
          .filter({ visible: true })
          .first()
          .waitFor({ timeout: 20_000 })
        await ctx.say(`${d.adj_number}: Diterapkan`, 4000)
      },
    },
    {
      id: 'lihat-wo',
      who: 'mbl.foreman',
      title: 'Fajar melihat bagian Penyesuaian, Adendum, dan peringatan "Harus kembali ke gudang"',
      expect: 'Bagian Penyesuaian tampil; peringatan "Harus kembali ke gudang" tampil',
      run: async (ctx, d) => {
        const { page: f } = ctx
        await ctx.open(`/work-orders/wo/${d.wo_id}`)
        await ctx.wait(2000)
        await ctx.say(
          'Fajar melihat WO: bagian Penyesuaian, Adendum bila ada, dan peringatan "Harus kembali ke gudang"',
          2000,
        )
        for (const judul of ['Penyesuaian', 'Adendum']) {
          const target = f.getByText(judul, { exact: true }).filter({ visible: true }).first()
          if (await target.count()) {
            await target.scrollIntoViewIfNeeded()
            await ctx.say(`Bagian ${judul}`, 4500)
          }
        }
        const harus = f
          .getByText(/Harus kembali ke gudang/)
          .filter({ visible: true })
          .first()
        await harus.scrollIntoViewIfNeeded()
        await ctx.say(
          `Peringatan: ${(await harus.innerText()).replace(/\s+/g, ' ').slice(0, 140)}`,
          5000,
        )
      },
    },
    {
      id: 'ajukan-retur',
      who: 'mbl.foreman',
      title: 'Fajar mengajukan retur material',
      expect: 'Dialog Ajukan retur material tertutup; retur terbit',
      run: async (ctx, d) => {
        const { page: f, k } = ctx
        await ctx.open(`/work-orders/wo/${d.wo_id}`)
        await ctx.say('Fajar mengajukan retur material', 2000)
        await k.click(f, f.getByRole('button', { name: 'Ajukan retur' }).first(), HOLD)
        const retur = f.getByRole('dialog')
        await retur.getByText('Ajukan retur material').waitFor({ timeout: 15_000 })
        await ctx.wait(4000)
        await k.fill(
          f,
          retur.getByLabel(/^Catatan/),
          'Sisa tidak terpakai setelah penyesuaian WO',
          HOLD,
        )
        await ctx.shot('dialog-retur')
        await k.click(f, retur.getByRole('button', { name: 'Ajukan retur' }), HOLD)
        await retur.waitFor({ state: 'hidden', timeout: 15_000 })
        await ctx.wait(3000)
      },
    },
    {
      id: 'terima-retur',
      who: 'mbl.storekeeper',
      title: 'Wati menerima material yang diretur',
      expect: 'Retur diterima: Layak, dengan catatan dan foto bukti',
      run: async (ctx, d) => {
        const { page: w, k } = ctx
        const list = ctx.ok(
          await ctx.api.get(w, '/inventory/return-material-requests?page_size=50'),
          'daftar retur',
        )
        const rows = ctx.lib.rows(list).filter((r) => JSON.stringify(r).includes(d.wo_number))
        const target =
          rows.find((r) => ['APPROVED', 'PARTIALLY_RECEIVED'].includes(r.status)) ?? rows[0]
        if (!target) throw new Error('Retur untuk WO ini tidak ditemukan')
        await ctx.open(`/inventory/return-material-requests/${target.id}`)
        await ctx.say(
          'Wati menerima material yang diretur: Layak terisi, catatan dan foto bukti',
          4000,
        )
        await k.click(w, w.getByRole('button', { name: 'Terima material' }), HOLD)
        const terima = w.getByRole('dialog')
        await terima.getByText('Terima material yang diretur').waitFor({ timeout: 15_000 })
        await ctx.wait(3500)
        await k.fill(
          w,
          terima.getByLabel(/^Catatan penerimaan/),
          'Diterima utuh dan layak pakai',
          HOLD,
        )
        await ctx.kit.addPhotoByUrl(w, terima, '/api/v1/media/work-order/demo/demo-foto.jpg')
        await ctx.wait(2500)
        await k.click(w, terima.getByRole('button', { name: 'Konfirmasi penerimaan' }), HOLD)
        await terima.waitFor({ state: 'hidden', timeout: 20_000 })
        await ctx.wait(3000)
        const stokAkhir = ctx.ok(
          await ctx.api.get(
            w,
            `/inventory/stock/on-hand?warehouse_id=${d.wh_id}&part_ids=${d.kampas.id},${d.bearing.id}`,
          ),
          'stok akhir',
        )
        ctx.log(`Stok akhir: ${JSON.stringify(stokAkhir).slice(0, 400)}`)
      },
    },
    {
      id: 'cek-akhir',
      who: 'mbl.foreman',
      title: 'Peringatan "Harus kembali ke gudang" hilang dari WO',
      expect: 'Tidak ada lagi peringatan "Harus kembali ke gudang"',
      run: async (ctx, d) => {
        await ctx.open(`/work-orders/wo/${d.wo_id}`)
        await ctx.wait(2500)
        const masih = await ctx.page
          .getByText(/Harus kembali ke gudang/)
          .filter({ visible: true })
          .count()
        await ctx.say(
          masih === 0
            ? 'Selesai · Peringatan "Harus kembali ke gudang" sudah hilang dari WO'
            : 'PERHATIAN · Peringatan "Harus kembali ke gudang" MASIH tampil',
          6000,
        )
        if (masih)
          throw new Error(
            'Peringatan "Harus kembali ke gudang" masih tampil sesudah retur diterima',
          )
      },
    },
  ],
})

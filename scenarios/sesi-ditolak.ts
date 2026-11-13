// Sesi kerja ditolak lalu diulang (FMS-31/32/34): dokumentasi lama terbawa ke sesi baru,
// lalu Riwayat item memperlihatkan versi dokumentasi dari kedua sesi.
import type { ApiTarget, BaseCtx, Doc, StepCtx } from '../src/core/types.ts'
import { defineScenario } from '../src/core/types.ts'

const UNIT = 'DT-014'
const WORKSHOP = 'Workshop Site Alpha'
const WAREHOUSE = 'WH-ALPHA'
const HOLD = 4000

interface Data {
  docs: Doc[]
  wo_id: string
  wo_number: string
  bearing_name: string
  made_id: string
  catatan_terbawa?: string
}

async function startSession(ctx: BaseCtx, target: ApiTarget, d: Data, n: number) {
  const base = `/work-orders/orders/${d.wo_id}/shifts`
  ctx.ok(
    await ctx.api.send(target, 'POST', `${base}/start`, {
      shift_name: `Sesi ${n}`,
      mechanic_ids: [d.made_id],
    }),
    'shifts/start',
  )
  ctx.ok(await ctx.api.send(target, 'POST', `${base}/start-work`, {}), 'start-work')
}

// Dokumentasi oleh Made di layar; mengembalikan isi catatan sebelum diubah.
async function documentWork(
  ctx: StepCtx,
  d: Data,
  { note, photo }: { note: string; photo: string | null },
) {
  const { page: m, k } = ctx
  await ctx.open(`/work-orders/wo/${d.wo_id}`)
  await m.getByText('Dokumentasi pengerjaan').first().waitFor({ timeout: 20_000 })
  const mulai = m.getByRole('button', { name: 'Mulai', exact: true })
  if (await mulai.count()) {
    await k.click(m, mulai.first(), HOLD)
    const startDialog = m
      .getByRole('dialog')
      .filter({ hasText: `Mulai mengerjakan ${d.bearing_name}?` })
    await startDialog.waitFor({ timeout: 10_000 })
    await ctx.wait(2500)
    await k.click(m, startDialog.getByRole('button', { name: 'Mulai', exact: true }), 2500)
  }
  const form = m
    .getByText(`Dokumentasi · ${d.bearing_name}`, { exact: true })
    .locator('xpath=ancestor::div[contains(@class,"MuiStack-root")][1]')
  await form.waitFor({ timeout: 15_000 })
  await ctx.wait(2500)
  const noteInput = form.getByRole('textbox', { name: /^Catatan pengerjaan/ })
  const awal = await noteInput.inputValue()
  await k.fill(m, noteInput, note, HOLD)
  if (photo) {
    await ctx.kit.addPhotoByUrl(m, form, ctx.kit.photoUrl(photo))
    await ctx.wait(3000)
  }
  await k.click(
    m,
    m.getByRole('button', { name: /^(Selesai|Perbarui dokumentasi)$/ }).first(),
    HOLD,
  )
  const dialog = m
    .getByRole('dialog')
    .filter({ hasText: /Kirim dokumentasi|Kirim ulang tanpa perubahan/ })
  await dialog.waitFor({ timeout: 10_000 })
  await ctx.wait(3000)
  await k.click(m, dialog.getByRole('button', { name: /^(Kirim|Kirim ulang)$/ }), 3000)
  await dialog.waitFor({ state: 'hidden', timeout: 20_000 })
  await ctx.wait(2500)
  return awal
}

async function endSession(ctx: StepCtx, d: Data, catatan: string) {
  const { page: f, k } = ctx
  await ctx.open(`/work-orders/wo/${d.wo_id}`)
  await ctx.wait(2500)
  const note = f
    .getByLabel('Catatan serah terima', { exact: true })
    .filter({ visible: true })
    .first()
  await k.fill(f, note, catatan, HOLD)
  await k.click(
    f,
    f.getByRole('button', { name: /^(Akhiri sesi|Tutup sesi & verifikasi)$/ }).first(),
    HOLD,
  )
  const dlg = f.getByRole('dialog').filter({ hasText: 'Akhiri sesi?' })
  await dlg.waitFor({ timeout: 10_000 })
  await ctx.wait(3000)
  await k.click(f, dlg.getByRole('button', { name: 'Akhiri sesi', exact: true }), 3000)
  await dlg.waitFor({ state: 'hidden', timeout: 20_000 })
  await ctx.wait(3000)
}

async function decide(
  ctx: StepCtx,
  d: Data,
  kind: 'tolak' | 'setuju',
  note: string,
  photo?: string,
) {
  const { page: f, k } = ctx
  await ctx.open(`/work-orders/wo/${d.wo_id}`)
  await ctx.wait(2500)
  const review = f
    .getByLabel(/^Catatan pemeriksaan/)
    .filter({ visible: true })
    .first()
  await review.scrollIntoViewIfNeeded()
  await k.fill(f, review, note, HOLD)
  if (photo) {
    await ctx.kit.addPhotoByUrl(
      f,
      review.locator('xpath=ancestor::div[contains(@class,"MuiStack-root")][1]'),
      ctx.kit.photoUrl(photo),
    )
    await ctx.wait(3000)
  }
  await k.click(
    f,
    f.getByRole('button', { name: kind === 'tolak' ? 'Tolak sesi' : 'Setujui sesi' }).first(),
    HOLD,
  )
  const dlg = f.getByRole('dialog')
  await dlg.waitFor({ timeout: 10_000 })
  await ctx.wait(3000)
  await k.click(
    f,
    dlg.getByRole('button', { name: kind === 'tolak' ? 'Tolak' : 'Setujui', exact: true }),
    3000,
  )
  await dlg.waitFor({ state: 'hidden', timeout: 20_000 })
  await ctx.wait(3500)
}

export default defineScenario<Data>({
  meta: {
    id: 'sesi-ditolak',
    title: 'Sesi kerja ditolak lalu diulang',
    group: 'wo',
    tickets: ['FMS-31', 'FMS-32', 'FMS-34'],
    estimasi: '9 menit',
    tujuan:
      'Membuktikan sesi yang ditolak membawa dokumentasi lama ke sesi berikutnya, mekanik bisa mengubahnya, dan Riwayat item mencatat versi dokumentasi dari kedua sesi.',
    personas: [
      {
        who: 'mbl.foreman',
        peran: 'mengakhiri sesi, menolak lalu menyetujui, membuka Riwayat item',
      },
      { who: 'mbl.mechanic', peran: 'mendokumentasikan pekerjaan di kedua sesi' },
      { who: 'mbl.planner', peran: 'membuat WO (lewat API)' },
      { who: 'mbl.supervisor', peran: 'merilis WO (lewat API)' },
      { who: 'mbl.storekeeper', peran: 'menyerahkan material (lewat API)' },
    ],
    data: [
      `Barang part baru tiap jalan "Uji SR Bearing Roda <stempel>" (saldo awal 5 di ${WAREHOUSE})`,
      `WO langsung ${UNIT}: Bearing ×3, dirilis, material diserahkan ke Fajar`,
      'Sesi 1 dibuka untuk Made dan pekerjaan dimulai (lewat API)',
    ],
    setelan: [],
    prasyarat: ['Penjaga Gudang boleh membuat barang dan memasang saldo awal'],
    catatan: [
      'Pengamatan terbuka: entri dokumentasi terbawa menampilkan "Foto ditambahkan (1)" atas nama Fajar, bukan Made (belum diputuskan sebagai temuan).',
    ],
  },

  async setup(ctx) {
    const store = await ctx.as('mbl.storekeeper')
    const planner = await ctx.as('mbl.planner')
    const wh = await ctx.kit.findWarehouse(store, WAREHOUSE)
    const vehicle = await ctx.kit.findVehicle(planner, UNIT)
    const workshop = await ctx.kit.findWorkshop(planner, WORKSHOP)
    const tag = ctx.kit.stamp()
    const bearing = await ctx.kit.newItem(ctx, store, wh.id, {
      sku: `SR-BRG-${tag}`,
      name: `Uji SR Bearing Roda ${tag}`,
      quantity: 5,
    })
    const wo = ctx.ok(
      await ctx.api.send(planner, 'POST', '/work-orders/orders/direct', {
        vehicle_id: vehicle.id,
        workshop_location_id: workshop.id,
        service_mode: 'WORKSHOP',
        lines: [
          {
            item_kind: 'PART',
            part_id: bearing.id,
            item_name: bearing.name,
            quantity: 3,
            unit_price_rupiah: '100000',
            warehouse_id: wh.id,
          },
        ],
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
      'rilis',
    )
    const mr = ctx.lib
      .rows(
        ctx.ok(
          await ctx.api.get(store, `/inventory/material-requests?work_order_id=${wo.id}`),
          'MR',
        ),
      )
      .find((r) => r.status === 'APPROVED')
    if (!mr) throw new Error('MR Disetujui tidak ada')
    ctx.ok(
      await ctx.api.send(store, 'POST', `/inventory/material-requests/${mr.id}/issue`, {
        warehouse_id: wh.id,
        note: 'Uji skenario: serah ke Fajar',
        receiver: { id: await ctx.lib.personaUserId('mbl.foreman'), kind: 'USER' },
        attachments: [{ name: 'bukti.png', url: ctx.kit.photoUrl('serah') }],
      }),
      'serah material',
    )
    const d: Data = {
      wo_id: wo.id,
      wo_number: '',
      bearing_name: bearing.name,
      made_id: await ctx.lib.personaUserId('mbl.mechanic'),
      docs: [],
    }
    await startSession(ctx, await ctx.as('mbl.foreman'), d, 1)
    d.wo_number = ctx.ok(
      await ctx.api.get(planner, `/work-orders/orders/${wo.id}`),
      'detail',
    ).wo_number
    d.docs = [
      {
        label: 'Work Order (Sesi 1 berjalan)',
        nomor: d.wo_number,
        url: `/work-orders/wo/${wo.id}`,
      },
      {
        label: 'Material Request (dikeluarkan)',
        nomor: mr.mr_number,
        url: `/inventory/material-requests/${mr.id}`,
      },
    ]
    return d
  },

  steps: [
    {
      id: 'buka',
      who: 'mbl.foreman',
      title: 'Fajar membuka WO dengan Sesi 1 berjalan',
      expect: 'Material sudah diserahkan; Sesi 1 untuk Made aktif',
      run: async (ctx, d) => {
        await ctx.open(`/work-orders/wo/${d.wo_id}`)
        await ctx.say(
          `Fajar membuka ${d.wo_number}: ${d.bearing_name} ×3, material sudah diserahkan, Sesi 1 dibuka untuk Made (disiapkan di belakang layar)`,
          6000,
        )
      },
    },
    {
      id: 'dokumentasi-1',
      who: 'mbl.mechanic',
      title: 'Made mendokumentasikan item: catatan awal dan satu foto',
      expect: 'Dokumentasi Sesi 1 terkirim',
      reach: async () => {},
      run: async (ctx, d) => {
        await ctx.open(`/work-orders/wo/${d.wo_id}`)
        await ctx.say(
          'Made mulai mengerjakan item dan mendokumentasikannya: catatan awal dan satu foto',
          6000,
        )
        await documentWork(ctx, d, { note: 'Catatan awal: bearing lama aus', photo: 'made-1' })
        await ctx.say('Dokumentasi Sesi 1 terkirim', 4000)
      },
    },
    {
      id: 'akhiri-1',
      who: 'mbl.foreman',
      title: 'Fajar mengakhiri Sesi 1',
      expect: 'Sesi 1 menunggu keputusan',
      run: async (ctx, d) => {
        await ctx.say('Fajar mengakhiri Sesi 1', 2500)
        await endSession(ctx, d, 'Akhir Sesi 1')
      },
    },
    {
      id: 'tolak-1',
      who: 'mbl.foreman',
      title: 'Fajar menolak Sesi 1 dengan catatan dan foto',
      expect: 'Kartu sesi bertuliskan Ditolak',
      run: async (ctx, d) => {
        await ctx.say('Fajar menolak Sesi 1 dengan catatan dan foto pemeriksaan', 2500)
        await decide(
          ctx,
          d,
          'tolak',
          'Foto kurang jelas dan catatan kurang rinci, ulangi',
          'tolak-1',
        )
        await ctx.say('Sesi 1 ditolak (tertulis Ditolak di kartu sesi)', 5000)
      },
    },
    {
      id: 'sesi-2',
      who: 'mbl.foreman',
      title: 'Sesi 2 dibuka untuk Made (di belakang layar)',
      expect: 'Sesi 2 aktif; dokumentasi lama ikut terbawa',
      run: async (ctx, d) => {
        await startSession(ctx, ctx.page, d, 2)
        await ctx.open(`/work-orders/wo/${d.wo_id}`)
        await ctx.say(
          'Sesi 2 dibuka untuk Made (di belakang layar). Dokumentasi lama ikut terbawa ke sesi baru',
          3000,
        )
      },
    },
    {
      id: 'dokumentasi-2',
      who: 'mbl.mechanic',
      title: 'Made mengubah catatan yang terbawa lalu mengirim ulang',
      expect: 'Catatan sudah terisi dari Sesi 1 sebelum diubah',
      run: async (ctx, d) => {
        await ctx.open(`/work-orders/wo/${d.wo_id}`)
        await ctx.say(
          'Made membuka item: catatan lama sudah terisi. Ia mengubah catatannya lalu mengirim ulang',
          3000,
        )
        const awal = await documentWork(ctx, d, {
          note: 'Catatan kedua: bearing lama aus, as roda dibersihkan, bearing baru terpasang',
          photo: null,
        })
        d.catatan_terbawa = awal
        await ctx.say(`Catatan terisi dari sesi lama: "${awal}" lalu diubah`, 4000)
        if (!awal) ctx.note('Catatan Sesi 2 kosong saat dibuka; dokumentasi lama tidak terbawa?')
      },
    },
    {
      id: 'akhiri-2',
      who: 'mbl.foreman',
      title: 'Fajar mengakhiri Sesi 2',
      expect: 'Sesi 2 menunggu keputusan',
      run: async (ctx, d) => {
        await ctx.say('Fajar mengakhiri Sesi 2', 2500)
        await endSession(ctx, d, 'Akhir Sesi 2')
      },
    },
    {
      id: 'setujui-2',
      who: 'mbl.foreman',
      title: 'Fajar menyetujui Sesi 2',
      expect: 'Kartu Sesi 2 bertuliskan Disetujui',
      run: async (ctx, d) => {
        await ctx.say('Fajar menyetujui Sesi 2 dengan catatan', 2500)
        await decide(ctx, d, 'setuju', 'Dokumentasi sudah lengkap dan jelas')
      },
    },
    {
      id: 'riwayat',
      who: 'mbl.foreman',
      title: 'Fajar membuka Riwayat item',
      expect: 'Riwayat memuat Didokumentasikan, Ditolak, dan perubahan "Catatan kerja" antar versi',
      run: async (ctx, d) => {
        const { page: f, k } = ctx
        await ctx.open(`/work-orders/wo/${d.wo_id}`)
        await ctx.say('Fajar membuka Riwayat item: versi dokumentasi dari kedua sesi', 2500)
        await k.click(f, f.getByRole('button', { name: 'Riwayat item' }).first(), HOLD)
        const hist = f.getByRole('dialog').filter({ hasText: `Riwayat ${d.bearing_name}` })
        await hist.waitFor({ timeout: 10_000 })
        await ctx.wait(3000)
        const text = await hist.innerText()
        ctx.log(`Riwayat:\n${text}`)
        await ctx.say(
          'Riwayat item: Didokumentasikan, Ditolak, dan perubahan Catatan kerja antar versi',
          12000,
        )
        if (!text.includes('Catatan kerja:'))
          ctx.note('Perubahan "Catatan kerja" tidak tampil di riwayat')
      },
    },
  ],
})

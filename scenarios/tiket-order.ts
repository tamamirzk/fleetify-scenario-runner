// Tiket sampai Order: lewati pemeriksaan, kembali ke pemeriksaan, pemeriksaan ditolak lalu
// diulang (FMS-87/88/39).
import type { Doc, StepCtx } from '../src/core/types.ts'
import { defineScenario } from '../src/core/types.ts'

const UNIT = 'DT-014'

interface Data {
  docs: Doc[]
  complaint_id: string
  cmp: string
  order_id?: string
  order_no?: string
  dgn1?: string
  dgn1_id?: string
  dgn2?: string
  dgn2_id?: string
}

const orderId = (d: Data) => {
  if (!d.order_id) throw new Error('Order belum dibuat (langkah order-lewati belum jalan)')
  return d.order_id
}

const inspectionsOf = async (
  ctx: StepCtx,
  d: Data,
): Promise<{ id: string; status: string; inspection_number: string }[]> =>
  ctx.ok(await ctx.api.get(ctx.page, `/work-orders/order-list/${orderId(d)}`), 'order')
    .inspections ?? []

// Made membuka pemeriksaan, mulai inspeksi, mengisi odometer, temuan, satu RPL jasa, lalu mengajukan.
async function fillInspection(
  ctx: StepCtx,
  { dgn, odo, temuan, tag }: { dgn: string; odo: string; temuan: string; tag: string },
) {
  const { page: m, k } = ctx
  await ctx.open('/work-orders/mechanic-inspections')
  await ctx.wait(2500)
  await k.click(m, m.getByText(dgn).filter({ visible: true }).first(), 2500)
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
    odo,
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
    temuan,
  )
  await k.click(m, m.getByRole('button', { name: 'Tambah Item' }).filter({ visible: true }).first())
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
  await ctx.shot(`isi-${tag}`)
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
  ctx.log(
    `Sesudah submit: ${JSON.stringify(await m.locator('[role=alert],[role=status],.MuiSnackbar-root').allInnerTexts())}`,
  )
}

export default defineScenario<Data>({
  meta: {
    id: 'tiket-order',
    title: 'Tiket sampai Order dan pemeriksaan ulang',
    group: 'wo',
    tickets: ['FMS-87', 'FMS-88', 'FMS-39'],
    estimasi: '14 menit',
    tujuan:
      'Membuktikan Order bisa dibuat dengan melewati pemeriksaan (alasan wajib, kartu terkunci), dikembalikan ke pemeriksaan, dan pemeriksaan yang ditolak bisa diulang lewat pemeriksaan baru sampai disetujui.',
    personas: [
      { who: 'mbl.mcr', peran: 'pelapor tiket (lewat API)' },
      { who: 'mbl.dispatcher', peran: 'menyetujui tiket' },
      { who: 'mbl.planner', peran: 'membuat Order, melewati lalu meminta pemeriksaan' },
      { who: 'mbl.supervisor', peran: 'menugaskan pemeriksaan ke Made' },
      { who: 'mbl.mechanic', peran: 'mengisi dan mengajukan pemeriksaan' },
      { who: 'mbl.superintendent', peran: 'meminta revisi, membuat pemeriksaan ulang, menyetujui' },
    ],
    data: [`Tiket baru "rem ${UNIT} berdecit" dari pelapor Mira, berstatus menunggu persetujuan`],
    setelan: [],
    prasyarat: [
      'Zona waktu perusahaan MBL sudah terkonfirmasi (jalankan skenario siapkan-zona sekali); tanpa itu dialog Mulai inspeksi tidak bisa dikonfirmasi',
      'Pemetaan approval tiket (VEHICLE_COMPLAINT) aktif dengan Dedi sebagai approver',
    ],
    catatan: [
      'Tidak ada reach: tiap langkah bergantung pada dokumen yang dibuat langkah sebelumnya di layar.',
    ],
  },

  async setup(ctx) {
    const rc = await ctx.as('mbl.mcr')
    const veh = await ctx.kit.findVehicle(rc, UNIT)
    const stamp = new Date().toISOString().slice(11, 19)
    const complaint = ctx.ok(
      await ctx.api.send(rc, 'POST', '/work-orders/complaints', {
        vehicle_id: veh.id,
        location_id: veh.location_id ?? veh.location?.id ?? null,
        title: `Uji skenario ${stamp}: rem ${UNIT} berdecit`,
        description: 'Rem terdengar berdecit dan terasa dalam saat dipakai turun di jalan tambang.',
        attributes: { location: 'Workshop Site Alpha' },
        attachments: [{ name: 'rem.jpg', url: ctx.kit.photoUrl('rem') }],
      }),
      'buat tiket',
    )
    ctx.log(`Tiket ${complaint.complaint_number} status ${complaint.status}`)
    return {
      complaint_id: complaint.id,
      cmp: complaint.complaint_number,
      docs: [
        {
          label: 'Tiket',
          nomor: complaint.complaint_number,
          url: `/work-orders/complaints/${complaint.id}`,
        },
      ],
    }
  },

  steps: [
    {
      id: 'setujui-tiket',
      who: 'mbl.dispatcher',
      title: 'Dedi menyetujui tiket baru dari Kotak Masuk',
      expect: 'Tiket Disetujui (Terbuka)',
      run: async (ctx, d) => {
        const { page, k } = ctx
        await ctx.open('/approvals')
        await ctx.say(
          `Tiket baru ${d.cmp} (rem ${UNIT} berdecit) dilaporkan pelapor (disiapkan di belakang layar). Dedi membuka Kotak Masuk`,
          3000,
        )
        const row = page.getByText(d.cmp).first()
        await row.waitFor({ timeout: 20_000 })
        await k.click(page, row)
        await page.waitForURL(/complaints\//, { timeout: 15_000 }).catch(() => {})
        const card = await k.panel(page)
        await ctx.say('Dedi menyetujui tiket di panel Persetujuan', 2500)
        await k.click(page, card.getByRole('button', { name: 'Setujui', exact: true }))
        await ctx.wait(3500)
        const st = ctx.ok(
          await ctx.api.get(page, `/work-orders/complaints/${d.complaint_id}/detail`),
          'detail tiket',
        )
        ctx.log(
          `Tiket sesudah disetujui: ${st.status}, aksi: ${JSON.stringify(st.allowed_actions)}`,
        )
      },
    },
    {
      id: 'order-lewati',
      who: 'mbl.planner',
      title: 'Putri membuat Order dan memilih Lewati pemeriksaan dengan alasan',
      expect: 'Tombol Simpan mati sampai alasan diisi; Order terbit',
      run: async (ctx, d) => {
        const { page: p, k } = ctx
        await ctx.open(`/work-orders/complaints/${d.complaint_id}`)
        await ctx.say(`Putri membuka tiket ${d.cmp} dan menekan Buat Order`, 2500)
        await k.click(p, p.getByRole('button', { name: 'Buat Order' }).first())
        const dlg = p.getByRole('dialog').filter({ hasText: 'Tiket yang dijadikan order' })
        await dlg.waitFor({ timeout: 10_000 })
        await ctx.wait(1500)
        await k.pick(p, dlg.getByRole('combobox', { name: /^Bengkel/ }), 'Workshop Site Alpha')
        await ctx.say(
          'Kerusakan sudah jelas, jadi Putri mencentang Lewati pemeriksaan. Tombol Simpan mati sampai alasan diisi',
          2500,
        )
        await k.click(p, dlg.getByRole('checkbox', { name: 'Lewati pemeriksaan' }))
        const disabled = await dlg.getByRole('button', { name: 'Simpan' }).isDisabled()
        ctx.log(`Simpan mati tanpa alasan: ${disabled}`)
        if (!disabled) ctx.note('Simpan tidak mati tanpa alasan melewati pemeriksaan')
        await ctx.wait(3000)
        await k.fill(
          p,
          dlg.getByLabel(/^Alasan melewati/),
          'Kerusakan sudah jelas dari laporan: kampas rem tipis, tidak perlu pemeriksaan terpisah',
        )
        await k.click(p, dlg.getByRole('button', { name: 'Simpan' }))
        const confirm = p.getByRole('dialog').filter({ hasText: 'Lewati pemeriksaan?' })
        await confirm.waitFor({ timeout: 10_000 })
        await ctx.wait(3500)
        await k.click(p, confirm.getByRole('button', { name: 'Lewati pemeriksaan' }), 2500)
        await p.waitForURL(/\/work-orders\/orders\/[0-9a-f-]{36}/, { timeout: 20_000 })
        await ctx.wait(3000)
        const id = p.url().match(/orders\/([0-9a-f-]{36})/)?.[1]
        if (!id) throw new Error('Id Order tidak terbaca dari URL')
        d.order_id = id
        d.order_no = ctx.ok(
          await ctx.api.get(p, `/work-orders/order-list/${id}`),
          'order',
        ).order_number
        d.docs.push({ label: 'Order', nomor: d.order_no ?? '-', url: `/work-orders/orders/${id}` })
        ctx.log(`Order ${d.order_no}`)
      },
    },
    {
      id: 'kartu-terkunci',
      who: 'mbl.planner',
      title: 'Kartu Pemeriksaan terkunci dengan alasan',
      expect: '"Pemeriksaan dilewati pada Order ini" tampil; langkah berikutnya Susun penawaran',
      run: async (ctx, d) => {
        const p = ctx.page
        await ctx.open(`/work-orders/orders/${orderId(d)}`)
        const locked = p.getByText(/Pemeriksaan dilewati pada Order ini/).first()
        await locked.scrollIntoViewIfNeeded().catch(() => {})
        await ctx.say(
          `${d.order_no} terbit: Pemeriksaan dilewati, kartu Pemeriksaan terkunci dengan alasan, langkah berikutnya Susun penawaran`,
          7500,
        )
        if (!(await locked.count()))
          throw new Error('Kartu pemeriksaan terkunci tidak tampil di Order')
      },
    },
    {
      id: 'minta-pemeriksaan',
      who: 'mbl.planner',
      title: 'Putri berubah pikiran: Minta pemeriksaan dengan alasan',
      expect: 'Order kembali menunggu pemeriksaan; pemeriksaan siap ditugaskan',
      run: async (ctx, d) => {
        const { page: p, k } = ctx
        await ctx.open(`/work-orders/orders/${orderId(d)}`)
        await ctx.say('Putri berubah pikiran dan menekan Minta pemeriksaan dengan alasan', 2500)
        await k.click(p, p.getByRole('button', { name: 'Minta pemeriksaan' }).first())
        const req = p.getByRole('dialog').filter({ hasText: 'Kembali ke pemeriksaan?' })
        await req.waitFor({ timeout: 10_000 })
        await ctx.wait(2500)
        await k.fill(
          p,
          req.getByLabel(/^Alasan/),
          'Setelah dipikir ulang, penyebab bunyi rem perlu dipastikan mekanik',
        )
        await k.click(p, req.getByRole('button', { name: 'Minta pemeriksaan' }), 2500)
        await req.waitFor({ state: 'hidden', timeout: 20_000 })
        await ctx.wait(3500)
        ctx.log(
          `Putri melihat Tugaskan pemeriksaan: ${/Tugaskan pemeriksaan/.test(await ctx.k.text(p))}`,
        )
        await ctx.say(
          'Order kembali menunggu pemeriksaan: tombol Minta/Lewati menyesuaikan, pemeriksaan siap ditugaskan',
          3000,
        )
      },
    },
    {
      id: 'tugaskan',
      who: 'mbl.supervisor',
      title: 'Surya menugaskan pemeriksaan ke Made',
      expect: 'Pemeriksaan (DGN) terbit untuk Made',
      run: async (ctx, d) => {
        const { page: s, k } = ctx
        await ctx.open(`/work-orders/orders/${orderId(d)}`)
        await ctx.say('Surya menugaskan pemeriksaan ke Made', 2500)
        await k.click(
          s,
          s.getByRole('button', { name: 'Tugaskan pemeriksaan' }).filter({ visible: true }).first(),
        )
        const ad = s.getByRole('dialog').filter({ hasText: 'Tugaskan pemeriksaan' })
        await ad.waitFor({ timeout: 10_000 })
        await ctx.wait(2000)
        await ctx.kit.chooseMechanic(s, k, ad)
        await k.click(s, ad.getByRole('button', { name: 'Tugaskan pemeriksaan' }).last(), 2500)
        await ad.waitFor({ state: 'hidden', timeout: 20_000 })
        await ctx.wait(3500)
        const diag = (await inspectionsOf(ctx, d)).find((x) => x.status !== 'CANCELLED')
        if (!diag) throw new Error('Pemeriksaan belum terbit setelah ditugaskan')
        d.dgn1 = diag.inspection_number
        d.dgn1_id = diag.id
        d.docs.push({
          label: 'Pemeriksaan pertama',
          nomor: d.dgn1,
          url: `/work-orders/mechanic-inspections/${diag.id}`,
        })
      },
    },
    {
      id: 'isi-pertama',
      who: 'mbl.mechanic',
      title: 'Made mengisi pemeriksaan pertama lalu mengajukan',
      expect: 'Pemeriksaan terkirim, menunggu keputusan',
      run: async (ctx, d) => {
        if (!d.dgn1) throw new Error('Pemeriksaan pertama belum ada')
        await ctx.open('/work-orders/mechanic-inspections')
        await ctx.say(
          `Made membuka ${d.dgn1}, mulai inspeksi, mengisi odometer, temuan, dan RPL jasa lalu mengajukan`,
          2500,
        )
        await fillInspection(ctx, {
          dgn: d.dgn1,
          odo: '58100',
          tag: 'pertama',
          temuan: 'Kampas rem depan tipis, perlu servis rem',
        })
      },
    },
    {
      id: 'revisi',
      who: 'mbl.superintendent',
      title: 'Bagus meminta revisi pemeriksaan',
      expect: 'Status Ditolak, kartu "Pemeriksaan ditolak", tombol Buat pemeriksaan ulang muncul',
      run: async (ctx, d) => {
        const { page: b, k } = ctx
        await ctx.open(`/work-orders/mechanic-inspections/${d.dgn1_id}`)
        await ctx.say(
          'Bagus meninjau pemeriksaan: kartu biru Menunggu keputusan pemeriksaan, tombol Revisi dan Setujui',
          2500,
        )
        const card = await k.panel(b)
        await k.fill(
          b,
          card.getByLabel(/Catatan/),
          'Foto dan rincian temuan belum cukup, mohon diulang',
        )
        await k.click(b, card.getByRole('button', { name: 'Revisi', exact: true }))
        await ctx.wait(3500)
        await ctx.say(
          'Status Ditolak: kartu RPL kuning "Pemeriksaan ditolak", tombol Buat pemeriksaan ulang muncul',
          2500,
        )
        await b
          .getByRole('button', { name: 'Buat pemeriksaan ulang' })
          .first()
          .waitFor({ timeout: 20_000 })
        await ctx.wait(4000)
      },
    },
    {
      id: 'pemeriksaan-ulang',
      who: 'mbl.superintendent',
      title: 'Bagus membuat pemeriksaan ulang untuk Made',
      expect: 'Pemeriksaan ulang (DGN baru) terbit',
      run: async (ctx, d) => {
        const { page: b, k } = ctx
        await ctx.open(`/work-orders/mechanic-inspections/${d.dgn1_id}`)
        await ctx.say('Bagus membuat pemeriksaan ulang dan memilih Made', 2500)
        await k.click(b, b.getByRole('button', { name: 'Buat pemeriksaan ulang' }).first())
        const rd = b.getByRole('dialog').last()
        await rd.waitFor({ timeout: 10_000 })
        await ctx.wait(2000)
        await ctx.kit.chooseMechanic(b, k, rd)
        await k.click(
          b,
          rd
            .getByRole('button')
            .filter({ hasText: /Tugaskan|Buat|Simpan/ })
            .last(),
          2500,
        )
        await rd.waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {})
        await ctx.wait(3500)
        const row = (await inspectionsOf(ctx, d)).find(
          (x) => x.id !== d.dgn1_id && x.status !== 'CANCELLED',
        )
        if (!row) throw new Error('Pemeriksaan ulang tidak terbentuk')
        d.dgn2 = row.inspection_number
        d.dgn2_id = row.id
        d.docs.push({
          label: 'Pemeriksaan ulang',
          nomor: d.dgn2,
          url: `/work-orders/mechanic-inspections/${row.id}`,
        })
        await ctx.say(`Pemeriksaan ulang ${d.dgn2} terbit untuk Made`, 3000)
      },
    },
    {
      id: 'isi-ulang',
      who: 'mbl.mechanic',
      title: 'Made mengisi ulang pemeriksaan dengan temuan lebih rinci',
      expect: 'Pemeriksaan ulang terkirim',
      run: async (ctx, d) => {
        if (!d.dgn2) throw new Error('Pemeriksaan ulang belum ada')
        await ctx.say(`Made mengisi ulang ${d.dgn2} dengan temuan yang lebih rinci`, 2500)
        await fillInspection(ctx, {
          dgn: d.dgn2,
          odo: '58120',
          tag: 'ulang',
          temuan: 'Kampas rem depan tipis 2 mm, cakram bergaris; ganti kampas dan servis rem',
        })
      },
    },
    {
      id: 'setujui-ulang',
      who: 'mbl.superintendent',
      title: 'Bagus menyetujui pemeriksaan ulang',
      expect: '"Rekomendasi ini sudah disetujui"; pemeriksaan pertama tetap Ditolak',
      run: async (ctx, d) => {
        const { page: b, k } = ctx
        await ctx.open(`/work-orders/mechanic-inspections/${d.dgn2_id}`)
        const card = await k.panel(b)
        await ctx.say('Bagus menyetujui pemeriksaan ulang', 2500)
        await k.fill(b, card.getByLabel(/Catatan/), 'Sudah lengkap, disetujui')
        await k.click(b, card.getByRole('button', { name: 'Setujui', exact: true }))
        await b
          .getByText('Rekomendasi ini sudah disetujui')
          .filter({ visible: true })
          .first()
          .waitFor({ timeout: 20_000 })
          .catch(() => {})
        await ctx.wait(3000)
        if (!/Rekomendasi ini sudah disetujui/.test(await k.text(b)))
          throw new Error('Kartu "Rekomendasi ini sudah disetujui" tidak tampil')
        await ctx.say(
          'Pemeriksaan ulang Disetujui; pemeriksaan pertama tetap tertulis Ditolak. Order siap disusun penawarannya',
          4000,
        )
      },
    },
  ],
})

// Approval dengan batas waktu dan eskalasi (FMS-42/43). Mengubah setelan alur
// "Approval Purchase Order" (SLA, pengingat, peran eskalasi) lalu mengembalikannya.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { config } from '../src/core/config.ts'
import type { BaseCtx, Body, Doc, StepCtx } from '../src/core/types.ts'
import { defineScenario } from '../src/core/types.ts'

const FLOW_NAME = 'Approval Purchase Order'
const ANDI = 'mbl.plant-superintendent'
const HOLD = 4000

interface Data {
  docs: Doc[]
  flow_id: string
  po_id?: string
  po_number?: string
  po_status?: string
}

// ── Pengecualian db-lewat-api: hanya untuk memajukan tenggat request PO ini ─
function backendDir(): string {
  const dir = config.v2BackendDir
  if (!dir || !existsSync(path.join(dir, '.env')))
    throw new Error(
      'Isi V2_BACKEND_DIR di .env dengan folder Backend server v2 yang sedang menyala',
    )
  return dir
}
function dbUrl(): string {
  const line = readFileSync(path.join(backendDir(), '.env'), 'utf8').match(
    /^MIGRATE_DATABASE_URL=(.*)$/m,
  )?.[1]
  if (!line) throw new Error('MIGRATE_DATABASE_URL tidak ada di .env Backend')
  return line.replaceAll('"', '').replace('?schema=public', '')
}
const psql = (sql: string) =>
  execFileSync('psql', [dbUrl(), '-At', '-c', sql], { encoding: 'utf8' }).trim()
const backdate = (poNumber: string) =>
  psql(`update approval_request_steps set due_at = (now() at time zone 'utc') - interval '1 minute'
    where status = 'PENDING' and activated_at is not null
    and request_id = (select id from approval_requests where title = '${poNumber.replaceAll("'", '')}' and status = 'PENDING') returning 1`)
const scan = () =>
  execFileSync('bun', ['run', 'scripts/run-approval-sla-scan.ts'], {
    cwd: backendDir(),
    encoding: 'utf8',
  })

const flowEmpty = (f: Body) =>
  f.escalation_role_id == null &&
  f.steps.every((s: Body) => s.sla_value == null && s.reminder_hours_before == null)

const poUrl = (d: Data) => {
  if (!d.po_id) throw new Error('PO belum dibuat (langkah buat-po belum jalan)')
  return `/procurement/purchase-orders/${d.po_id}`
}

async function openFlow(ctx: StepCtx) {
  const { page: p, k } = ctx
  await ctx.open('/config/approval-flows')
  await ctx.wait(2000)
  const row = p
    .getByText(FLOW_NAME, { exact: true })
    .first()
    .locator('xpath=ancestor::*[.//button][1]')
  await k.click(p, row.getByRole('button', { name: 'Ubah' }), 3000)
  const dlg = p.getByRole('dialog').filter({ hasText: 'Ubah alur' })
  await dlg.waitFor({ timeout: 10_000 })
  await ctx.wait(1500)
  return dlg
}

async function saveFlow(ctx: StepCtx, dlg: ReturnType<StepCtx['page']['getByRole']>) {
  const { page: p, k } = ctx
  await k.click(p, dlg.getByRole('button', { name: 'Simpan', exact: true }), 3000)
  await ctx.wait(1500)
  const confirm = p.getByRole('button', { name: 'Konfirmasi dan simpan' })
  if (await confirm.count()) await k.click(p, confirm, 3000)
  await dlg.waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {})
  await ctx.wait(2000)
}

async function readFlow(ctx: BaseCtx, d: Data) {
  return ctx.ok(await ctx.api.get(await ctx.as(ANDI), `/approval/flows/${d.flow_id}`), 'alur PO')
}

export default defineScenario<Data>({
  meta: {
    id: 'sla-eskalasi',
    title: 'Approval dengan batas waktu dan eskalasi',
    group: 'approval',
    tickets: ['FMS-42', 'FMS-43'],
    estimasi: '10 menit',
    tujuan:
      'Membuktikan tahap approval yang lewat tenggat diteruskan otomatis, tahap terakhir diserahkan ke peran eskalasi "oleh Sistem", dan penerima pengalihan bisa menyetujui.',
    personas: [
      {
        who: ANDI,
        peran: 'mengatur SLA alur, membuat dan memesan PO, menyetujui sebagai penerima eskalasi',
      },
    ],
    data: ['PO baru tanpa PR (dibuat di layar pada langkah 3), satu barang Filter, Rp 10.000'],
    setelan: [
      `Alur "${FLOW_NAME}": tahap 1 SLA 4 jam + ingatkan 1 jam, tahap 2 SLA 1 hari, eskalasi ke Plant Superintendent`,
      'Dikembalikan kosong di langkah terakhir; cleanup() memeriksa ulang lewat API dan gagal bila masih terisi',
    ],
    prasyarat: [
      'V2_BACKEND_DIR di .env menunjuk folder Backend server v2 yang menyala (untuk bun run scripts/run-approval-sla-scan.ts)',
      'psql terpasang; MIGRATE_DATABASE_URL ada di .env Backend',
    ],
    catatan: [
      'Pemindaian SLA berlaku untuk semua request yang lewat tenggat di DB, bukan hanya PO ini.',
      'Bila jalan berhenti sebelum langkah terakhir, kosongkan setelan alur lewat /config/approval-flows.',
    ],
    pengecualian: [
      {
        aturan: 'db-lewat-api',
        alasan:
          'Tenggat dimajukan dengan UPDATE SQL yang hanya mengenai request PO ini, karena aplikasi tidak punya cara memajukan waktu.',
      },
    ],
  },

  async setup(ctx) {
    backendDir()
    const f = await ctx.kit.findApprovalFlow(await ctx.as(ANDI), FLOW_NAME)
    if (!flowEmpty(f))
      ctx.log(
        'PERINGATAN: alur PO sudah punya SLA/eskalasi sebelum jalan; langkah terakhir akan mengosongkannya',
      )
    return {
      flow_id: f.id,
      docs: [{ label: 'Alur persetujuan', nomor: f.name, url: '/config/approval-flows' }],
    }
  },

  async cleanup(ctx, d) {
    if (!flowEmpty(await readFlow(ctx, d)))
      throw new Error(
        `Setelan alur "${FLOW_NAME}" masih terisi SLA/eskalasi; kosongkan lewat /config/approval-flows`,
      )
    ctx.log('Setelan alur PO kosong (terverifikasi lewat API)')
  },

  steps: [
    {
      id: 'buka-alur',
      who: ANDI,
      title: `Andi membuka Alur Persetujuan "${FLOW_NAME}"`,
      expect: 'Daftar alur persetujuan tampil',
      run: async (ctx) => {
        await ctx.open('/config/approval-flows')
        await ctx.say(
          `Andi membuka Alur Persetujuan "${FLOW_NAME}" untuk memasang batas waktu`,
          3000,
        )
      },
    },
    {
      id: 'pasang-sla',
      who: ANDI,
      title: 'Andi memasang SLA, pengingat, dan peran eskalasi',
      expect: 'Alur tersimpan dengan SLA tahap 1 4 jam dan tahap 2 1 hari',
      reach: async () => {},
      run: async (ctx) => {
        const { page: p, k } = ctx
        const dlg = await openFlow(ctx)
        const sla = dlg.getByRole('textbox', { name: /Batas waktu \(SLA\)/ })
        const unit = dlg.getByRole('combobox', { name: /^Satuan/ })
        const rem = dlg.getByRole('textbox', { name: /Ingatkan/ })
        await ctx.say('Tahap 1: batas waktu 4 jam, ingatkan 1 jam sebelum', 2500)
        await k.fill(p, sla.nth(0), '4', HOLD)
        await k.pick(p, unit.nth(0), 'Jam')
        await k.fill(p, rem.nth(0), '1', HOLD)
        await ctx.say(
          'Tahap 2: batas waktu 1 hari; bila habis, diserahkan ke Plant Superintendent',
          2500,
        )
        await k.fill(p, sla.nth(1), '1', HOLD)
        await k.pick(p, unit.nth(1), 'Hari')
        await k.pick(p, dlg.getByRole('combobox', { name: /serahkan ke/ }), 'Plant Superintendent')
        await ctx.shot('setelan-sla')
        await ctx.say('Menyimpan alur', 1500)
        await saveFlow(ctx, dlg)
      },
    },
    {
      id: 'buat-po',
      who: ANDI,
      title: 'Andi membuat PO tanpa PR',
      expect: 'PO tersimpan sebagai draf',
      run: async (ctx, d) => {
        const { page: p, k } = ctx
        await ctx.open('/procurement/purchase-orders/new')
        await ctx.wait(2500)
        await ctx.say('Andi membuat PO tanpa PR: pemasok, alamat pengiriman, satu barang', 2500)
        await k.pick(p, p.getByRole('combobox', { name: /^Pemasok/ }), /.+/)
        await k.fill(
          p,
          p.getByRole('textbox', { name: /^Alamat pengiriman/ }),
          'Gudang Site Alpha (uji skenario SLA)',
          HOLD,
        )
        await k.search(p, p.getByRole('combobox', { name: /^Produk/ }).first(), 'Filter', /\S/)
        await k.fill(p, p.getByRole('textbox', { name: /^Qty/ }).first(), '1', HOLD)
        await k.fill(p, p.getByRole('textbox', { name: /^Harga/ }).first(), '10000', HOLD)
        const created = p.waitForResponse(
          (r) => /\/procurement\/purchase-orders$/.test(r.url()) && r.request().method() === 'POST',
          { timeout: 20_000 },
        )
        await k.click(p, p.getByRole('button', { name: 'Simpan', exact: true }), HOLD)
        d.po_id = (await (await created).json()).id
        d.po_number = (await ctx.api.get(p, poUrl(d))).body?.po_number
        d.docs.push({ label: 'Purchase Order', nomor: d.po_number ?? '-', url: poUrl(d) })
        await ctx.wait(3000)
      },
    },
    {
      id: 'pesan',
      who: ANDI,
      title: 'Andi memesan PO; panel Persetujuan menampilkan Tenggat',
      expect: 'Tahap 1 berjalan dengan Tenggat',
      run: async (ctx, d) => {
        const { page: p, k } = ctx
        await ctx.open(poUrl(d))
        await ctx.say(`${d.po_number} dibuat sebagai draf. Andi memesannya (Pesan)`, 3000)
        await k.click(p, p.getByRole('button', { name: 'Pesan', exact: true }), HOLD)
        const confirm = p.getByRole('dialog')
        if (await confirm.count()) {
          await ctx.wait(3000)
          await k.click(
            p,
            confirm
              .first()
              .getByRole('button', { name: /^(Pesan|Ya|Konfirmasi|Lanjut)/ })
              .last(),
            3000,
          )
        }
        await ctx.wait(3000)
        await ctx.open(poUrl(d))
        await k.panel(p)
        await ctx.say(`Panel Persetujuan ${d.po_number}: tahap 1 berjalan dengan Tenggat`, 8000)
      },
    },
    {
      id: 'lewat-tenggat-1',
      who: ANDI,
      title: 'Tenggat tahap 1 dimajukan, pemindaian SLA pertama',
      expect:
        'Tahap 1 Diteruskan ("Tahap ini belum menyetujui"); tahap 2 aktif dengan tenggat baru',
      run: async (ctx, d) => {
        await ctx.say(
          'Tenggat tahap 1 dimajukan lewat SQL (hanya request PO ini), lalu pemindaian SLA dijalankan',
          3000,
        )
        ctx.log(`baris diubah: ${backdate(d.po_number ?? '')}`)
        ctx.log(scan().trim().split('\n').slice(-3).join(' | '))
        await ctx.open(poUrl(d))
        await ctx.k.panel(ctx.page)
        await ctx.say(
          'Tahap 1 Diteruskan ("Tahap ini belum menyetujui"); tahap 2 aktif dengan tenggat baru',
          9000,
        )
      },
    },
    {
      id: 'lewat-tenggat-2',
      who: ANDI,
      title: 'Tenggat tahap 2 dimajukan: tahap terakhir diserahkan ke Plant Superintendent',
      expect: 'Riwayat pengalihan approver: dialihkan oleh Sistem karena batas waktu terlewati',
      run: async (ctx, d) => {
        await ctx.say(
          'Tenggat tahap 2 dimajukan, pemindaian dijalankan lagi: tahap terakhir diserahkan ke Plant Superintendent',
          3000,
        )
        ctx.log(`baris diubah: ${backdate(d.po_number ?? '')}`)
        ctx.log(scan().trim().split('\n').slice(-3).join(' | '))
        await ctx.open(poUrl(d))
        const card = await ctx.k.panel(ctx.page)
        await ctx.say(
          'Riwayat pengalihan approver: dialihkan oleh Sistem karena batas waktu terlewati',
          11000,
        )
        const text = await card.innerText()
        ctx.log(`Panel:\n${text}`)
        if (!/Sistem/.test(text)) ctx.note('Panel tidak menyebut "Sistem" pada riwayat pengalihan')
      },
    },
    {
      id: 'setujui',
      who: ANDI,
      title: 'Andi, penerima pengalihan, menyetujui PO',
      expect: 'Status PO berubah (Dipesan)',
      run: async (ctx, d) => {
        const { page: p, k } = ctx
        await ctx.open(poUrl(d))
        const card = await k.panel(p)
        await ctx.say('Andi, penerima pengalihan, menyetujui PO', 2500)
        await k.click(p, card.getByRole('button', { name: 'Setujui', exact: true }), HOLD)
        const dlg = p.getByRole('dialog')
        if (await dlg.count()) {
          await ctx.wait(3000)
          await k.click(
            p,
            dlg
              .first()
              .getByRole('button', { name: /^(Setujui|Ya|Konfirmasi)/ })
              .last(),
            3000,
          )
        }
        await ctx.wait(3500)
        await ctx.open(poUrl(d))
        d.po_status = (await ctx.api.get(p, poUrl(d))).body?.status
        await ctx.say(`${d.po_number}: status ${d.po_status}`, 5000)
      },
    },
    {
      id: 'kembalikan',
      who: ANDI,
      title: 'Mengembalikan setelan alur: SLA, pengingat, dan peran eskalasi dikosongkan',
      expect: 'Alur kembali tanpa batas waktu (diperiksa lewat API)',
      reach: async () => {},
      run: async (ctx, d) => {
        const { page: p, k } = ctx
        await ctx.say('Mengembalikan setelan: SLA, pengingat, dan peran eskalasi dikosongkan', 3000)
        const dlg = await openFlow(ctx)
        const sla = dlg.getByRole('textbox', { name: /Batas waktu \(SLA\)/ })
        const rem = dlg.getByRole('textbox', { name: /Ingatkan/ })
        for (const i of [0, 1]) {
          if (await rem.nth(i).isEnabled()) await k.fill(p, rem.nth(i), '', 1500)
          await k.fill(p, sla.nth(i), '', 1500)
        }
        await k.pick(p, dlg.getByRole('combobox', { name: /serahkan ke/ }), 'Superadmin perusahaan')
        await saveFlow(ctx, dlg)
        const restored = flowEmpty((await ctx.api.get(p, `/approval/flows/${d.flow_id}`)).body)
        await ctx.say(
          restored
            ? 'Selesai · alur kembali tanpa batas waktu'
            : 'PERHATIAN · setelan alur belum kosong, periksa manual',
          5000,
        )
        if (!restored) throw new Error('Setelan alur belum kosong')
      },
    },
  ],
})

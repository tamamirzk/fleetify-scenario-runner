// Aksi pustaka alur persetujuan, SLA, dan PO.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { config } from '../core/config.ts'
import { PERSONA_IDS } from '../core/personas.ts'
import type { Body } from '../core/types.ts'
import { api, layar } from './types.ts'

const persona = z.enum(PERSONA_IDS)
const id = z.string().min(1)

const alurKosong = (f: Body) =>
  f.escalation_role_id == null &&
  f.steps.every((s: Body) => s.sla_value == null && s.reminder_hours_before == null)

export const alurPersetujuan = api({
  ringkasan:
    'Cari alur persetujuan berdasarkan nama; mencatat peringatan bila alur sudah punya SLA atau eskalasi.',
  hasil: '{ id, nama }',
  argumen: z
    .object({ sebagai: persona.default('mbl.plant-superintendent'), nama: z.string().min(3) })
    .strict(),
  urai: (a) => `Cari alur "${a.nama}"`,
  async jalankan(ctx, a) {
    const f = await ctx.kit.findApprovalFlow(await ctx.as(a.sebagai), a.nama)
    if (!alurKosong(f))
      ctx.log(
        'PERINGATAN: alur sudah punya SLA/eskalasi sebelum jalan; skenario akan mengosongkannya',
      )
    return { id: f.id, nama: f.name }
  },
})

export const periksaAlurKosong = api({
  ringkasan: 'Gagal bila alur persetujuan masih punya SLA, pengingat, atau peran eskalasi.',
  argumen: z.object({ sebagai: persona.default('mbl.plant-superintendent'), alur: id }).strict(),
  urai: () => 'Periksa alur tanpa batas waktu',
  async jalankan(ctx, a) {
    const f = ctx.ok(
      await ctx.api.get(await ctx.as(a.sebagai), `/approval/flows/${a.alur}`),
      'alur',
    )
    if (!alurKosong(f))
      throw new Error(
        `Setelan alur "${f.name}" masih terisi SLA/eskalasi; kosongkan lewat /config/approval-flows`,
      )
    ctx.log('Setelan alur kosong (terverifikasi lewat API)')
  },
})

export const bukaUbahAlur = layar({
  ringkasan:
    'Buka /config/approval-flows dan tekan Ubah pada baris alur; dialog "Ubah alur" terbuka.',
  argumen: z.object({ nama: z.string().min(3) }).strict(),
  urai: (a) => `Buka dialog Ubah alur "${a.nama}"`,
  async jalankan(ctx, a) {
    const { page: p, k } = ctx
    await ctx.open('/config/approval-flows')
    await ctx.wait(2000)
    const row = p
      .getByText(a.nama, { exact: true })
      .first()
      .locator('xpath=ancestor::*[.//button][1]')
    await k.click(p, row.getByRole('button', { name: 'Ubah' }), 3000)
    await p.getByRole('dialog').filter({ hasText: 'Ubah alur' }).waitFor({ timeout: 10_000 })
    await ctx.wait(1500)
  },
})

export const simpanAlur = layar({
  ringkasan:
    'Tekan Simpan di dialog "Ubah alur", konfirmasi bila diminta, dan tunggu dialog tertutup.',
  argumen: z.object({}).strict(),
  urai: () => 'Simpan alur',
  async jalankan(ctx) {
    const { page: p, k } = ctx
    const dlg = p.getByRole('dialog').filter({ hasText: 'Ubah alur' })
    await k.click(p, dlg.getByRole('button', { name: 'Simpan', exact: true }), 3000)
    await ctx.wait(1500)
    const confirm = p.getByRole('button', { name: 'Konfirmasi dan simpan' })
    if (await confirm.count()) await k.click(p, confirm, 3000)
    await dlg.waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => {})
    await ctx.wait(2000)
  },
})

export const po = api({
  ringkasan: 'Baca Purchase Order lewat API.',
  hasil: '{ id, nomor, status }',
  argumen: z.object({ sebagai: persona.default('mbl.plant-superintendent'), id }).strict(),
  urai: () => 'Baca PO',
  async jalankan(ctx, a) {
    const b = ctx.ok(
      await ctx.api.get(await ctx.as(a.sebagai), `/procurement/purchase-orders/${a.id}`),
      'detail PO',
    )
    return { id: b.id, nomor: b.po_number, status: b.status }
  },
})

// ── Pengecualian db-lewat-api: aplikasi tidak punya cara memajukan waktu ────
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

export const majukanTenggatSla = api({
  ringkasan:
    'PENGECUALIAN DB: majukan tenggat tahap approval yang sedang berjalan untuk satu request (berdasar judul) lewat SQL, lalu jalankan pemindaian SLA backend (scripts/run-approval-sla-scan.ts). Butuh V2_BACKEND_DIR dan psql.',
  pengecualianDb: true,
  argumen: z
    .object({ judulRequest: z.string().min(3).describe('judul request, mis. nomor PO') })
    .strict(),
  urai: () => 'Majukan tenggat lewat SQL, jalankan pemindaian SLA',
  async jalankan(ctx, a) {
    const judul = a.judulRequest.replaceAll("'", '')
    const sql = `update approval_request_steps set due_at = (now() at time zone 'utc') - interval '1 minute'
      where status = 'PENDING' and activated_at is not null
      and request_id = (select id from approval_requests where title = '${judul}' and status = 'PENDING') returning 1`
    const rows = execFileSync('psql', [dbUrl(), '-At', '-c', sql], { encoding: 'utf8' }).trim()
    ctx.log(`baris diubah: ${rows || 0}`)
    if (!rows) throw new Error(`Tidak ada tahap berjalan untuk request "${judul}"`)
    const out = execFileSync('bun', ['run', 'scripts/run-approval-sla-scan.ts'], {
      cwd: backendDir(),
      encoding: 'utf8',
    })
    ctx.log(out.trim().split('\n').slice(-3).join(' | '))
  },
})

// Perkakas skenario. Semua tahanan lewat controller, jadi mengikuti jeda, kecepatan, dan
// mode headless. Pencarian master (gudang, bengkel, unit) lewat API supaya skenario tidak
// menyimpan id dari DB tertentu.
import type { APIRequestContext, Locator, Page } from 'playwright'
import * as lib from './lib.ts'
import type { ApiResult, ApiTarget, BaseCtx, Body } from './types.ts'

/** Tahanan bawaan klik/isian dan banner (nominal, diskalakan controller). */
export const HOLD = 3500
export const STEP = 5000
const LIST_TIMEOUT = 10_000

/** Tahan `ms` milidetik (diskalakan controller). */
export const hold = (ms: number) => lib.controller().hold(ms)

/** Kembalikan body bila status 2xx; selain itu lempar galat berlabel. */
export const ok = (res: ApiResult, label: string): Body => {
  if (res.status >= 300)
    throw new Error(`${label}: HTTP ${res.status} ${JSON.stringify(res.body)?.slice(0, 300)}`)
  return res.body
}

/** Banner, klik/isi terlihat, pilih opsi, panel approval. `total` = jumlah langkah. */
export function kit({ total }: { total?: number } = {}) {
  const say = async (page: Page, text: string, ms = STEP) => {
    await lib.caption(page, text)
    await hold(ms)
  }
  const step = (page: Page, n: number, text: string, ms = STEP) =>
    say(page, total ? `${n}/${total} · ${text}` : text, ms)
  const click = (page: Page, loc: Locator, ms = HOLD) => lib.showClick(page, loc, ms)
  const fill = (page: Page, loc: Locator, v: string, ms = HOLD) => lib.showFill(page, loc, v, ms)
  /** Buka combobox lalu pilih opsi (nama atau pola). */
  const pick = async (page: Page, combo: Locator, option: string | RegExp) => {
    await click(page, combo, 2200)
    const lb = page.getByRole('listbox')
    await lb.waitFor({ timeout: LIST_TIMEOUT })
    await hold(1200)
    await click(page, lb.getByRole('option', { name: option }).first(), 600)
    await lb.waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => {})
    await hold(700)
  }
  /** Ketik di autocomplete lalu pilih opsi pertama yang memuat `match`. */
  const search = async (page: Page, combo: Locator, typed: string, match: string | RegExp) => {
    await fill(page, combo, typed, 2200)
    const opt = page.getByRole('option').filter({ hasText: match, visible: true }).first()
    await opt.waitFor({ timeout: LIST_TIMEOUT })
    await click(page, opt, 800)
    await hold(700)
  }
  /** Kartu panel Persetujuan di halaman dokumen. */
  const panel = async (page: Page) => {
    const head = page.getByText('Persetujuan', { exact: true }).filter({ visible: true }).first()
    await head.waitFor({ timeout: 20_000 })
    const card = head.locator(
      'xpath=ancestor::div[contains(@class,"MuiCard-root") or contains(@class,"MuiPaper-root")][1]',
    )
    await card.scrollIntoViewIfNeeded()
    return card
  }
  const text = (page: Page) => page.locator('body').innerText()
  return { say, step, click, fill, pick, search, panel, text, hold }
}

type Kit = ReturnType<typeof kit>

/** Pilih satu mekanik di multi-select "Mekanik" pada dialog; memastikan pilihan tercatat. */
export async function chooseMechanic(
  page: Page,
  k: Kit,
  dlg: Locator,
  name: string | RegExp = /Made Mekanik/,
  label: string | RegExp = /^Mekanik/,
) {
  const crew = dlg.getByRole('combobox', { name: label }).last()
  for (let attempt = 0; attempt < 3; attempt++) {
    await k.click(page, crew, 2200)
    const opt = page.getByRole('option', { name }).first()
    await opt.waitFor({ timeout: LIST_TIMEOUT })
    await hold(1200)
    await page.waitForTimeout(500)
    await opt.click()
    await page.waitForTimeout(600)
    await page.keyboard.press('Escape')
    await hold(1200)
    await page.waitForTimeout(400)
    if (/Made/.test(await dlg.innerText())) return
  }
  throw new Error('Mekanik tidak terpilih di dialog')
}

/** Pilih opsi combobox berlabel tanpa tahanan panjang (untuk isian sampingan). */
export async function pickOption(page: Page, label: string | RegExp, optionName: string | RegExp) {
  await lib.controller().gate()
  await page.getByRole('combobox', { name: label }).click({ timeout: LIST_TIMEOUT })
  const option = page.getByRole('option', { name: optionName })
  await option.first().waitFor({ state: 'visible', timeout: LIST_TIMEOUT })
  await page.waitForTimeout(300)
  await option.first().click({ timeout: LIST_TIMEOUT })
  await page
    .getByRole('listbox')
    .waitFor({ state: 'hidden', timeout: 5_000 })
    .catch(() => {})
}

// Satu foto lewat jalur "tempel URL" (penyimpanan media lokal biasanya tidak dikonfigurasi).
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
export async function addPhotoByUrl(page: Page, scope: Locator, url: string) {
  await lib.controller().gate()
  await scope
    .locator('input[type=file]')
    .first()
    .setInputFiles({ name: 'foto.png', mimeType: 'image/png', buffer: PNG })
  const field = scope.getByPlaceholder(/paste a file URL|tempel URL/i)
  await field.waitFor({ timeout: LIST_TIMEOUT })
  await field.fill(url)
  await field
    .locator('xpath=ancestor::div[contains(@class,"MuiStack-root")][1]')
    .getByRole('button')
    .click()
  await page.waitForTimeout(500)
}

/** Stempel waktu pendek untuk SKU/kode data uji (unik per jalan). */
export const stamp = () =>
  new Date()
    .toISOString()
    .replaceAll(/[-:T.Z]/g, '')
    .slice(2, 14)

/** URL foto contoh yang dipakai jalur "tempel URL". */
export const photoUrl = (name: string) => `https://qa.fleetify.test/skenario/${name}.png`

// ── Master lewat API (tanpa id tertulis di skenario) ───────────────────────
async function findOne(
  target: ApiTarget,
  url: string,
  match: (row: Body) => boolean,
  what: string,
): Promise<Body> {
  const res = await lib.apiGet(target, url)
  const row = lib.rows(ok(res, `cari ${what}`)).find(match)
  if (!row) throw new Error(`${what} tidak ditemukan`)
  return row
}

/** Gudang berdasarkan nama atau kode (mis. "Gudang Site Alpha" / "WH-ALPHA"). */
export const findWarehouse = (target: ApiTarget, nameOrCode: string) =>
  findOne(
    target,
    '/inventory/warehouses',
    (w) => w.name === nameOrCode || w.code === nameOrCode,
    `Gudang ${nameOrCode}`,
  )

/** Bengkel internal (lokasi bengkel) berdasarkan nama, mis. "Workshop Site Alpha". */
export async function findWorkshop(target: ApiTarget, name: string): Promise<Body> {
  const body = ok(await lib.apiGet(target, '/work-orders/workshop-options'), 'cari bengkel')
  const ws = (body?.internal ?? []).find((w: Body) => w.name === name)
  if (!ws) throw new Error(`Bengkel ${name} tidak ditemukan`)
  return ws
}

/** Unit berdasarkan nomor lambung atau pelat, mis. "DT-014". */
export const findVehicle = (target: ApiTarget, code: string) =>
  findOne(
    target,
    `/fleet/vehicles?search=${encodeURIComponent(code)}&limit=10`,
    (v) => v.lambung_id === code || v.license_number === code,
    `Unit ${code}`,
  )

/** Alur persetujuan berdasarkan nama, mis. "Approval Purchase Order". */
export const findApprovalFlow = (target: ApiTarget, name: string) =>
  findOne(target, '/approval/flows', (f) => f.name === name, `Alur persetujuan ${name}`)

interface NewItemOptions {
  sku: string
  name: string
  kind?: 'SPAREPART' | 'CONSUMABLE' | 'TOOL'
  quantity?: number
  /** Isi untuk barang SERIAL (jumlah = banyak seri); tanpa ini barang tidak dilacak. */
  serials?: string[]
  price?: string
}

/**
 * Barang baru dengan saldo awal di satu gudang, lewat API item. Saldo awal sah karena barang
 * belum pernah masuk gudang, jadi skenario bisa diulang tanpa bergantung pada stok lama.
 */
export async function newItem(
  ctx: BaseCtx,
  rc: APIRequestContext,
  whId: string,
  { sku, name, kind = 'SPAREPART', quantity, serials, price = '100000' }: NewItemOptions,
): Promise<Body> {
  const qty = serials ? serials.length : quantity
  if (!qty) throw new Error(`newItem ${sku}: isi quantity atau serials`)
  const item = ok(
    await ctx.api.send(rc, 'POST', '/inventory/items', {
      sku,
      name,
      item_kind: kind,
      tracking_enabled: !!serials,
      tracking_type: serials ? 'SERIAL' : null,
      description: 'Dibuat Scenario Runner untuk satu jalan',
      units: [{ name: 'PCS', ratio: 1, purchase_price_rupiah: price, sale_price_rupiah: price }],
      opening_balances: [
        {
          warehouse_id: whId,
          date: new Date().toISOString().slice(0, 10),
          quantity: qty,
          unit_cost_rupiah: price,
          ...(serials ? { tracking: serials.map((code) => ({ code, quantity: 1 })) } : {}),
        },
      ],
    }),
    `buat barang ${sku}`,
  )
  ctx.log(`Barang ${sku} dibuat, saldo awal ${qty}`)
  return item
}

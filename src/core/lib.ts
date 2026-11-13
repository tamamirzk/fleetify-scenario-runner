// Harness browser: launch, sesi admin, impersonasi persona, API, dan aksi terlihat
// (banner, kursor, bingkai) yang melewati gerbang controller (jeda, satu aksi, hentikan).
// Satu jendela per jalan: asPersona() sekali, ganti akun lewat become(),
// persona lain di belakang layar lewat apiAs() (sesi API tanpa jendela).
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import {
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  chromium,
  type Locator,
  type Page,
  request,
} from 'playwright'
import { config } from './config.ts'
import { type PersonaId, personaName } from './personas.ts'
import type { ApiResult, ApiTarget, Body } from './types.ts'

export { personaName }

const OWNER_STATE = path.join(config.cacheDir, 'owner-state.json')
const HEADED_SLOWMO = 250
const VIEWPORT = { width: 1400, height: 900 }

// ── Controller (diganti oleh Run; bawaan: tanpa jeda, tahanan apa adanya) ──
export interface Gate {
  gate(): Promise<void>
  hold(ms: number): Promise<void>
  log(line: string): void
}
let ctl: Gate = {
  gate: async () => {},
  hold: (ms) => new Promise((r) => setTimeout(r, ms)),
  log: () => {},
}
export const setController = (c: Gate) => {
  ctl = c
}
export const controller = (): Gate => ctl

// ── Browser ─────────────────────────────────────────────────────────────────
export function launch({ headed = false }: { headed?: boolean } = {}): Promise<Browser> {
  return chromium.launch({
    headless: !headed,
    slowMo: config.slowMo ?? (headed ? HEADED_SLOWMO : 0),
    args: [
      '--disable-features=Translate,TranslateUI',
      '--lang=id-ID',
      ...(headed ? ['--window-size=1440,1000'] : []),
      ...(headed && config.windowPos ? [`--window-position=${config.windowPos}`] : []),
    ],
  })
}

/**
 * Satu browser untuk semua jalan dalam satu proses (panel). Tiap jalan membuka konteks
 * sendiri dan hanya menutup konteksnya: meluncurkan browser baru per jalan di bawah Bun
 * membuat jendela jalan kedua langsung tertutup.
 */
let shared: { browser: Browser; headed: boolean } | null = null
export async function sharedBrowser({ headed = false }: { headed?: boolean } = {}) {
  if (shared?.browser.isConnected() && shared.headed === headed) return shared.browser
  const browser = await launch({ headed })
  shared = { browser, headed }
  browser.on('disconnected', () => {
    if (shared?.browser === browser) shared = null
  })
  return browser
}

// ── API ─────────────────────────────────────────────────────────────────────
async function api(target: ApiTarget, method: string, url: string, data?: unknown) {
  const req: APIRequestContext = 'request' in target ? target.request : target
  const res = await req.fetch(`${config.apiUrl}${url}`, { method, data })
  let body: Body = null
  try {
    body = await res.json()
  } catch {
    body = null
  }
  return { status: res.status(), body } satisfies ApiResult
}
export const apiGet = (target: ApiTarget, url: string) => api(target, 'GET', url)
export const apiSend = (target: ApiTarget, method: string, url: string, data?: unknown) =>
  api(target, method, url, data)

/** Daftar dari respons berhalaman (`{ data: [...] }`) atau array polos. */
export const rows = (body: Body): Body[] => (Array.isArray(body) ? body : (body?.data ?? []))

// ── Sesi admin platform ─────────────────────────────────────────────────────
function ownerCredentials() {
  const { ownerEmail: email, ownerPassword: password } = config
  if (!email || !password)
    throw new Error(
      'OWNER_EMAIL dan OWNER_PASSWORD belum diisi di .env (akun admin platform lokal)',
    )
  return { email, password }
}

async function ownerStateValid() {
  if (!existsSync(OWNER_STATE)) return false
  const rc = await request.newContext({ storageState: OWNER_STATE })
  try {
    return (await apiGet(rc, '/auth/me')).status === 200
  } finally {
    await rc.dispose()
  }
}

async function loginOwner(page: Page) {
  const { email, password } = ownerCredentials()
  await page.goto(config.webUrl)
  // Form Authentik = web component: fill() tidak memicu validasinya, jadi ketik per karakter.
  const uid = page.locator('input[name=uidField]')
  await uid.click({ timeout: 30_000 })
  await uid.pressSequentially(email)
  await page.keyboard.press('Enter')
  const pass = page.locator('input[name=password]')
  await pass.click({ timeout: 30_000 })
  await pass.pressSequentially(password)
  await page.getByRole('button', { name: /continue|log in|masuk/i }).click()
  await page
    .waitForURL((u) => u.toString().startsWith(config.webUrl), { timeout: 30_000 })
    .catch(() => {})
  await page.goto(config.webUrl)
  const me = await apiGet(page, '/auth/me')
  if (me.status !== 200) throw new Error(`Login admin gagal: /auth/me ${me.status}`)
  mkdirSync(path.dirname(OWNER_STATE), { recursive: true })
  await page.context().storageState({ path: OWNER_STATE })
}

/** Pastikan sesi admin tersimpan di .cache/. Bila kedaluwarsa, login di browser headless sementara. */
export async function ensureOwner() {
  if (await ownerStateValid()) return
  const b = await launch({ headed: false })
  try {
    const ctx = await b.newContext()
    await loginOwner(await ctx.newPage())
  } finally {
    await b.close()
  }
}

// ── Persona ─────────────────────────────────────────────────────────────────
interface Tenant {
  companyId: string
  members: Body[]
}
let tenantCache: Tenant | null = null

async function tenant(target: ApiTarget): Promise<Tenant> {
  if (tenantCache) return tenantCache
  const slug = config.tenantSlug
  const companies = await apiGet(target, `/platform/companies?search=${slug}&limit=50`)
  const company = rows(companies.body).find((c) => c.slug === slug)
  if (!company) throw new Error(`Tenant ${slug} tidak ditemukan (status ${companies.status})`)
  const members = await apiGet(target, `/platform/companies/${company.id}/members?limit=200`)
  tenantCache = { companyId: company.id, members: rows(members.body) }
  return tenantCache
}

const memberEmail = (m: Body): string => m.email ?? m.user?.email ?? ''

function findMember(t: Tenant, who: PersonaId) {
  const member = t.members.find((m) => memberEmail(m).startsWith(`${who}@`))
  if (!member) throw new Error(`Persona ${who} tidak ada di anggota tenant ${config.tenantSlug}`)
  return {
    userId: String(member.user_id ?? member.user?.id ?? member.id),
    email: memberEmail(member),
  }
}

/** Id pengguna persona (mis. untuk mechanic_ids atau penerima serah terima). Butuh sesi admin. */
export async function personaUserId(who: PersonaId): Promise<string> {
  await ensureOwner()
  const rc = await request.newContext({ storageState: OWNER_STATE })
  try {
    return findMember(await tenant(rc), who).userId
  } finally {
    await rc.dispose()
  }
}

async function impersonate(target: ApiTarget, who: PersonaId) {
  const t = await tenant(target)
  const { userId, email } = findMember(t, who)
  const res = await apiSend(
    target,
    'POST',
    `/platform/companies/${t.companyId}/members/${userId}/impersonate`,
  )
  if (res.status >= 300)
    throw new Error(`Impersonasi ${email} gagal: ${res.status} ${JSON.stringify(res.body)}`)
  const me = await apiGet(target, '/auth/me')
  const meEmail = me.body?.email ?? me.body?.user?.email
  if (meEmail !== email) throw new Error(`Sesi bukan ${email} (dapat ${meEmail})`)
  return { companyId: t.companyId, email }
}

/** Sesi API persona lain tanpa jendela. Tutup dengan `.dispose()`. */
export async function apiAs(who: PersonaId): Promise<APIRequestContext> {
  await ensureOwner()
  const rc = await request.newContext({ storageState: OWNER_STATE })
  await impersonate(rc, who)
  return rc
}

/** Konteks utama (satu-satunya jendela) sebagai persona. Panggil sekali per jalan. */
export async function asPersona(
  browser: Browser,
  who: PersonaId,
  { trace = true }: { trace?: boolean } = {},
): Promise<{ ctx: BrowserContext; page: Page; email: string; companyId: string }> {
  await ensureOwner()
  const ctx = await browser.newContext({ storageState: OWNER_STATE, viewport: VIEWPORT })
  await ctx.addInitScript(() => {
    localStorage.setItem('fleetify_lang', 'id')
    localStorage.setItem('fleetify_setup_done', '1')
  })
  if (trace) await ctx.tracing.start({ screenshots: true, snapshots: true })
  const page = await ctx.newPage()
  const { companyId, email } = await impersonate(page, who)
  return { ctx, page, email, companyId }
}

/** Tutup modal sambutan pertama kali, hanya di dalam dialog (jangan klik navigasi). */
export async function dismissWelcome(page: Page) {
  const skip = page.locator('[role=dialog]').getByRole('button', { name: /^(skip|lewati)$/i })
  const shown = await skip
    .waitFor({ state: 'visible', timeout: 5_000 })
    .then(() => true)
    .catch(() => false)
  if (shown) {
    await skip.click()
    await page
      .locator('[role=dialog]')
      .waitFor({ state: 'hidden', timeout: 5_000 })
      .catch(() => {})
  }
}

export async function open(page: Page, route: string) {
  await ctl.gate()
  // Bukan menunggu "load": halaman dasbor kadang tidak pernah selesai memuat semua sumber.
  await page.goto(`${config.webUrl}${route}`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle').catch(() => {})
  await dismissWelcome(page)
  await page.waitForLoadState('networkidle').catch(() => {})
}

// ── Tampilan: banner langkah, kursor merah, bingkai target ──────────────────
export async function caption(page: Page, text: string) {
  await ctl.gate()
  ctl.log(`▶ ${text}`)
  await page
    .evaluate((t) => {
      let b = document.getElementById('sr-caption')
      if (!b) {
        b = document.createElement('div')
        b.id = 'sr-caption'
        Object.assign(b.style, {
          position: 'fixed',
          top: '0',
          left: '0',
          right: '0',
          zIndex: '2147483647',
          background: 'rgba(26,29,33,.92)',
          color: '#FFDB0E',
          font: '600 18px Inter, Arial, sans-serif',
          padding: '12px 20px',
          textAlign: 'center',
          pointerEvents: 'none',
        })
        document.body.appendChild(b)
      }
      b.textContent = t
    }, text)
    .catch(() => {})
}

async function pointAt(page: Page, locator: Locator, ms: number) {
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  if (!box) return
  await page.evaluate(
    ({ x, y, w, h }) => {
      let c = document.getElementById('sr-cursor')
      if (!c) {
        c = document.createElement('div')
        c.id = 'sr-cursor'
        Object.assign(c.style, {
          position: 'fixed',
          width: '22px',
          height: '22px',
          borderRadius: '50%',
          zIndex: '2147483647',
          background: 'rgba(229,72,77,.85)',
          border: '3px solid #fff',
          boxShadow: '0 0 0 2px #E5484D',
          pointerEvents: 'none',
          transition: 'left .6s ease, top .6s ease',
          left: '50%',
          top: '50%',
        })
        document.body.appendChild(c)
      }
      c.style.left = `${x + w / 2 - 11}px`
      c.style.top = `${y + h / 2 - 11}px`
      let f = document.getElementById('sr-frame')
      if (!f) {
        f = document.createElement('div')
        f.id = 'sr-frame'
        Object.assign(f.style, {
          position: 'fixed',
          zIndex: '2147483646',
          border: '3px solid #FFDB0E',
          borderRadius: '8px',
          pointerEvents: 'none',
        })
        document.body.appendChild(f)
      }
      Object.assign(f.style, {
        left: `${x - 6}px`,
        top: `${y - 6}px`,
        width: `${w + 12}px`,
        height: `${h + 12}px`,
        display: 'block',
      })
    },
    { x: box.x, y: box.y, w: box.width, h: box.height },
  )
  await ctl.hold(ms)
}

/** Gerbang, arahkan kursor, tahan, gerbang lagi (jeda tepat sebelum klik), lalu klik. */
export async function showClick(page: Page, locator: Locator, ms = 1500) {
  await ctl.gate()
  await pointAt(page, locator, ms)
  await ctl.gate()
  await locator.click()
}

/** Gerbang, arahkan kursor, tahan, lalu isi. */
export async function showFill(page: Page, locator: Locator, value: string, ms = 1200) {
  await ctl.gate()
  await pointAt(page, locator, ms)
  await ctl.gate()
  await locator.fill(value)
  await page.waitForTimeout(600)
}

/** Ganti persona di jendela yang sama: keluar dari impersonasi, impersonasi baru, muat ulang. */
export async function become(
  page: Page,
  who: PersonaId,
  { caption: text }: { caption?: string } = {},
) {
  await ctl.gate()
  if (text) await caption(page, text)
  await apiSend(page, 'POST', '/auth/impersonation/exit')
  await impersonate(page, who)
  await page.reload()
  await page.bringToFront()
  if (text) await caption(page, text)
}

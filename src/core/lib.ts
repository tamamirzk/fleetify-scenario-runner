// Harness browser: launch, sesi admin, impersonasi persona, API, dan aksi terlihat
// (kursor, bingkai, cincin target di panel) yang melewati gerbang controller (jeda, satu aksi, hentikan).
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
import type { TargetAksi } from './controller.ts'
import { type PersonaId, pakaiPonsel, personaName } from './personas.ts'
import { TAMPILAN_BAWAAN, type Tampilan, viewportPersona } from './tampilan.ts'
import type { ApiResult, ApiTarget, Body } from './types.ts'

export { personaName }

/** Sesi admin per web (slot memakai nama cookie dan port sendiri); bawaan tetap owner-state.json. */
const ownerState = () => {
  const port = new URL(config.webUrl).port
  return path.join(
    config.cacheDir,
    !port || port === '5173' ? 'owner-state.json' : `owner-state-${port}.json`,
  )
}
const HEADED_SLOWMO = 250

// ── Controller (diganti oleh Run; bawaan: tanpa jeda, tahanan apa adanya) ──
export interface Gate {
  gate(): Promise<void>
  hold(ms: number): Promise<void>
  log(line: string): void
  /** Sasaran aksi berikutnya untuk cincin target di panel (null = hapus). */
  setTarget?(t: TargetAksi | null): void
  /** Teks aksi `banner`: tampil di kartu deskripsi panel, tidak digambar di halaman. */
  setKeterangan?(t: string | null): void
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
  // Mode berganti (tuas "Tampilkan jendela browser" di panel): browser lama ditutup, bukan dibiarkan.
  if (shared?.browser.isConnected()) await closeSharedBrowser()
  const browser = await launch({ headed })
  shared = { browser, headed }
  browser.on('disconnected', () => {
    if (shared?.browser === browser) shared = null
  })
  return browser
}

/** Tutup browser bersama (panel berhenti). Di bawah Bun close() kadang menggantung: batasi 5 dtk. */
export async function closeSharedBrowser() {
  const b = shared?.browser
  shared = null
  await Promise.race([b?.close().catch(() => {}), new Promise((r) => setTimeout(r, 5000))])
}

// ── API ─────────────────────────────────────────────────────────────────────
/** Pendengar request API (dipasang Run untuk mencatat request tulis per langkah). */
type PendengarApi = (x: { method: string; url: string; status: number; durasiMs: number }) => void
let pendengarApi: PendengarApi | null = null
export const setApiListener = (p: PendengarApi | null) => {
  pendengarApi = p
}

async function api(target: ApiTarget, method: string, url: string, data?: unknown) {
  const req: APIRequestContext = 'request' in target ? target.request : target
  const t0 = Date.now()
  const full = `${config.apiUrl}${url}`
  const res = await req.fetch(full, { method, data })
  pendengarApi?.({ method, url: full, status: res.status(), durasiMs: Date.now() - t0 })
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
  if (!existsSync(ownerState())) return false
  const rc = await request.newContext({ storageState: ownerState() })
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
  mkdirSync(path.dirname(ownerState()), { recursive: true })
  await page.context().storageState({ path: ownerState() })
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
  const rc = await request.newContext({ storageState: ownerState() })
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
  const rc = await request.newContext({ storageState: ownerState() })
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
  const ctx = await browser.newContext({
    storageState: ownerState(),
    // Tampilan aplikasi: viewport CSS = ukuran ÷ skala, deviceScaleFactor = skala (core/tampilan.ts);
    // persona lapangan (driver, mekanik) mulai di ukuran ponsel.
    viewport: viewportPersona(tampilanAktif, pakaiPonsel(who)),
    deviceScaleFactor: tampilanAktif.skala,
  })
  await ctx.addInitScript(() => {
    localStorage.setItem('fleetify_lang', 'id')
    localStorage.setItem('fleetify_setup_done', '1')
  })
  if (trace) await ctx.tracing.start({ screenshots: true, snapshots: true })
  const page = await ctx.newPage()
  const { companyId, email } = await impersonate(page, who)
  return { ctx, page, email, companyId }
}

/** Tampilan aplikasi jalan ini (ukuran layar + skala); bawaan 1400×900 · 100 %. */
let tampilanAktif: Tampilan = TAMPILAN_BAWAAN
export function setTampilan(t: Tampilan) {
  tampilanAktif = t
}
export const tampilan = (): Tampilan => tampilanAktif

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

// ── Tampilan: keterangan (di panel), kursor, bingkai, cincin target ─────────
/**
 * Keterangan aksi `banner` (dan "Ganti akun"). TIDAK menggambar apa pun di halaman: teks dikirim ke panel (kartu deskripsi langkah) dan log/CLI, sehingga screenshot
 * dan tampilan langsung bersih. Gerbang jeda/satu aksi tetap berlaku; tahanannya diatur pemanggil.
 */
export async function caption(_page: Page, text: string) {
  await ctl.gate()
  ctl.log(`▶ ${text}`)
  ctl.setKeterangan?.(text)
}

async function pointAt(page: Page, locator: Locator, ms: number) {
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  if (!box) return
  const vp = page.viewportSize()
  if (vp && ctl.setTarget) ctl.setTarget(targetRelatif(box, vp))
  await page.evaluate(
    ({ x, y, w, h }) => {
      let c = document.getElementById('sr-cursor')
      if (!c) {
        c = document.createElement('div')
        c.id = 'sr-cursor'
        Object.assign(c.style, {
          position: 'fixed',
          width: '14px',
          height: '14px',
          borderRadius: '50%',
          zIndex: '2147483647',
          background: 'rgba(229,72,77,.9)',
          border: '2px solid #fff',
          boxShadow: '0 0 0 1px #E5484D',
          pointerEvents: 'none',
          transition: 'left .6s ease, top .6s ease',
          left: '50%',
          top: '50%',
        })
        document.body.appendChild(c)
      }
      // Kursor di pojok kanan bawah sasaran, tidak menutupi teks tombol/isian.
      c.style.left = `${x + w - 9}px`
      c.style.top = `${y + h - 9}px`
      let f = document.getElementById('sr-frame')
      if (!f) {
        f = document.createElement('div')
        f.id = 'sr-frame'
        Object.assign(f.style, {
          position: 'fixed',
          zIndex: '2147483646',
          border: '2px solid #FF9F0A',
          borderRadius: '8px',
          boxSizing: 'border-box',
          pointerEvents: 'none',
        })
        document.body.appendChild(f)
      }
      Object.assign(f.style, {
        left: `${x - 4}px`,
        top: `${y - 4}px`,
        width: `${w + 8}px`,
        height: `${h + 8}px`,
        display: 'block',
      })
    },
    { x: box.x, y: box.y, w: box.width, h: box.height },
  )
  await ctl.hold(ms)
}

/** bbox px → koordinat relatif viewport (0–1), dipotong ke tepi layar. */
export function targetRelatif(
  box: { x: number; y: number; width: number; height: number },
  vp: { width: number; height: number },
): TargetAksi {
  const r = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 10_000) / 10_000
  const x = r(box.x / vp.width)
  const y = r(box.y / vp.height)
  return {
    bbox: {
      x,
      y,
      w: r(Math.min(box.width / vp.width, 1 - x)),
      h: r(Math.min(box.height / vp.height, 1 - y)),
    },
    viewport: { w: vp.width, h: vp.height },
  }
}

/** Sembunyikan kursor dan bingkai (sebelum screenshot Pemeriksaan UI). */
export async function hapusPenunjuk(page: Page) {
  await page
    .evaluate(() => {
      for (const id of ['sr-cursor', 'sr-frame']) document.getElementById(id)?.remove()
    })
    .catch(() => {})
}

/**
 * Lapor sasaran sebelum gerbang pertama, supaya saat dijeda di depan aksi ini cincin target sudah ada.
 * Hanya bila elemen sudah tampil di layar (yang di luar layar dilapor pointAt sesudah digulir).
 */
async function laporSasaran(page: Page, locator: Locator) {
  if (!ctl.setTarget) return
  const box = await locator.boundingBox({ timeout: 800 }).catch(() => null)
  const vp = page.viewportSize()
  if (!box || !vp) return
  if (box.y < 0 || box.x < 0 || box.y + box.height > vp.height || box.x + box.width > vp.width)
    return
  ctl.setTarget(targetRelatif(box, vp))
}

/** Gerbang, arahkan kursor, tahan, gerbang lagi (jeda tepat sebelum klik), lalu klik. */
export async function showClick(page: Page, locator: Locator, ms = 1500) {
  await laporSasaran(page, locator)
  await ctl.gate()
  await pointAt(page, locator, ms)
  await ctl.gate()
  await locator.click()
  ctl.setTarget?.(null)
}

/** Gerbang, arahkan kursor, tahan, lalu isi (atau ketik per huruf). */
export async function showFill(
  page: Page,
  locator: Locator,
  value: string,
  ms = 1200,
  perHuruf = false,
) {
  await laporSasaran(page, locator)
  await ctl.gate()
  await pointAt(page, locator, ms)
  await ctl.gate()
  if (perHuruf) {
    await locator.fill('')
    await locator.pressSequentially(value, { delay: 25 })
  } else await locator.fill(value)
  ctl.setTarget?.(null)
  await page.waitForTimeout(400)
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
  // Driver dan mekanik memakai ponsel: jendela yang sama berganti ukuran sebelum dimuat ulang.
  const vp = viewportPersona(tampilanAktif, pakaiPonsel(who))
  const kini = page.viewportSize()
  if (kini?.width !== vp.width || kini?.height !== vp.height) await page.setViewportSize(vp)
  await page.reload()
  await page.bringToFront()
  if (text) await caption(page, text)
}

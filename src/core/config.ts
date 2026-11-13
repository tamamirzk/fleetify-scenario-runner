// Konfigurasi dari .env di akar repo, divalidasi zod. Tidak ada nilai pribadi bawaan:
// akun admin wajib diisi tiap developer, dan URL dibatasi ke mesin lokal.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'

export const ROOT = path.resolve(import.meta.dirname, '../..')

/** Bun hanya memuat .env dari direktori kerja; berkas di akar repo dimuat juga dari mana pun. */
export function readDotEnv(file: string): Record<string, string> {
  if (!existsSync(file)) return {}
  const out: Record<string, string> = {}
  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    const value = line
      .slice(eq + 1)
      .trim()
      .replace(/^(['"])(.*)\1$/, '$2')
    out[key] = value
  }
  return out
}

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]'])
const flag = z
  .string()
  .optional()
  .transform((v) => v === '1' || v === 'true')

const Schema = z
  .object({
    FLEETIFY_WEB_URL: z.url().default('http://localhost:5173'),
    FLEETIFY_API_URL: z.url().optional(),
    ALLOW_NON_LOCAL: flag,
    OWNER_EMAIL: z.email().optional(),
    OWNER_PASSWORD: z.string().min(1).optional(),
    TENANT_SLUG: z.string().min(1).default('mbl'),
    RUNNER_PORT: z.coerce.number().int().min(1024).max(65535).default(4800),
    WINDOW_POS: z
      .string()
      .regex(/^-?\d+,-?\d+$/, 'format x,y, mis. 0,0')
      .optional(),
    SLOWMO: z.coerce.number().int().min(0).optional(),
    HEADLESS: flag,
    HEADLESS_HOLD: z.coerce.number().min(0).max(1).default(0.15),
    TEMUAN_FILE: z.string().default('docs/TEMUAN.md'),
    TICKET_URL: z.url().optional(),
    V2_BACKEND_DIR: z.string().optional(),
  })
  .superRefine((c, ctx) => {
    if (c.ALLOW_NON_LOCAL) return
    for (const key of ['FLEETIFY_WEB_URL', 'FLEETIFY_API_URL'] as const) {
      const v = c[key]
      if (v && !LOCAL_HOSTS.has(new URL(v).hostname))
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'hanya untuk server lokal; jangan arahkan ke staging atau produksi',
        })
    }
  })

export type Config = ReturnType<typeof loadConfig>

export function loadConfig(env: Record<string, string | undefined>) {
  const parsed = Schema.safeParse(
    Object.fromEntries(Object.entries(env).filter(([, v]) => v !== '')),
  )
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`)
    throw new Error(`Konfigurasi .env tidak sah:\n${lines.join('\n')}`)
  }
  const c = parsed.data
  return {
    webUrl: c.FLEETIFY_WEB_URL.replace(/\/$/, ''),
    apiUrl: (c.FLEETIFY_API_URL ?? `${c.FLEETIFY_WEB_URL.replace(/\/$/, '')}/api/v1`).replace(
      /\/$/,
      '',
    ),
    ownerEmail: c.OWNER_EMAIL,
    ownerPassword: c.OWNER_PASSWORD,
    tenantSlug: c.TENANT_SLUG,
    port: c.RUNNER_PORT,
    windowPos: c.WINDOW_POS,
    slowMo: c.SLOWMO,
    headless: c.HEADLESS,
    headlessHold: c.HEADLESS_HOLD,
    temuanFile: path.resolve(ROOT, c.TEMUAN_FILE),
    ticketUrl: c.TICKET_URL ?? null,
    v2BackendDir: c.V2_BACKEND_DIR ? path.resolve(ROOT, c.V2_BACKEND_DIR) : null,
    cacheDir: path.join(ROOT, '.cache'),
    runsDir: path.join(ROOT, 'runs'),
    scenariosDir: path.join(ROOT, 'scenarios'),
  }
}

export const config = loadConfig({ ...readDotEnv(path.join(ROOT, '.env')), ...process.env })

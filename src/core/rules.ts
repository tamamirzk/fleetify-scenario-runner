// Aturan standar skenario yang dicek otomatis (bun run check:scenarios). Murni, bisa diuji.
import { MetaSchema } from './meta.ts'
import { PERSONA_IDS } from './personas.ts'
import type { Scenario } from './types.ts'

const STEP_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/

/** Aksi Playwright mentah tidak melewati gerbang jeda. Pakai ctx.k.click/fill/pick/search. */
const RAW_ACTION =
  /([\w$]+|\)|\])\s*\.(click|fill|press|pressSequentially|type|check|uncheck|selectOption|setInputFiles|dblclick|tap)\(/g
const RAW_WAIT = /\.waitForTimeout\(/
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const DIRECT_DB = /node:child_process|\bpsql\b|DATABASE_URL/

export interface Problem {
  rule: string
  message: string
  line?: number
}

/** Periksa teks berkas skenario per baris (komentar ikut diperiksa, kecuali baris komentar penuh). */
export function lintSource(source: string, { pengecualianDb = false } = {}): Problem[] {
  const out: Problem[] = []
  source.split('\n').forEach((raw, idx) => {
    const line = idx + 1
    if (raw.trim().startsWith('//') || raw.trim().startsWith('*')) return
    if ([...raw.matchAll(RAW_ACTION)].some((m) => m[1] !== 'k'))
      out.push({
        rule: 'aksi-lewat-helper',
        line,
        message: 'aksi Playwright mentah; pakai ctx.k.click/fill/pick/search supaya bisa dijeda',
      })
    if (RAW_WAIT.test(raw))
      out.push({
        rule: 'tahan-lewat-ctx',
        line,
        message: 'waitForTimeout tidak mengikuti jeda/kecepatan; pakai ctx.wait(ms)',
      })
    if (UUID.test(raw))
      out.push({
        rule: 'tanpa-id-tertulis',
        line,
        message: 'id dari DB tertentu; cari lewat API (ctx.kit.findWarehouse/findVehicle/…)',
      })
    if (DIRECT_DB.test(raw) && !pengecualianDb)
      out.push({
        rule: 'db-lewat-api',
        line,
        message: 'akses DB/proses luar; DB hanya lewat API kecuali meta.pengecualian db-lewat-api',
      })
  })
  return out
}

/** Periksa struktur skenario yang sudah dimuat. */
export function checkScenario(id: string, s: Scenario): Problem[] {
  const out: Problem[] = []
  const meta = MetaSchema.safeParse(s.meta)
  if (!meta.success) {
    for (const i of meta.error.issues)
      out.push({ rule: 'meta-lengkap', message: `meta.${i.path.join('.')}: ${i.message}` })
    return out
  }
  const m = meta.data
  if (m.id !== id)
    out.push({
      rule: 'satu-berkas',
      message: `meta.id "${m.id}" harus sama dengan nama berkas "${id}"`,
    })
  if (m.setelan.length > 0 && !s.cleanup && !m.setelanMenetap)
    out.push({
      rule: 'setelan-dikembalikan',
      message:
        'meta.setelan terisi: kembalikan di cleanup(), atau isi meta.setelanMenetap dengan alasan',
    })
  if (!Array.isArray(s.steps) || s.steps.length === 0) {
    out.push({ rule: 'langkah', message: 'skenario tanpa langkah' })
    return out
  }
  const personaIds = new Set<string>(PERSONA_IDS)
  const declared = new Set(m.personas.map((p) => p.who))
  const seen = new Set<string>()
  s.steps.forEach((step, i) => {
    const at = `langkah ${i + 1}`
    if (!STEP_ID.test(step.id ?? ''))
      out.push({ rule: 'langkah', message: `${at}: id harus kebab-case` })
    if (seen.has(step.id)) out.push({ rule: 'langkah', message: `${at}: id "${step.id}" ganda` })
    seen.add(step.id)
    if (!step.title?.trim()) out.push({ rule: 'langkah', message: `${at}: title kosong` })
    if (!step.expect?.trim())
      out.push({ rule: 'langkah', message: `${at}: expect (yang harus terlihat) kosong` })
    if (typeof step.run !== 'function')
      out.push({ rule: 'langkah', message: `${at}: run bukan fungsi` })
    if (step.who && !personaIds.has(step.who))
      out.push({ rule: 'persona', message: `${at}: persona ${step.who} tidak dikenal` })
    else if (step.who && !declared.has(step.who))
      out.push({
        rule: 'persona',
        message: `${at}: persona ${step.who} belum ada di meta.personas`,
      })
  })
  return out
}

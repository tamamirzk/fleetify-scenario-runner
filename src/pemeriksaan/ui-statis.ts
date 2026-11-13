// Pemeriksa UI statis per halaman: memanggil `bun run check:design --route <pathname> --json` di
// <V2_DIR>/Frontend (repo v2 hanya dibaca), membandingkan pelanggarannya dengan
// Frontend/design-baseline.json (jumlah per aturan per berkas), dan menandai kelebihannya
// sebagai pelanggaran BARU. Bagian murni (parser, pembanding) diuji Vitest.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { KelompokStatis, PelanggaranStatis } from '../core/run-types.ts'

/** Pasal DESIGN.md v2 yang dirujuk tiap aturan check:design (docs/CHECK-DESIGN.md). */
export const PASAL_ATURAN: Record<string, string> = {
  'sx-tema': '§1, §7.2',
  'hex-mentah': '§3, §8',
  grid2: '§1',
  'locale-tetap': '§4',
  'input-number': '§7.3',
  'string-hardcode': '§8',
  'restyle-sx': '§8',
  'tabs-tanpa-justifikasi': '§5',
  'kpi-summary': '§8',
  'shadow-inline': '§6',
}
export const ATURAN_STATIS = [
  'sx-tema',
  'hex-mentah',
  'grid2',
  'locale-tetap',
  'input-number',
  'string-hardcode',
  'restyle-sx',
  'tabs-tanpa-justifikasi',
  'kpi-summary',
  'shadow-inline',
] as const
export const pasalAturan = (rule: string) => PASAL_ATURAN[rule] ?? '–'

export interface KeluaranCheckDesign {
  mode: string
  route: { pathname: string; pattern: string | null; page: string | null } | null
  files: string[]
  violations: PelanggaranStatis[]
  totals: Record<string, number>
  elapsed_ms: number
}

/** Baseline check:design: jumlah pelanggaran per aturan per berkas. */
export interface BaselineDesain {
  version: number
  files: Record<string, Record<string, number>>
}

const angka = (v: unknown, nama: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(`${nama} bukan angka`)
  return v
}
const teks = (v: unknown, nama: string): string => {
  if (typeof v !== 'string') throw new Error(`${nama} bukan string`)
  return v
}

/** Parse stdout `check:design --json`. Melempar bila bentuknya tidak dikenal (stderr diabaikan pemanggil). */
export function uraiKeluaran(stdout: string): KeluaranCheckDesign {
  let j: unknown
  try {
    j = JSON.parse(stdout)
  } catch {
    throw new Error(
      `keluaran check:design bukan JSON: ${stdout.slice(0, 120).trim() || '(kosong)'}`,
    )
  }
  if (!j || typeof j !== 'object') throw new Error('keluaran check:design bukan objek')
  const o = j as Record<string, unknown>
  if (!Array.isArray(o.violations)) throw new Error('keluaran check:design tanpa violations')
  const violations: PelanggaranStatis[] = o.violations.map((v, i) => {
    const r = (v ?? {}) as Record<string, unknown>
    return {
      file: teks(r.file, `violations[${i}].file`),
      line: angka(r.line, `violations[${i}].line`),
      col: angka(r.col, `violations[${i}].col`),
      rule: teks(r.rule, `violations[${i}].rule`),
      message: teks(r.message, `violations[${i}].message`),
    }
  })
  const rute = o.route && typeof o.route === 'object' ? (o.route as Record<string, unknown>) : null
  return {
    mode: typeof o.mode === 'string' ? o.mode : 'route',
    route: rute
      ? {
          pathname: typeof rute.pathname === 'string' ? rute.pathname : '',
          pattern: typeof rute.pattern === 'string' ? rute.pattern : null,
          page: typeof rute.page === 'string' ? rute.page : null,
        }
      : null,
    files: Array.isArray(o.files) ? o.files.filter((f): f is string => typeof f === 'string') : [],
    violations,
    totals: o.totals && typeof o.totals === 'object' ? (o.totals as Record<string, number>) : {},
    elapsed_ms: typeof o.elapsed_ms === 'number' ? o.elapsed_ms : 0,
  }
}

export function uraiBaseline(json: string): BaselineDesain {
  const j = JSON.parse(json) as Partial<BaselineDesain>
  if (!j.files || typeof j.files !== 'object') throw new Error('design-baseline.json tanpa files')
  return { version: typeof j.version === 'number' ? j.version : 1, files: j.files }
}

/**
 * Kelompokkan pelanggaran per (berkas, aturan) dan bandingkan dengan baseline: jumlah ≤ baseline
 * = sudah ada; kelebihannya = baru. Karena baseline hanya menyimpan angka, kelompok baru membawa
 * SEMUA barisnya supaya orang bisa mencari yang baru. `nonaktif` = aturan yang dimatikan skenario.
 */
export function bandingBaseline(
  violations: readonly PelanggaranStatis[],
  baseline: BaselineDesain | null,
  nonaktif: readonly string[] = [],
): { baru: KelompokStatis[]; sudahAda: KelompokStatis[] } {
  const peta = new Map<string, KelompokStatis>()
  for (const v of violations) {
    if (nonaktif.includes(v.rule)) continue
    const k = `${v.file}\n${v.rule}`
    let g = peta.get(k)
    if (!g) {
      const dasar = baseline?.files[v.file]?.[v.rule] ?? 0
      g = {
        file: v.file,
        rule: v.rule,
        pasal: pasalAturan(v.rule),
        jumlah: 0,
        baseline: dasar,
        baru: 0,
        baris: [],
      }
      peta.set(k, g)
    }
    g.jumlah++
    g.baris.push(v)
  }
  const baru: KelompokStatis[] = []
  const sudahAda: KelompokStatis[] = []
  for (const g of peta.values()) {
    g.baris.sort((a, b) => a.line - b.line || a.col - b.col)
    g.baru = Math.max(0, g.jumlah - g.baseline)
    ;(g.baru > 0 ? baru : sudahAda).push(g)
  }
  const urut = (a: KelompokStatis, b: KelompokStatis) =>
    a.file.localeCompare(b.file) || a.rule.localeCompare(b.rule)
  baru.sort(urut)
  sudahAda.sort(urut)
  return { baru, sudahAda }
}

export const jumlahBaru = (k: readonly KelompokStatis[]) => k.reduce((n, g) => n + g.baru, 0)
export const jumlahLama = (k: readonly KelompokStatis[]) =>
  k.reduce((n, g) => n + Math.min(g.jumlah, g.baseline), 0)

// ── Akses berkas repo v2 (hanya baca) ─────────────────────────────────────────
export const frontendDir = (v2Dir: string) => path.join(v2Dir, 'Frontend')
export const skripCheckDesign = (v2Dir: string) =>
  path.join(frontendDir(v2Dir), 'scripts/check-design.ts')

/** Alasan V2_DIR tidak bisa dipakai, atau null bila siap. */
export function masalahV2Dir(v2Dir: string | null): string | null {
  if (!v2Dir)
    return 'isi V2_DIR di .env (akar repo v2 yang memuat Frontend/scripts/check-design.ts)'
  if (!existsSync(skripCheckDesign(v2Dir)))
    return `Frontend/scripts/check-design.ts tidak ada di ${v2Dir}`
  return null
}

export function bacaBaseline(v2Dir: string): BaselineDesain | null {
  const f = path.join(frontendDir(v2Dir), 'design-baseline.json')
  if (!existsSync(f)) return null
  return uraiBaseline(readFileSync(f, 'utf8'))
}

/** Satu baris kode (dipangkas) pada posisi pelanggaran; null bila berkas tidak terbaca. */
export function cuplikanBaris(v2Dir: string, file: string, line: number): string | null {
  const abs = path.join(frontendDir(v2Dir), file)
  if (!abs.startsWith(frontendDir(v2Dir)) || !existsSync(abs)) return null
  try {
    const isi = readFileSync(abs, 'utf8').split('\n')[line - 1]
    return isi === undefined ? null : isi.trim().slice(0, 160)
  } catch {
    return null
  }
}

/** Tautan editor untuk satu pelanggaran. */
export const tautanVscode = (v2Dir: string, p: PelanggaranStatis) =>
  `vscode://file${path.join(frontendDir(v2Dir), p.file)}:${p.line}:${p.col}`

const BATAS_MS = 30_000

/** Jalankan check:design untuk satu pathname; stdout JSON murni, stderr diabaikan. */
export async function jalankanCheckDesign(
  v2Dir: string,
  pathname: string,
): Promise<KeluaranCheckDesign> {
  const proc = Bun.spawn(['bun', 'run', 'check:design', '--route', pathname, '--json'], {
    cwd: frontendDir(v2Dir),
    stdout: 'pipe',
    stderr: 'pipe',
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  })
  const timer = setTimeout(() => proc.kill(), BATAS_MS)
  try {
    const [stdout, code] = await Promise.all([new Response(proc.stdout).text(), proc.exited])
    if (code !== 0 && !stdout.trim())
      throw new Error(`check:design keluar dengan kode ${code} tanpa keluaran`)
    return uraiKeluaran(stdout)
  } finally {
    clearTimeout(timer)
  }
}

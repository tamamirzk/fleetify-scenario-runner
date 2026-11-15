// Riwayat jalan di disk (runs/<slug>/<waktu>/): ukuran, hapus jalan, hapus trace saja, pemilihan
// (lebih lama dari N hari, simpan N terakhir per skenario) dan retensi otomatis. Semua penghapusan lewat
// pagar `jalurJalan`: hanya folder jalan yang sah DI DALAM runs/ repo ini (path di luar dan symlink keluar
// ditolak), tidak pernah jalan yang sedang berjalan. Temuan di docs/TEMUAN.md tidak tersentuh.
import {
  existsSync,
  lstatSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'

export const RUN_ID =
  /^[a-z0-9]+(?:-[a-z0-9]+)*\/[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}-[0-9]{2}-[0-9]{2}$/

/** Folder jalan yang aman dihapus; lempar bila id tidak sah, di luar `dasar`, atau symlink keluar. */
export function jalurJalan(dasar: string, runId: string): string {
  if (typeof runId !== 'string' || !RUN_ID.test(runId))
    throw new Error(`Id jalan tidak sah: ${runId}`)
  const akar = path.resolve(dasar)
  const abs = path.resolve(akar, runId)
  const rel = path.relative(akar, abs)
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel))
    throw new Error(`Di luar folder runs/: ${runId}`)
  if (!existsSync(abs)) throw new Error(`Jalan ${runId} tidak ada`)
  // Symlink (folder skenario atau folder jalan) yang menunjuk ke luar runs/ ditolak.
  const akarAsli = realpathSync(akar)
  const asli = realpathSync(abs)
  const relAsli = path.relative(akarAsli, asli)
  if (!relAsli || relAsli.startsWith('..') || path.isAbsolute(relAsli))
    throw new Error(`Jalan ${runId} menunjuk ke luar folder runs/ (symlink)`)
  if (lstatSync(abs).isSymbolicLink() || lstatSync(path.dirname(abs)).isSymbolicLink())
    throw new Error(`Jalan ${runId} adalah symlink; tidak dihapus`)
  return abs
}

/** Ukuran folder (byte) tanpa mengikuti symlink. */
export function ukuranFolder(dir: string): number {
  let n = 0
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isSymbolicLink()) continue
    if (e.isDirectory()) n += ukuranFolder(p)
    else n += lstatSync(p).size
  }
  return n
}

export interface InfoJalan {
  run_id: string
  scenario: string
  title: string
  status: string
  started_at: string | null
  ended_at: string | null
  ukuran: number
  ukuran_trace: number
  punya_trace: boolean
  trace_dihapus: boolean
  temuan: number
}

function baca(dir: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(path.join(dir, 'result.json'), 'utf8'))
  } catch {
    return null
  }
}

/** Semua jalan di disk, terbaru dulu (folder rusak tetap terdaftar supaya bisa dihapus). */
export function daftarJalanDisk(dasar: string): InfoJalan[] {
  if (!existsSync(dasar)) return []
  const out: InfoJalan[] = []
  for (const slug of readdirSync(dasar)) {
    const sdir = path.join(dasar, slug)
    if (lstatSync(sdir).isSymbolicLink() || !lstatSync(sdir).isDirectory()) continue
    for (const waktu of readdirSync(sdir)) {
      const runId = `${slug}/${waktu}`
      if (!RUN_ID.test(runId)) continue
      const dir = path.join(sdir, waktu)
      if (lstatSync(dir).isSymbolicLink() || !lstatSync(dir).isDirectory()) continue
      const r = baca(dir)
      const trace = path.join(dir, 'trace.zip')
      const punya = existsSync(trace)
      out.push({
        run_id: runId,
        scenario: slug,
        title: String(r?.title ?? slug),
        status: String(r?.status ?? 'rusak'),
        started_at: (r?.started_at as string | null) ?? null,
        ended_at: (r?.ended_at as string | null) ?? null,
        ukuran: ukuranFolder(dir),
        ukuran_trace: punya ? lstatSync(trace).size : 0,
        punya_trace: punya,
        trace_dihapus: !!r?.trace_dihapus,
        temuan: Array.isArray(r?.findings) ? (r.findings as unknown[]).length : 0,
      })
    }
  }
  return out.sort((a, b) =>
    (a.run_id.split('/')[1] ?? '') < (b.run_id.split('/')[1] ?? '') ? 1 : -1,
  )
}

/** Hapus satu folder jalan. Jalan aktif ditolak. Folder skenario yang jadi kosong ikut dihapus. */
export function hapusJalan(
  dasar: string,
  runId: string,
  aktif: ReadonlySet<string> = new Set(),
): number {
  if (aktif.has(runId)) throw new Error(`Jalan ${runId} sedang berjalan; tidak dihapus`)
  const dir = jalurJalan(dasar, runId)
  const n = ukuranFolder(dir)
  rmSync(dir, { recursive: true, force: true })
  const sdir = path.dirname(dir)
  try {
    if (!readdirSync(sdir).length) rmdirSync(sdir)
  } catch {
    // Folder skenario dipakai jalan lain: biarkan.
  }
  return n
}

/** Hapus trace.zip saja (laporan + screenshot tetap); result.json ditandai trace_dihapus. */
export function hapusTrace(
  dasar: string,
  runId: string,
  aktif: ReadonlySet<string> = new Set(),
): number {
  if (aktif.has(runId)) throw new Error(`Jalan ${runId} sedang berjalan; trace tidak dihapus`)
  const dir = jalurJalan(dasar, runId)
  const trace = path.join(dir, 'trace.zip')
  if (!existsSync(trace) || lstatSync(trace).isSymbolicLink()) return 0
  const n = lstatSync(trace).size
  rmSync(trace, { force: true })
  const r = baca(dir)
  if (r) {
    delete r.trace
    r.trace_dihapus = { at: new Date().toISOString(), byte: n }
    writeFileSync(path.join(dir, 'result.json'), JSON.stringify(r, null, 2))
  }
  return n
}

const waktuJalan = (j: Pick<InfoJalan, 'run_id' | 'started_at'>) => {
  if (j.started_at) return Date.parse(j.started_at)
  const s = (j.run_id.split('/')[1] ?? '').replace(/T(\d{2})-(\d{2})-(\d{2})$/, 'T$1:$2:$3Z')
  return Date.parse(s)
}

/** Jalan yang lebih lama dari `hari` hari. */
export function pilihLebihLama(
  list: readonly InfoJalan[],
  hari: number,
  sekarang = Date.now(),
): string[] {
  const batas = sekarang - hari * 86_400_000
  return list.filter((j) => waktuJalan(j) < batas).map((j) => j.run_id)
}

/** Jalan di luar `n` terbaru per skenario. */
export function pilihSimpan(list: readonly InfoJalan[], n: number): string[] {
  const out: string[] = []
  const per = new Map<string, InfoJalan[]>()
  for (const j of list) per.set(j.scenario, [...(per.get(j.scenario) ?? []), j])
  for (const js of per.values())
    out.push(
      ...[...js]
        .sort((a, b) => waktuJalan(b) - waktuJalan(a))
        .slice(n)
        .map((j) => j.run_id),
    )
  return out
}

export interface Retensi {
  aktif: boolean
  /** Simpan N jalan terakhir per skenario. */
  simpan: number
  /** Trace hanya untuk N jalan terakhir per skenario … */
  trace: number
  /** … dan untuk jalan yang gagal. */
  traceGagal: boolean
}
export const RETENSI_BAWAAN: Retensi = { aktif: true, simpan: 10, trace: 3, traceGagal: true }

/**
 * Rencana retensi: hapus jalan di luar `simpan` terbaru per skenario dan hapus trace di luar `trace`
 * terbaru (kecuali jalan gagal bila traceGagal). Jalan bertemuan TIDAK dihapus otomatis (trace-nya juga
 * disimpan) — menghapusnya butuh konfirmasi khusus di panel/CLI. Jalan aktif tidak disentuh.
 */
export function rencanaRetensi(
  list: readonly InfoJalan[],
  r: Retensi,
  aktif: ReadonlySet<string> = new Set(),
): { hapus: string[]; hapusTrace: string[] } {
  if (!r.aktif) return { hapus: [], hapusTrace: [] }
  const hapus: string[] = []
  const hapusTrace: string[] = []
  const per = new Map<string, InfoJalan[]>()
  for (const j of list) per.set(j.scenario, [...(per.get(j.scenario) ?? []), j])
  for (const js of per.values()) {
    const urut = [...js].sort((a, b) => waktuJalan(b) - waktuJalan(a))
    urut.forEach((j, i) => {
      if (aktif.has(j.run_id) || j.temuan > 0) return
      if (i >= r.simpan) hapus.push(j.run_id)
      else if (i >= r.trace && j.punya_trace && !(r.traceGagal && j.status === 'gagal'))
        hapusTrace.push(j.run_id)
    })
  }
  return { hapus, hapusTrace }
}

export function bacaRetensi(berkas: string): Retensi {
  try {
    const x = JSON.parse(readFileSync(berkas, 'utf8')) as Partial<Retensi>
    return normalRetensi({ ...RETENSI_BAWAAN, ...x })
  } catch {
    return { ...RETENSI_BAWAAN }
  }
}

export function normalRetensi(x: Partial<Retensi>): Retensi {
  const bulat = (v: unknown, def: number) => {
    const n = Math.round(Number(v))
    return Number.isFinite(n) && n >= 1 && n <= 1000 ? n : def
  }
  const simpan = bulat(x.simpan, RETENSI_BAWAAN.simpan)
  return {
    aktif: x.aktif !== false,
    simpan,
    trace: Math.min(simpan, bulat(x.trace, RETENSI_BAWAAN.trace)),
    traceGagal: x.traceGagal !== false,
  }
}

export const teksByte = (n: number) =>
  n >= 1e9
    ? `${(n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 })} GB`
    : n >= 1e6
      ? `${(n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} MB`
      : `${Math.round(n / 1e3).toLocaleString('id-ID')} KB`

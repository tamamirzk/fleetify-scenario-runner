// Riwayat jalan lokal: runs/<slug>/<waktu>/result.json (+ data.json, screenshot, trace.zip).
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { config } from './config.ts'
import type { RunResult } from './run-types.ts'

export const RUN_ID = /^[a-z0-9-]+\/[0-9T-]+$/

export function readRun(runId: string): RunResult {
  if (!RUN_ID.test(runId)) throw new Error('run id tidak sah')
  const file = path.join(config.runsDir, runId, 'result.json')
  if (!existsSync(file)) throw new Error(`Jalan ${runId} tidak ada`)
  const r = JSON.parse(readFileSync(file, 'utf8')) as RunResult
  // Jalan dari versi 1 tidak punya field ini.
  r.steps = r.steps.map((s) => ({ ...s, aksi: s.aksi ?? [] }))
  r.findings = (r.findings ?? []).map((f) => ({ ...f, jenis: f.jenis ?? 'catatan' }))
  return r
}

/** Indeks langkah terakhir yang lulus berurutan dari awal jalan (−1 bila belum ada). */
export function lastDone(r: Pick<RunResult, 'from_step' | 'steps'>): number {
  let last = (r.from_step ?? 0) - 1
  for (let i = r.from_step ?? 0; i < r.steps.length; i++) {
    if (r.steps[i]?.status !== 'lulus') break
    last = i
  }
  return last
}

export function ringkas(r: RunResult) {
  const gagal = r.steps.find((s) => s.status === 'gagal')
  return {
    run_id: r.run_id,
    scenario: r.scenario,
    task: r.task ?? null,
    title: r.title,
    status: r.status,
    headed: r.headed,
    started_at: r.started_at,
    ended_at: r.ended_at,
    duration_ms: r.duration_ms,
    from_step: r.from_step,
    last_done: lastDone(r),
    steps_total: r.steps.length,
    steps_passed: r.steps.filter((s) => s.status === 'lulus').length,
    failed_step: gagal?.n ?? null,
    findings: r.findings.length,
    file_mtime: r.file_mtime ?? null,
    error: r.error ?? null,
  }
}

export type RunSummary = ReturnType<typeof ringkas>

export function listRuns(scenario?: string): RunSummary[] {
  const dirs = scenario ? [scenario] : existsSync(config.runsDir) ? readdirSync(config.runsDir) : []
  const out: RunSummary[] = []
  for (const s of dirs) {
    const dir = path.join(config.runsDir, s)
    if (!existsSync(dir)) continue
    for (const stamp of readdirSync(dir)) {
      try {
        out.push(ringkas(readRun(`${s}/${stamp}`)))
      } catch {
        // Folder jalan rusak atau setengah jadi: lewati.
      }
    }
  }
  return out.sort((a, b) =>
    (b.run_id.split('/')[1] ?? '') > (a.run_id.split('/')[1] ?? '') ? 1 : -1,
  )
}

/** Hasil terakhir yang bermakna (mengabaikan jalan yang belum diputar). */
export function lastResult(scenario: string): RunSummary | null {
  return (
    listRuns(scenario).find(
      (r) => !['idle', 'siap', 'menyiapkan', 'dibatalkan'].includes(r.status),
    ) ?? null
  )
}

/** Untuk lompat ke langkah n tanpa capai: jalan yang punya data dan berhenti tepat sebelum n. */
export function jumpSources(scenario: string, n: number): string[] {
  return listRuns(scenario)
    .filter(
      (r) =>
        r.last_done === n - 1 &&
        r.status !== 'siap' &&
        existsSync(path.join(config.runsDir, r.run_id, 'data.json')),
    )
    .map((r) => r.run_id)
}

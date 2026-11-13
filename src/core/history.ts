// Riwayat jalan: runs/<skenario>/<waktu>/result.json (+ data.json, screenshot, trace.zip).
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { config } from './config.ts'
import type { RunResult } from './run-types.ts'

export const RUN_ID = /^[a-z0-9-]+\/[0-9T-]+$/

export function readRun(runId: string): RunResult {
  if (!RUN_ID.test(runId)) throw new Error('run id tidak sah')
  const file = path.join(config.runsDir, runId, 'result.json')
  if (!existsSync(file)) throw new Error(`Jalan ${runId} tidak ada`)
  return JSON.parse(readFileSync(file, 'utf8')) as RunResult
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

export function listRuns(scenario?: string) {
  const dirs = scenario ? [scenario] : existsSync(config.runsDir) ? readdirSync(config.runsDir) : []
  const out = []
  for (const s of dirs) {
    const dir = path.join(config.runsDir, s)
    if (!existsSync(dir)) continue
    for (const stamp of readdirSync(dir)) {
      try {
        const r = readRun(`${s}/${stamp}`)
        out.push({
          run_id: r.run_id,
          scenario: r.scenario,
          title: r.title,
          status: r.status,
          headed: r.headed,
          started_at: r.started_at,
          ended_at: r.ended_at,
          duration_ms: r.duration_ms,
          from_step: r.from_step,
          last_done: lastDone(r),
          steps_total: r.steps.length,
          findings: r.findings.length,
          error: r.error ?? null,
        })
      } catch {
        // Folder jalan rusak atau setengah jadi: lewati.
      }
    }
  }
  return out.sort((a, b) =>
    (b.run_id.split('/')[1] ?? '') > (a.run_id.split('/')[1] ?? '') ? 1 : -1,
  )
}

export type RunSummary = ReturnType<typeof listRuns>[number]

/** Untuk lompat ke langkah n tanpa reach: jalan yang punya data dan berhenti tepat sebelum n. */
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

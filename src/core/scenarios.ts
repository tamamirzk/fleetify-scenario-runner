// Memuat dan menjelaskan skenario dari scenarios/<id>.ts.
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { config } from './config.ts'
import { listRuns, type RunSummary } from './history.ts'
import { MetaSchema } from './meta.ts'
import { personaName } from './personas.ts'
import type { Scenario, ScenarioData, Step } from './types.ts'

export const ID_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

export const scenarioFile = (id: string) => path.join(config.scenariosDir, `${id}.ts`)

/** Muat ulang dari berkas tiap kali, supaya perubahan terbaca tanpa menyalakan ulang panel. */
export async function loadScenario(id: string): Promise<Scenario> {
  if (!ID_PATTERN.test(id)) throw new Error(`Nama skenario tidak sah: ${id}`)
  const file = scenarioFile(id)
  if (!existsSync(file)) throw new Error(`Skenario ${id} tidak ada`)
  delete require.cache[file]
  const mod = (await import(file)) as { default?: Scenario }
  if (!mod.default) throw new Error(`Skenario ${id} tidak punya export default`)
  return mod.default
}

export function scenarioIds(): string[] {
  if (!existsSync(config.scenariosDir)) return []
  return readdirSync(config.scenariosDir)
    .filter((f) => f.endsWith('.ts'))
    .map((f) => f.replace(/\.ts$/, ''))
    .sort()
}

export interface StepInfo {
  n: number
  id: string
  title: string
  expect: string
  who: string | null
  who_name: string | null
  reach: boolean
}

export const stepInfo = (s: Step<ScenarioData>, i: number): StepInfo => ({
  n: i + 1,
  id: s.id,
  title: s.title,
  expect: s.expect,
  who: s.who ?? null,
  who_name: s.who ? personaName(s.who) : null,
  reach: !!s.reach,
})

export async function describeScenario(id: string) {
  const s = await loadScenario(id)
  const meta = MetaSchema.parse(s.meta)
  const personas = meta.personas.map((p) => ({ ...p, nama: personaName(p.who) }))
  const names = Object.fromEntries(
    s.steps.filter((x) => x.who).map((x) => [x.who, personaName(x.who ?? '')]),
  )
  return { ...meta, personas, names, steps: s.steps.map(stepInfo) }
}

export type ScenarioDescription = Awaited<ReturnType<typeof describeScenario>>

export async function listScenarios() {
  const out: Array<
    | (ScenarioDescription & { last_run: RunSummary | null; run_count: number })
    | { id: string; title: string; error: string }
  > = []
  for (const id of scenarioIds()) {
    try {
      const d = await describeScenario(id)
      const runs = listRuns(id)
      out.push({ ...d, last_run: runs[0] ?? null, run_count: runs.length })
    } catch (e) {
      out.push({ id, title: id, error: (e as Error).message.split('\n')[0] ?? '' })
    }
  }
  return out
}

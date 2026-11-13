import type { StepInfo } from './scenarios.ts'

export type RunStatus =
  | 'idle'
  | 'menyiapkan'
  | 'siap'
  | 'berjalan'
  | 'jeda'
  | 'selesai'
  | 'gagal'
  | 'dihentikan'
  | 'dibatalkan'

export type StepStatus = 'menunggu' | 'berjalan' | 'lulus' | 'gagal' | 'dihentikan' | 'dilompati'

export interface StepResult extends StepInfo {
  status: StepStatus
  ms: number | null
  error: string | null
  shot: string | null
  notes?: string[]
}

export interface Finding {
  at: string
  step: string | null
  persona: string | null
  url: string | null
  note: string
  screenshot: string | null
}

export interface RunResult {
  run_id: string
  scenario: string
  title: string
  headed: boolean
  status: RunStatus
  started_at: string | null
  ended_at: string | null
  duration_ms: number | null
  from_step: number
  data_from: string | null
  current_step: number | null
  last_shot: string | null
  error: string | null
  cleanup_error?: string
  trace?: string
  steps: StepResult[]
  findings: Finding[]
}

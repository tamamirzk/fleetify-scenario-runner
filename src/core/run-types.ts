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
export type AksiStatus = 'menunggu' | 'berjalan' | 'selesai' | 'gagal' | 'dihentikan'

export interface AksiResult {
  teks: string
  status: AksiStatus
  ms: number | null
}

export interface StepResult extends StepInfo {
  status: StepStatus
  ms: number | null
  error: string | null
  shot: string | null
  notes?: string[]
  aksi: AksiResult[]
}

export const JENIS_TEMUAN = ['bug', 'skenario', 'catatan'] as const
export type JenisTemuan = (typeof JENIS_TEMUAN)[number]
export const LABEL_TEMUAN: Record<JenisTemuan, string> = {
  bug: 'Bug aplikasi',
  skenario: 'Skenario salah',
  catatan: 'Catatan',
}

export interface Finding {
  at: string
  jenis: JenisTemuan
  step_n: number | null
  step: string | null
  aksi: string | null
  persona: string | null
  url: string | null
  note: string
  /** Nama berkas di folder jalan. */
  screenshot: string | null
}

export interface RunResult {
  run_id: string
  scenario: string
  task: string
  path: string
  title: string
  estimasi: string
  /** Waktu ubah berkas JSON saat jalan dimulai. */
  file_mtime: string
  headed: boolean
  status: RunStatus
  started_at: string | null
  ended_at: string | null
  duration_ms: number | null
  from_step: number
  data_from: string | null
  current_step: number | null
  current_aksi: number | null
  last_shot: string | null
  error: string | null
  cleanup_error?: string
  trace?: string
  steps: StepResult[]
  findings: Finding[]
}

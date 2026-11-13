// Tipe tunggal untuk semua skenario. Skenario: `export default defineScenario({ meta, setup, steps })`.
import type { APIRequestContext, Locator, Page } from 'playwright'
import type { Controller } from './controller.ts'
import type * as kitModule from './kit.ts'
import type * as libModule from './lib.ts'
import type { ScenarioMeta } from './meta.ts'
import type { PersonaId } from './personas.ts'

/**
 * Isi respons API v2. Alat uji ini tidak memakai klien tergenerasi v2, jadi respons
 * dibaca longgar dan skenario memeriksa sendiri isinya (mis. lewat `ok()` dan throw).
 */
// biome-ignore lint/suspicious/noExplicitAny: respons API v2 tidak bertipe di alat uji eksternal
export type Body = any

export interface ApiResult {
  status: number
  body: Body
}

/** Halaman (jendela utama) atau sesi API tanpa jendela dari `ctx.as(who)`. */
export type ApiTarget = Page | APIRequestContext

export interface Doc {
  label: string
  nomor: string
  url: string
}

/** Data hasil setup(); langkah boleh menambah field. `docs` tampil di panel. */
export interface ScenarioData {
  docs?: Doc[]
}

export type Kit = ReturnType<typeof kitModule.kit>

export interface BaseCtx {
  lib: typeof libModule
  kit: typeof kitModule
  ctl: Controller
  log(line: string): void
  /** Sesi API persona lain tanpa jendela; ditutup otomatis di akhir. */
  as(who: PersonaId): Promise<APIRequestContext>
  api: {
    get(target: ApiTarget, url: string): Promise<ApiResult>
    send(target: ApiTarget, method: string, url: string, data?: unknown): Promise<ApiResult>
  }
  ok(res: ApiResult, label: string): Body
}

export interface StepCtx extends BaseCtx {
  page: Page
  k: Kit
  n: number
  total: number
  /** Banner bernomor `n/total · teks`, lalu tahan. */
  say(text: string, ms?: number): Promise<void>
  /** Tahan; mengikuti jeda, kecepatan, dan mode headless. */
  wait(ms: number): Promise<void>
  shot(name: string): Promise<string | null>
  become(who: PersonaId): Promise<void>
  open(route: string): Promise<void>
  /** Catatan di hasil langkah (mis. dugaan temuan) tanpa menggagalkan langkah. */
  note(text: string): void
}

export interface Step<D extends ScenarioData> {
  /** kebab-case, unik dalam skenario. */
  id: string
  /** Kalimat aktif: siapa melakukan apa. */
  title: string
  /** Yang harus terlihat di layar setelah langkah selesai. */
  expect: string
  /** Persona jendela untuk langkah ini; runner berganti akun bila berbeda. */
  who?: PersonaId
  /** Bawa data ke awal langkah ini lewat API, supaya panel bisa mulai dari sini. */
  reach?(ctx: BaseCtx, data: D): Promise<void>
  run(ctx: StepCtx, data: D): Promise<void>
}

export interface Scenario<D extends ScenarioData = ScenarioData> {
  meta: ScenarioMeta
  /** Buat data segar lewat API. Hasilnya disimpan ke data.json jalan. */
  setup?(ctx: BaseCtx): Promise<D>
  steps: Step<D>[]
  /** Kembalikan setelan lewat API; berjalan juga saat gagal atau dihentikan. */
  cleanup?(ctx: BaseCtx, data: D): Promise<void>
}

export const defineScenario = <D extends ScenarioData>(s: Scenario<D>): Scenario<D> => s

export type { Locator, Page, PersonaId }

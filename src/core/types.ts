// Konteks yang diterima aksi pustaka (src/pustaka). Skenario sendiri berupa JSON (core/skema.ts).
import type { APIRequestContext, Locator, Page } from 'playwright'
import type { Controller } from './controller.ts'
import type * as kitModule from './kit.ts'
import type * as libModule from './lib.ts'
import type { PersonaId } from './personas.ts'

/**
 * Isi respons API v2. Alat uji ini tidak memakai klien tergenerasi v2, jadi respons
 * dibaca longgar dan pustaka memeriksa sendiri isinya (mis. lewat `ok()` dan throw).
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

export type Kit = ReturnType<typeof kitModule.kit>

/** Konteks aksi pustaka jenis "api" (tanpa jendela): siapkan, capai, bersihkan, langkah. */
export interface BaseCtx {
  lib: typeof libModule
  kit: typeof kitModule
  ctl: Controller
  /** Stempel waktu pendek, sama untuk seluruh jalan (untuk SKU/kode data uji). */
  stempel: string
  log(line: string): void
  /** Catatan di hasil langkah (mis. dugaan temuan) tanpa menggagalkan langkah. */
  note(text: string): void
  /** Sesi API persona lain tanpa jendela; ditutup otomatis di akhir. */
  as(who: PersonaId): Promise<APIRequestContext>
  api: {
    get(target: ApiTarget, url: string): Promise<ApiResult>
    send(target: ApiTarget, method: string, url: string, data?: unknown): Promise<ApiResult>
  }
  ok(res: ApiResult, label: string): Body
}

/** Konteks aksi pustaka jenis "layar": jendela satu-satunya dan helper aksi terlihat. */
export interface StepCtx extends BaseCtx {
  page: Page
  k: Kit
  /** Tahan; mengikuti jeda, kecepatan, dan mode headless. */
  wait(ms: number): Promise<void>
  open(route: string): Promise<void>
  say(text: string, ms?: number): Promise<void>
  shot(name: string): Promise<string | null>
}

export type { Locator, Page, PersonaId }

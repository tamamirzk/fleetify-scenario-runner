// Bentuk satu aksi pustaka. Skenario JSON memanggilnya dengan nama:
//   { "api": "setujui-semua", "dokumen": "MATERIAL_REQUEST", "id": "{mr.id}" }
import type { z } from 'zod'
import type { BaseCtx, StepCtx } from '../core/types.ts'

interface Dasar<S extends z.ZodObject> {
  /** Satu kalimat untuk docs dan tampilan "Aksi di langkah ini". */
  ringkasan: string
  argumen: S
  /** Bentuk nilai yang dikembalikan (untuk `simpan`), untuk docs. */
  hasil?: string
  /** Aksi ini menyentuh DB/proses luar: skenario wajib `pengecualian` db-lewat-api. */
  pengecualianDb?: true
  /** Uraian pendek untuk panel, mis. "Setujui MR (di belakang layar)". */
  urai?(a: z.infer<S>): string
}

export interface AksiApi<S extends z.ZodObject = z.ZodObject> extends Dasar<S> {
  jenis: 'api'
  jalankan(ctx: BaseCtx, a: z.infer<S>): Promise<unknown>
}

export interface AksiLayar<S extends z.ZodObject = z.ZodObject> extends Dasar<S> {
  jenis: 'layar'
  jalankan(ctx: StepCtx, a: z.infer<S>): Promise<unknown>
}

export type AksiPustaka = AksiApi | AksiLayar

export const api = <S extends z.ZodObject>(a: Omit<AksiApi<S>, 'jenis'>): AksiApi<S> => ({
  jenis: 'api',
  ...a,
})
export const layar = <S extends z.ZodObject>(a: Omit<AksiLayar<S>, 'jenis'>): AksiLayar<S> => ({
  jenis: 'layar',
  ...a,
})

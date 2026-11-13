// Skema `meta` skenario. Dipakai panel (ringkasan), check:scenarios, dan tes.
import { z } from 'zod'
import { PERSONA_IDS } from './personas.ts'

export const GROUPS = ['material', 'approval', 'wo', 'pb', 'akses', 'lingkungan'] as const

const text = z.string().trim().min(3)

export const MetaSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'huruf kecil, angka, dan tanda hubung'),
    title: text,
    group: z.enum(GROUPS),
    tickets: z.array(z.string().regex(/^[A-Z]+-\d+$/, 'format FMS-123')),
    estimasi: z.string().regex(/^\d+ menit$/, 'format "<n> menit"'),
    tujuan: z.string().trim().min(20),
    personas: z.array(z.object({ who: z.enum(PERSONA_IDS), peran: text }).strict()).min(1),
    data: z.array(text).min(1),
    /** Setelan yang diubah skenario. Kosong bila tidak ada. Wajib dikembalikan di cleanup(). */
    setelan: z.array(text),
    /** Alasan bila setelan sengaja dibiarkan berubah (tanpa cleanup). */
    setelanMenetap: z.string().trim().min(10).optional(),
    prasyarat: z.array(text),
    catatan: z.array(text),
    /** Penyimpangan dari aturan standar, wajib beralasan. */
    pengecualian: z
      .array(
        z.object({ aturan: z.enum(['db-lewat-api']), alasan: z.string().trim().min(20) }).strict(),
      )
      .optional(),
  })
  .strict()

export type ScenarioMeta = z.infer<typeof MetaSchema>

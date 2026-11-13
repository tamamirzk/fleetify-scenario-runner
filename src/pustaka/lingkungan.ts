// Aksi pustaka persiapan lingkungan.
import { z } from 'zod'
import { PERSONA_IDS } from '../core/personas.ts'
import { api } from './types.ts'

const persona = z.enum(PERSONA_IDS)

export const zonaWaktu = api({
  ringkasan: 'Baca setelan zona waktu perusahaan.',
  hasil: '{ default_time_zone, confirmation_status, configuration_version }',
  argumen: z.object({ sebagai: persona.default('mbl.superintendent') }).strict(),
  urai: () => 'Baca zona waktu',
  async jalankan(ctx, a) {
    return ctx.ok(await ctx.api.get(await ctx.as(a.sebagai), '/preferences/time-zone'), 'baca zona')
  },
})

export const konfirmasiZonaWaktu = api({
  ringkasan:
    'Konfirmasi zona waktu perusahaan bila belum terkonfirmasi; gagal bila sesudahnya belum CONFIRMED.',
  hasil: '{ default_time_zone, confirmation_status }',
  argumen: z
    .object({
      sebagai: persona.default('mbl.superintendent'),
      zona: z.string().default('Asia/Jakarta'),
    })
    .strict(),
  urai: (a) => `Konfirmasi zona waktu ${a.zona}`,
  async jalankan(ctx, a) {
    const rc = await ctx.as(a.sebagai)
    const cur = ctx.ok(await ctx.api.get(rc, '/preferences/time-zone'), 'baca zona')
    if (cur.confirmation_status !== 'CONFIRMED')
      ctx.ok(
        await ctx.api.send(rc, 'PUT', '/preferences/time-zone', {
          default_time_zone: a.zona,
          configuration_version: cur.configuration_version,
        }),
        'konfirmasi zona',
      )
    const sesudah = ctx.ok(await ctx.api.get(rc, '/preferences/time-zone'), 'baca zona')
    if (sesudah.confirmation_status !== 'CONFIRMED')
      throw new Error('Zona waktu belum terkonfirmasi')
    return sesudah
  },
})

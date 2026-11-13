// Persiapan lingkungan: konfirmasi zona waktu tenant MBL (Asia/Jakarta) lewat API aplikasi.
// Cukup sekali per DB; prasyarat skenario yang memakai dialog "Mulai inspeksi".
import { type Body, defineScenario } from '../src/core/types.ts'

const BAGUS = 'mbl.superintendent'

interface Data {
  docs: never[]
  sebelum: Body
  sesudah?: Body
}

export default defineScenario<Data>({
  meta: {
    id: 'siapkan-zona',
    title: 'Siapkan zona waktu MBL',
    group: 'lingkungan',
    tickets: [],
    estimasi: '1 menit',
    tujuan:
      'Memastikan zona waktu perusahaan MBL terkonfirmasi (Asia/Jakarta) supaya dialog "Mulai inspeksi" bisa dikonfirmasi.',
    personas: [{ who: BAGUS, peran: 'mengonfirmasi zona waktu lewat API' }],
    data: ['Tidak ada dokumen baru'],
    setelan: ['Zona waktu perusahaan MBL dikonfirmasi Asia/Jakarta bila belum'],
    setelanMenetap:
      'Tanpa zona terkonfirmasi, alur pemeriksaan tidak bisa dimulai; perubahan ini memang prasyarat lingkungan.',
    prasyarat: [],
    catatan: ['Aman dijalankan berulang: bila zona sudah terkonfirmasi, tidak ada yang diubah.'],
  },

  async setup(ctx) {
    const cur = ctx.ok(
      await ctx.api.get(await ctx.as(BAGUS), '/preferences/time-zone'),
      'baca zona',
    )
    ctx.log(`Zona sekarang: ${JSON.stringify(cur)}`)
    return { sebelum: cur, docs: [] }
  },

  steps: [
    {
      id: 'konfirmasi-zona',
      who: BAGUS,
      title: 'Bagus mengonfirmasi zona waktu Asia/Jakarta bila belum',
      expect: 'confirmation_status = CONFIRMED',
      run: async (ctx, d) => {
        const cur = ctx.ok(await ctx.api.get(ctx.page, '/preferences/time-zone'), 'baca zona')
        if (cur.confirmation_status !== 'CONFIRMED') {
          const put = ctx.ok(
            await ctx.api.send(ctx.page, 'PUT', '/preferences/time-zone', {
              default_time_zone: 'Asia/Jakarta',
              configuration_version: cur.configuration_version,
            }),
            'konfirmasi zona',
          )
          ctx.log(`Sesudah: ${JSON.stringify(put)}`)
        }
        d.sesudah = ctx.ok(await ctx.api.get(ctx.page, '/preferences/time-zone'), 'baca zona')
        await ctx.open('/')
        await ctx.say(
          `Zona waktu MBL: ${d.sesudah.default_time_zone ?? '-'} (${d.sesudah.confirmation_status})`,
          3000,
        )
        if (d.sesudah.confirmation_status !== 'CONFIRMED')
          throw new Error('Zona waktu belum terkonfirmasi')
      },
    },
  ],
})

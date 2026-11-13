// TEMPLAT — bun run new <id> menyalin berkas ini ke scenarios/<id>.ts. Aturan: docs/MENULIS-SKENARIO.md.
// Ringkas isi skenario di sini: alur apa yang dibuktikan dan untuk tiket mana.
import { defineScenario } from '../src/core/types.ts'

const PLANNER = 'mbl.planner'

interface Data {
  docs: { label: string; nomor: string; url: string }[]
  wh_id: string
  item_id: string
}

export default defineScenario<Data>({
  meta: {
    id: 'contoh-skenario',
    title: 'Judul singkat skenario',
    group: 'material',
    tickets: ['FMS-0'],
    estimasi: '3 menit',
    tujuan: 'Membuktikan … (satu kalimat: perilaku apa yang harus terlihat di layar).',
    personas: [{ who: PLANNER, peran: 'membuka barang yang baru dibuat' }],
    data: ['Satu barang baru tiap jalan "Uji SR Contoh <stempel>" dengan saldo awal 5'],
    setelan: [],
    prasyarat: [],
    catatan: [],
  },

  // Data segar lewat API, tiap jalan. Jangan bergantung pada dokumen atau stok lama.
  async setup(ctx) {
    const rc = await ctx.as('mbl.storekeeper')
    const wh = await ctx.kit.findWarehouse(rc, 'Gudang Site Alpha')
    const tag = ctx.kit.stamp()
    const item = await ctx.kit.newItem(ctx, rc, wh.id, {
      sku: `SR-CTH-${tag}`,
      name: `Uji SR Contoh ${tag}`,
      quantity: 5,
    })
    return {
      wh_id: wh.id,
      item_id: item.id,
      docs: [{ label: 'Barang contoh', nomor: item.sku, url: `/inventory/items/${item.id}` }],
    }
  },

  steps: [
    {
      id: 'buka-barang',
      who: PLANNER,
      title: 'Putri membuka barang yang baru dibuat',
      expect: 'Halaman detail barang tampil dengan saldo 5',
      run: async (ctx, d) => {
        await ctx.open(`/inventory/items/${d.item_id}`)
        await ctx.say('Putri membuka barang yang baru dibuat di belakang layar', 3000)
      },
    },
  ],
})

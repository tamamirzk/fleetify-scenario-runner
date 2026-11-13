// bun run pemeriksaan — jalankan semua invarian DB sekali terhadap tenant TENANT_SLUG, tanpa
// skenario. Tanpa baseline: semua baris pelanggaran dilaporkan sebagai "sudah ada"; invarian
// mode kenaikan (append-only) hanya menampilkan nilai penghitungnya. Dokumentasi: docs/PEMERIKSAAN.md.
import { teksHasil } from './pemeriksaan/banding.ts'
import { INVARIAN } from './pemeriksaan/invarian.ts'
import { Pemeriksa } from './pemeriksaan/jalankan.ts'

const p = new Pemeriksa({ log: (l) => console.log(l) })
if (!p.dikonfigurasi) {
  console.log(teksHasil(await p.sekali()))
  process.exit(2)
}
console.log(`Pemeriksaan tenant ${p.tenant}: ${INVARIAN.length} invarian`)
const h = await p.sekali()
const peta = new Map(h.sudahAda.map((i) => [i.id, i]))
for (const inv of INVARIAN) {
  const g = h.galat.find((x) => x.id === inv.id)
  const d = h.dilewati.find((x) => x.id === inv.id)
  const ada = peta.get(inv.id)
  const st = g
    ? `GALAT   ${g.pesan}`
    : d
      ? `LEWAT   ${d.alasan}`
      : inv.mode === 'kenaikan'
        ? `SNAPSHOT ${ada ? `${ada.baris.length} tabel` : 'tidak ada tabel yang cocok'}`
        : ada
          ? `${String(ada.baris.length).padStart(3)} pelanggaran (sudah ada)`
          : 'lulus'
  console.log(`  ${inv.id.padEnd(20)} ${st}`)
  if (ada && inv.mode !== 'kenaikan')
    for (const b of ada.baris.slice(0, 3))
      console.log(
        `      ${Object.entries(b)
          .map(([k, v]) => `${k}=${v ?? '-'}`)
          .join('  ')}`,
      )
  if (ada && ada.baris.length > 3 && inv.mode !== 'kenaikan')
    console.log(`      … ${ada.baris.length - 3} baris lagi`)
}
console.log(
  `\n${h.pesan ?? ''} · ${(h.durasiMs / 1000).toFixed(1)} dtk · ${h.diperiksa} invarian dinilai`,
)
process.exit(h.status === 'galat' ? 1 : 0)

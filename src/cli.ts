// CLI Scenario Runner (tanpa panel). Format skenario sama dengan panel.
//   bun run scenario <slug> [--headed] [--speed 1.5] [--from <n>] [--data <slug>/<waktu>] [--tanpa-pemeriksaan] [--tanpa-ui]
//   bun run scenario --list
import path from 'node:path'
import { parseArgs } from 'node:util'
import { Run } from './core/run.ts'
import { bacaSemua, muatSkenario } from './core/scenarios.ts'
import { teksDiff, teksHasil } from './pemeriksaan/banding.ts'
import { teksHasilUi, teksUiLangkah } from './pemeriksaan/ui.ts'

const USAGE =
  'Pakai: bun run scenario <slug> [--headed] [--speed n] [--from n] [--data <slug>/<waktu>] [--tanpa-pemeriksaan] [--tanpa-ui] | --list'

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    list: { type: 'boolean' },
    headed: { type: 'boolean' },
    speed: { type: 'string' },
    from: { type: 'string' },
    data: { type: 'string' },
    'tanpa-pemeriksaan': { type: 'boolean' },
    'tanpa-ui': { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  },
})

if (values.help) {
  console.log(USAGE)
  process.exit(0)
}

if (values.list) {
  for (const b of bacaSemua()) {
    const err = b.skenario ? '' : `  [TIDAK VALID: ${b.masalah[0]?.message ?? ''}]`
    console.log(`${b.slug.padEnd(18)} ${b.task.padEnd(11)} ${b.skenario?.judul ?? b.path}${err}`)
  }
  process.exit(0)
}

const slug = positionals[0]
if (!slug) {
  console.error(USAGE)
  process.exit(2)
}

const berkas = muatSkenario(slug)
const run = new Run(berkas, {
  headed: !!values.headed,
  speed: Number(values.speed ?? 1),
  pemeriksaan: !values['tanpa-pemeriksaan'],
  ui: !values['tanpa-ui'],
})
run.on('log', (l: string) => console.log(l))
process.on('SIGINT', () => {
  void run.stop()
})

console.log(
  `Skenario ${berkas.skenario.judul} (${berkas.path}, ${berkas.skenario.langkah.length} langkah) · ${values.headed ? 'headed' : 'headless'} · jalan ${run.runId}`,
)
await run.prepare({ fromRun: values.data })
await run.start({ from: Math.max(0, Number(values.from ?? 1) - 1) })

const r = run.result
console.log('\nHasil per langkah:')
for (const s of r.steps) {
  console.log(
    `  ${String(s.n).padStart(2)}. ${s.status.padEnd(10)} ${s.title}${s.error ? `  → ${s.error}` : ''}${s.notes ? `  [${s.notes.join('; ')}]` : ''}`,
  )
  const ui = teksUiLangkah(s.ui)
  if (ui) console.log(`      ${ui}`)
  const db = s.db
  if (!db) continue
  if (db.status === 'ok')
    console.log(`      ✓ DB ok${db.durasiMs != null ? ` (${db.durasiMs} ms)` : ''}`)
  else if (db.status === 'pelanggaran')
    console.log(
      `      ✗ ${db.pelanggaran.reduce((a, b) => a + b.baris.length, 0)} pelanggaran: ${db.pelanggaran.map((x) => x.id).join(', ')}`,
    )
  else console.log(`      ! DB ${db.status}${db.galat[0] ? `: ${db.galat[0].pesan}` : ''}`)
  if (db.sembuh.length) console.log(`      ↺ sembuh: ${db.sembuh.map((x) => x.id).join(', ')}`)
  for (const d of db.dokumen) console.log(`      · ${teksDiff(d)}`)
  if (db.status === 'pelanggaran' && s.requests?.length)
    console.log(
      `      ↳ transaksi tersangka: ${[...s.requests]
        .reverse()
        .map((q) => `${q.method} ${q.path} ${q.status}`)
        .join('; ')}`,
    )
}
const passed = r.steps.filter((s) => s.status === 'lulus').length
console.log(
  `\nStatus: ${r.status} · ${passed}/${r.steps.length} lulus · bukti: ${path.relative(process.cwd(), run.dir)}`,
)
if (r.cleanup_error) console.log(`Pembersihan: ${r.cleanup_error}`)
if (r.trace) console.log(`trace: bunx playwright show-trace ${path.join(run.dir, r.trace)}`)
console.log(
  `\n${values['tanpa-pemeriksaan'] ? 'Pemeriksaan: dilewati (--tanpa-pemeriksaan)' : teksHasil(r.pemeriksaan)}`,
)
console.log(
  `\n${values['tanpa-ui'] ? 'Pemeriksaan UI: dilewati (--tanpa-ui)' : teksHasilUi(r.pemeriksaanUi)}`,
)
if (r.laporan) console.log(`\nLaporan gabungan: ${path.join(run.dir, r.laporan)}`)
const pelanggaran = r.pemeriksaan?.status === 'pelanggaran'
// Temuan DOM saja (status peringatan) tidak menggagalkan; pelanggaran statis baru menggagalkan.
const pelanggaranUi = r.pemeriksaanUi?.status === 'pelanggaran'
process.exit(r.status === 'selesai' && !r.cleanup_error && !pelanggaran && !pelanggaranUi ? 0 : 1)

// CLI Scenario Runner (tanpa panel). Format skenario sama dengan panel.
//   bun run scenario <slug> [--headed] [--speed 1.5] [--from <n>] [--data <slug>/<waktu>]
//   bun run scenario --list
import path from 'node:path'
import { parseArgs } from 'node:util'
import { Run } from './core/run.ts'
import { bacaSemua, muatSkenario } from './core/scenarios.ts'

const USAGE =
  'Pakai: bun run scenario <slug> [--headed] [--speed n] [--from n] [--data <slug>/<waktu>] | --list'

const { values, positionals } = parseArgs({
  args: Bun.argv.slice(2),
  allowPositionals: true,
  options: {
    list: { type: 'boolean' },
    headed: { type: 'boolean' },
    speed: { type: 'string' },
    from: { type: 'string' },
    data: { type: 'string' },
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
const run = new Run(berkas, { headed: !!values.headed, speed: Number(values.speed ?? 1) })
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
for (const s of r.steps)
  console.log(
    `  ${String(s.n).padStart(2)}. ${s.status.padEnd(10)} ${s.title}${s.error ? `  → ${s.error}` : ''}${s.notes ? `  [${s.notes.join('; ')}]` : ''}`,
  )
const passed = r.steps.filter((s) => s.status === 'lulus').length
console.log(
  `\nStatus: ${r.status} · ${passed}/${r.steps.length} lulus · bukti: ${path.relative(process.cwd(), run.dir)}`,
)
if (r.cleanup_error) console.log(`Pembersihan: ${r.cleanup_error}`)
if (r.trace) console.log(`trace: bunx playwright show-trace ${path.join(run.dir, r.trace)}`)
process.exit(r.status === 'selesai' && !r.cleanup_error ? 0 : 1)

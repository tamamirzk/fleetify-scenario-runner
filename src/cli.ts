// CLI Scenario Runner (tanpa panel). Format skenario sama dengan panel.
//   bun run scenario <id> [--headed] [--speed 1.5] [--from <n>] [--data <id>/<waktu>]
//   bun run scenario --list
import path from 'node:path'
import { parseArgs } from 'node:util'
import { Run } from './core/run.ts'
import { describeScenario, listScenarios, loadScenario } from './core/scenarios.ts'

const USAGE =
  'Pakai: bun run scenario <id> [--headed] [--speed n] [--from n] [--data <id>/<waktu>] | --list'

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
  for (const s of await listScenarios()) {
    const group = 'group' in s ? s.group : '-'
    const err = 'error' in s ? `  [GALAT ${s.error}]` : ''
    console.log(`${s.id.padEnd(18)} ${group.padEnd(11)} ${s.title}${err}`)
  }
  process.exit(0)
}

const id = positionals[0]
if (!id) {
  console.error(USAGE)
  process.exit(2)
}

const desc = await describeScenario(id)
const run = new Run(id, await loadScenario(id), {
  headed: !!values.headed,
  speed: Number(values.speed ?? 1),
})
run.on('log', (l: string) => console.log(l))
process.on('SIGINT', () => {
  void run.stop()
})

console.log(
  `Skenario ${desc.title} (${desc.steps.length} langkah) · ${values.headed ? 'headed' : 'headless'} · jalan ${run.runId}`,
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
if (r.trace) console.log(`trace: bunx playwright show-trace ${path.join(run.dir, r.trace)}`)
process.exit(r.status === 'selesai' ? 0 : 1)

// bun run new <task> <slug> — buat kerangka scenarios/<task>/<slug>.json dari templates/skenario.json.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { config, ROOT } from './core/config.ts'
import { SLUG, TASK } from './core/scenarios.ts'

const [task, slug] = Bun.argv.slice(2)
if (!task || !slug || !TASK.test(task) || !SLUG.test(slug)) {
  console.error('Pakai: bun run new <task> <slug>   (mis. bun run new FMS-62 retur-rusak)')
  process.exit(2)
}
const dir = path.join(config.scenariosDir, task)
const target = path.join(dir, `${slug}.json`)
if (existsSync(target)) {
  console.error(`${path.relative(ROOT, target)} sudah ada`)
  process.exit(1)
}
mkdirSync(dir, { recursive: true })
const template = readFileSync(path.join(ROOT, 'templates/skenario.json'), 'utf8')
writeFileSync(
  target,
  template
    .replaceAll('"contoh-skenario"', `"${slug}"`)
    .replaceAll('"FMS-0"', `"${/^[A-Z]+-\d+$/.test(task) ? task : 'FMS-0'}"`),
)
console.log(`Dibuat ${path.relative(ROOT, target)}. Lengkapi, lalu: bun run check:scenarios`)

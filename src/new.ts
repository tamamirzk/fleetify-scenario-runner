// bun run new <id> — buat kerangka scenarios/<id>.ts dari templates/scenario.ts.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { ROOT } from './core/config.ts'
import { ID_PATTERN, scenarioFile } from './core/scenarios.ts'

const id = Bun.argv[2]
if (!id || !ID_PATTERN.test(id)) {
  console.error('Pakai: bun run new <id>   (huruf kecil, angka, tanda hubung, mis. retur-rusak)')
  process.exit(2)
}
const target = scenarioFile(id)
if (existsSync(target)) {
  console.error(`scenarios/${id}.ts sudah ada`)
  process.exit(1)
}
const template = readFileSync(path.join(ROOT, 'templates/scenario.ts'), 'utf8')
writeFileSync(
  target,
  template.replace(/^\/\/ TEMPLAT.*\n/m, '').replaceAll("'contoh-skenario'", `'${id}'`),
)
console.log(`Dibuat scenarios/${id}.ts. Lengkapi meta, lalu: bun run check:scenarios`)

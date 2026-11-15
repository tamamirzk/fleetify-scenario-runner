// bun run new <modul> <slug> [tiket] — buat kerangka scenarios/<modul>/<slug>.json dari templates/skenario.json.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { config, ROOT } from './core/config.ts'
import { SLUG } from './core/scenarios.ts'
import { MODUL } from './core/skema.ts'

const [modul, slug, tiket] = Bun.argv.slice(2)
const PAKAI = `Pakai: bun run new <modul> <slug> [tiket]   (mis. bun run new wo retur-rusak FMS-62)\nModul: ${MODUL.join(', ')}`
if (!modul || !slug || !(MODUL as readonly string[]).includes(modul) || !SLUG.test(slug)) {
  console.error(PAKAI)
  process.exit(2)
}
if (tiket && !/^[A-Z]+-\d+$/.test(tiket)) {
  console.error(`Tiket "${tiket}" tidak sah (format FMS-123)\n${PAKAI}`)
  process.exit(2)
}
const dir = path.join(config.scenariosDir, modul)
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
    .replaceAll('"modul": "material"', `"modul": "${modul}"`)
    .replaceAll('"FMS-0"', `"${tiket ?? 'FMS-0'}"`),
)
console.log(`Dibuat ${path.relative(ROOT, target)}. Lengkapi, lalu: bun run check:scenarios`)

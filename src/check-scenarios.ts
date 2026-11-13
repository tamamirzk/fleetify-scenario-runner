// bun run check:scenarios — tegakkan skema dan standar skenario (docs/SKEMA-SKENARIO.md).
import { bacaSemua } from './core/scenarios.ts'

const semua = bacaSemua()
if (semua.length === 0) {
  console.error('Tidak ada skenario di scenarios/<task>/*.json')
  process.exit(1)
}
let failed = 0
for (const b of semua) {
  if (b.masalah.length === 0) {
    console.log(`✓ ${b.path}`)
    continue
  }
  failed++
  console.log(`✗ ${b.path}`)
  for (const m of b.masalah)
    console.log(`    [${m.aturan}] ${m.path ? `${m.path}: ` : ''}${m.message}`)
}
console.log(`\n${semua.length - failed}/${semua.length} skenario memenuhi standar`)
process.exit(failed ? 1 : 0)

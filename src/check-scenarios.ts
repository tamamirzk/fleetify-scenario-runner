// bun run check:scenarios — tegakkan standar skenario (lihat docs/MENULIS-SKENARIO.md).
import { readFileSync } from 'node:fs'
import { MetaSchema } from './core/meta.ts'
import { checkScenario, lintSource, type Problem } from './core/rules.ts'
import { ID_PATTERN, loadScenario, scenarioFile, scenarioIds } from './core/scenarios.ts'

let failed = 0
const ids = scenarioIds()
if (ids.length === 0) {
  console.error('Tidak ada skenario di scenarios/')
  process.exit(1)
}
for (const id of ids) {
  const problems: Problem[] = []
  if (!ID_PATTERN.test(id))
    problems.push({ rule: 'satu-berkas', message: 'nama berkas harus kebab-case' })
  try {
    const s = await loadScenario(id)
    problems.push(...checkScenario(id, s))
    const meta = MetaSchema.safeParse(s.meta)
    const pengecualianDb =
      meta.success && !!meta.data.pengecualian?.some((p) => p.aturan === 'db-lewat-api')
    problems.push(...lintSource(readFileSync(scenarioFile(id), 'utf8'), { pengecualianDb }))
  } catch (e) {
    problems.push({ rule: 'muat', message: (e as Error).message.split('\n')[0] ?? '' })
  }
  if (problems.length === 0) {
    console.log(`✓ ${id}`)
    continue
  }
  failed++
  console.log(`✗ ${id}`)
  for (const p of problems)
    console.log(`    [${p.rule}] ${p.line ? `baris ${p.line}: ` : ''}${p.message}`)
}
console.log(`\n${ids.length - failed}/${ids.length} skenario memenuhi standar`)
process.exit(failed ? 1 : 0)

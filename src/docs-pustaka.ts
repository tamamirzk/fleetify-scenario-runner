// bun run docs:pustaka — tulis ulang daftar aksi pustaka di docs/SKEMA-SKENARIO.md
// (di antara penanda pustaka:mulai dan pustaka:akhir), dari src/pustaka/index.ts.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { ZodType } from 'zod'
import { ROOT } from './core/config.ts'
import { PERSONA_IDS } from './core/personas.ts'
import { PUSTAKA } from './pustaka/index.ts'

type Def = {
  type: string
  innerType?: ZodType
  defaultValue?: unknown
  entries?: object
  element?: ZodType
}
const def = (t: ZodType) => (t as unknown as { def: Def }).def

function tipe(t: ZodType): string {
  const d = def(t)
  if (d.type === 'optional' || d.type === 'default') return tipe(d.innerType as ZodType)
  if (d.type === 'enum' && Object.keys(d.entries ?? {}).length === PERSONA_IDS.length)
    return 'persona'
  if (d.type === 'enum')
    return Object.keys(d.entries ?? {})
      .map((x) => `\`${x}\``)
      .join(' \\| ')
  if (d.type === 'array') return `${tipe(d.element as ZodType)}[]`
  if (d.type === 'object') return 'objek'
  if (d.type === 'lazy') return 'sasaran'
  return d.type
}

const baris: string[] = []
for (const [nama, p] of Object.entries(PUSTAKA)) {
  baris.push(`### \`${nama}\` (${p.jenis === 'api' ? '`api` / `siapkan`' : '`layar`'})`, '')
  baris.push(
    `${p.ringkasan}${p.pengecualianDb ? ' **Wajib `pengecualian` db-lewat-api.**' : ''}`,
    '',
  )
  const shape = p.argumen.shape as Record<string, ZodType>
  if (Object.keys(shape).length) {
    baris.push('| Argumen | Tipe | Wajib | Keterangan |', '|---|---|---|---|')
    for (const [k, f] of Object.entries(shape)) {
      const d = def(f)
      const wajib = !f.safeParse(undefined).success
      const bawaan = d.type === 'default' ? `bawaan \`${JSON.stringify(d.defaultValue)}\`` : ''
      const ket = [f.description, bawaan].filter(Boolean).join('; ')
      baris.push(`| \`${k}\` | ${tipe(f)} | ${wajib ? 'ya' : ''} | ${ket} |`)
    }
    baris.push('')
  }
  if (p.hasil) baris.push(`Hasil (untuk \`simpan\`): \`${p.hasil}\``, '')
}

const file = path.join(ROOT, 'docs/SKEMA-SKENARIO.md')
const doc = readFileSync(file, 'utf8')
const out = doc.replace(
  /(<!-- pustaka:mulai -->\n)[\s\S]*?(<!-- pustaka:akhir -->)/,
  `$1${baris.join('\n')}\n$2`,
)
if (out === doc && !doc.includes('<!-- pustaka:mulai -->')) {
  console.error('Penanda pustaka:mulai/akhir tidak ada di docs/SKEMA-SKENARIO.md')
  process.exit(1)
}
writeFileSync(file, out)
console.log(`docs/SKEMA-SKENARIO.md: ${Object.keys(PUSTAKA).length} aksi pustaka`)

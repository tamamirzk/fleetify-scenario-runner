// bun run docs:pustaka — tulis ulang daftar aksi pustaka di docs/SKEMA-SKENARIO.md
// (di antara penanda pustaka:mulai dan pustaka:akhir), dari src/pustaka/index.ts, dan daftar
// invarian Pemeriksaan di docs/PEMERIKSAAN.md (penanda invarian:mulai/akhir) dari src/pemeriksaan/invarian.ts.
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import type { ZodType } from 'zod'
import { ROOT } from './core/config.ts'
import { PERSONA_IDS } from './core/personas.ts'
import { INVARIAN } from './pemeriksaan/invarian.ts'
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

/** Tulis ulang isi di antara penanda `<!-- nama:mulai -->` dan `<!-- nama:akhir -->`. */
function tulisAntara(relFile: string, nama: string, isi: string[]) {
  const file = path.join(ROOT, relFile)
  const doc = readFileSync(file, 'utf8')
  const mulai = `<!-- ${nama}:mulai -->`
  if (!doc.includes(mulai)) {
    console.error(`Penanda ${nama}:mulai/akhir tidak ada di ${relFile}`)
    process.exit(1)
  }
  const re = new RegExp(`(${mulai}\\n)[\\s\\S]*?(<!-- ${nama}:akhir -->)`)
  writeFileSync(file, doc.replace(re, `$1${isi.join('\n')}\n$2`))
}

tulisAntara('docs/SKEMA-SKENARIO.md', 'pustaka', baris)
console.log(`docs/SKEMA-SKENARIO.md: ${Object.keys(PUSTAKA).length} aksi pustaka`)

const inv: string[] = []
for (const i of INVARIAN) {
  inv.push(`### \`${i.id}\` — ${i.judul}`, '')
  inv.push(i.keterangan, '')
  inv.push(
    `Mode: ${i.mode === 'kenaikan' ? 'kenaikan penghitung' : 'baris pelanggaran'} · kunci baris: ${i.kolomKunci.map((k) => `\`${k}\``).join(', ')}${i.kolomAngka ? ` · kolom angka: ${i.kolomAngka.map((k) => `\`${k}\``).join(', ')}` : ''}${i.tabel.length ? ` · tabel wajib: ${i.tabel.map((t) => `\`${t}\``).join(', ')}` : ''}`,
    '',
  )
}
tulisAntara('docs/PEMERIKSAAN.md', 'invarian', inv)
console.log(`docs/PEMERIKSAAN.md: ${INVARIAN.length} invarian`)

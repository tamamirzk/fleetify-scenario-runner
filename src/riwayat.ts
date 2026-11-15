// bun run riwayat --daftar
//                 --hapus-lebih-lama <hari> [--ya]
//                 --simpan <n> [--ya]
//                 --hapus-trace [--simpan-trace <n>] [--ya]
// Mengelola riwayat jalan di runs/ (tidak di-commit): tanpa --ya hanya menampilkan rencana. Hanya folder
// jalan di dalam runs/ repo ini; jalan yang sedang berjalan (kunci tenant) dan jalan bertemuan tidak dihapus
// kecuali --termasuk-temuan. Temuan di docs/TEMUAN.md tetap.
import { parseArgs } from 'node:util'
import { config } from './core/config.ts'
import { jalanTerkunci } from './core/kunci.ts'
import {
  daftarJalanDisk,
  hapusJalan,
  hapusTrace,
  type InfoJalan,
  pilihLebihLama,
  pilihSimpan,
  teksByte,
} from './core/riwayat.ts'

const { values } = parseArgs({
  args: Bun.argv.slice(2),
  options: {
    daftar: { type: 'boolean' },
    'hapus-lebih-lama': { type: 'string' },
    simpan: { type: 'string' },
    'hapus-trace': { type: 'boolean' },
    'simpan-trace': { type: 'string' },
    'termasuk-temuan': { type: 'boolean' },
    ya: { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
  },
})
const PAKAI =
  'Pakai: bun run riwayat --daftar | --hapus-lebih-lama <hari> | --simpan <n> | --hapus-trace [--simpan-trace <n>]  [--termasuk-temuan] [--ya]'
const angka = (v: string | undefined, nama: string) => {
  const n = Number(v)
  if (!Number.isInteger(n) || n < 0) {
    console.error(`${nama} harus bilangan bulat ≥ 0`)
    process.exit(2)
  }
  return n
}

const semua = daftarJalanDisk(config.runsDir)
const aktif = jalanTerkunci()
const tulisDaftar = (xs: readonly InfoJalan[]) => {
  for (const j of xs)
    console.log(
      `${j.run_id.padEnd(48)} ${j.status.padEnd(10)} ${teksByte(j.ukuran).padStart(9)}${j.punya_trace ? `  trace ${teksByte(j.ukuran_trace)}` : j.trace_dihapus ? '  trace dihapus' : ''}${j.temuan ? `  ${j.temuan} temuan` : ''}${aktif.has(j.run_id) ? '  SEDANG BERJALAN' : ''}`,
    )
}

if (
  values.help ||
  !(values.daftar || values['hapus-lebih-lama'] || values.simpan || values['hapus-trace'])
) {
  console.log(PAKAI)
  process.exit(values.help ? 0 : 2)
}

if (values.daftar) {
  tulisDaftar(semua)
  console.log(
    `\n${semua.length} jalan · ${teksByte(semua.reduce((a, j) => a + j.ukuran, 0))} (trace ${teksByte(semua.reduce((a, j) => a + j.ukuran_trace, 0))}) · ${config.runsDir}`,
  )
  process.exit(0)
}

let ids: string[] = []
let jenis: 'jalan' | 'trace' = 'jalan'
if (values['hapus-lebih-lama'] !== undefined)
  ids = pilihLebihLama(semua, angka(values['hapus-lebih-lama'], '--hapus-lebih-lama'))
else if (values.simpan !== undefined) ids = pilihSimpan(semua, angka(values.simpan, '--simpan'))
else {
  jenis = 'trace'
  const simpanTrace =
    values['simpan-trace'] === undefined ? 0 : angka(values['simpan-trace'], '--simpan-trace')
  const berTrace = semua.filter((j) => j.punya_trace)
  const simpan = new Set(
    berTrace
      .filter((j) => !pilihSimpan(berTrace, simpanTrace).includes(j.run_id))
      .map((j) => j.run_id),
  )
  ids = berTrace.filter((j) => !simpan.has(j.run_id)).map((j) => j.run_id)
}
const pilih = semua.filter((j) => ids.includes(j.run_id))
const lewati = pilih.filter(
  (j) => aktif.has(j.run_id) || (jenis === 'jalan' && j.temuan > 0 && !values['termasuk-temuan']),
)
const kerja = pilih.filter((j) => !lewati.includes(j))
const byte = kerja.reduce((a, j) => a + (jenis === 'jalan' ? j.ukuran : j.ukuran_trace), 0)
console.log(
  `${jenis === 'jalan' ? 'Jalan' : 'Trace'} yang akan dihapus: ${kerja.length} (${teksByte(byte)})`,
)
tulisDaftar(kerja)
for (const j of lewati)
  console.log(
    `  dilewati ${j.run_id}: ${aktif.has(j.run_id) ? 'sedang berjalan' : `${j.temuan} temuan tercatat (tambah --termasuk-temuan untuk ikut menghapus; temuan di docs/TEMUAN.md tetap)`}`,
  )
if (!values.ya) {
  console.log('\nBelum ada yang dihapus. Ulangi dengan --ya untuk menghapus.')
  process.exit(0)
}
let n = 0
for (const j of kerja)
  try {
    if (jenis === 'jalan') hapusJalan(config.runsDir, j.run_id, aktif)
    else hapusTrace(config.runsDir, j.run_id, aktif)
    n++
  } catch (e) {
    console.error(`  gagal ${j.run_id}: ${(e as Error).message}`)
  }
console.log(`Selesai: ${n} ${jenis === 'jalan' ? 'jalan' : 'trace'} dihapus (${teksByte(byte)}).`)

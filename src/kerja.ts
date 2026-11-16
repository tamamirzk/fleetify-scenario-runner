// bun run kerja — alur Kerja per tiket Plane (docs/KERJA.md). Dipakai AI di sesi Claude Code dan developer.
//   bun run kerja daftar
//   bun run kerja ambil FMS-87                  salin tiket dari Plane ke kerja/FMS-87/
//   bun run kerja lihat FMS-87                  ringkasan keadaan (untuk AI)
//   bun run kerja tahap FMS-87 rencana "catatan"
//   bun run kerja target FMS-87 target.json     sasaran potret (halaman + query DB)
//   bun run kerja potret FMS-87 sebelum|sesudah
//   bun run kerja catat FMS-87 --branch feat/x --commit abc123 --skenario slug
//   bun run kerja plane FMS-87 komentar ["catatan"] [--ya]   tanpa --ya: pratinjau saja
//   bun run kerja plane FMS-87 status "Done" [--ya]

import {
  bacaBerkasKerja,
  bacaKerja,
  daftarKerja,
  FASE,
  type Fase,
  type Kerja,
  komentarHtml,
  LABEL_TAHAP,
  TAHAP,
  type Tahap,
} from './core/kerja.ts'
import {
  ambilKerja,
  catatKerja,
  komentarKePlane,
  potretKerja,
  setTahap,
  setTarget,
  statusKePlane,
} from './core/kerja-aksi.ts'
import { closeSharedBrowser } from './core/lib.ts'

const [perintah, key, ...sisa] = Bun.argv.slice(2)
const ya = sisa.includes('--ya')
const posisi = sisa.filter((x) => !x.startsWith('--'))
const opsi = (nama: string) => {
  const out: string[] = []
  sisa.forEach((x, i) => {
    if (x === `--${nama}` && sisa[i + 1]) out.push(sisa[i + 1] as string)
  })
  return out
}

function ringkas(k: Kerja) {
  const p = (f: Fase) => {
    const x = k.potret[f]
    return x
      ? `${x.layar.filter((l) => l.file).length}/${x.layar.length} layar, ${x.db.filter((d) => d.file).length}/${x.db.length} query · ${x.at}`
      : 'belum'
  }
  console.log(`${k.key} · ${k.judul}`)
  console.log(`  Tahap      : ${LABEL_TAHAP[k.tahap]} (${k.tahap})`)
  console.log(`  Plane      : ${k.plane.status} · ${k.url}`)
  console.log(`  Branch     : ${k.branch ?? '-'} · commit ${k.commit.join(', ') || '-'}`)
  console.log(`  Target     : ${k.target.layar.length} layar, ${k.target.db.length} query`)
  console.log(`  Sebelum    : ${p('sebelum')}`)
  console.log(`  Sesudah    : ${p('sesudah')}`)
  console.log(`  Skenario   : ${k.skenario.join(', ') || '-'}`)
  console.log(
    `  Rencana    : ${bacaBerkasKerja(k.key, 'rencana.md') ? `ada (kerja/${k.key}/rencana.md)` : 'belum'}`,
  )
  console.log(`  Komentar   : ${k.plane.komentar_at ?? '-'}`)
}

const PAKAI =
  'Pakai: bun run kerja <daftar|ambil|lihat|tahap|target|potret|catat|plane> [KEY] ... (lihat docs/KERJA.md)'

try {
  switch (perintah) {
    case 'daftar': {
      const semua = daftarKerja()
      if (!semua.length) console.log('Belum ada kerja. Mulai: bun run kerja ambil FMS-87')
      for (const k of semua)
        console.log(`${k.key.padEnd(8)} ${LABEL_TAHAP[k.tahap].padEnd(20)} ${k.judul}`)
      break
    }
    case 'ambil': {
      if (!key) throw new Error(PAKAI)
      ringkas(await ambilKerja(key))
      console.log(`\nSalinan tiket: kerja/${key}/tiket.md`)
      break
    }
    case 'lihat': {
      if (!key) throw new Error(PAKAI)
      ringkas(bacaKerja(key))
      break
    }
    case 'tahap': {
      const t = posisi[0] as Tahap
      if (!key || !TAHAP.includes(t))
        throw new Error(`Pakai: bun run kerja tahap KEY <${TAHAP.join('|')}> ["catatan"]`)
      ringkas(setTahap(key, t, posisi.slice(1).join(' ')))
      break
    }
    case 'target': {
      if (!key || !posisi[0]) throw new Error('Pakai: bun run kerja target KEY <berkas.json>')
      const k = setTarget(key, posisi[0])
      console.log(`Target ${key}: ${k.target.layar.length} layar, ${k.target.db.length} query`)
      break
    }
    case 'potret': {
      const f = posisi[0] as Fase
      if (!key || !FASE.includes(f))
        throw new Error('Pakai: bun run kerja potret KEY sebelum|sesudah')
      ringkas(await potretKerja(key, f, (l) => console.log(`  ${l}`)))
      console.log(`\nBerkas: kerja/${key}/${f}/`)
      break
    }
    case 'catat': {
      if (!key)
        throw new Error('Pakai: bun run kerja catat KEY [--branch b] [--commit c] [--skenario s]')
      ringkas(
        catatKerja(key, {
          branch: opsi('branch')[0],
          commit: opsi('commit'),
          skenario: opsi('skenario'),
        }),
      )
      break
    }
    case 'plane': {
      const jenis = posisi[0]
      if (!key || !['komentar', 'status'].includes(jenis ?? ''))
        throw new Error(
          'Pakai: bun run kerja plane KEY komentar ["catatan"] | status "<nama>"  [--ya]',
        )
      const arg = posisi.slice(1).join(' ')
      if (jenis === 'status' && !arg) throw new Error('Sebutkan nama status, mis. "Done"')
      if (!ya) {
        console.log(
          'PRATINJAU (belum dikirim). Menulis ke Plane terlihat oleh tim; ulangi dengan --ya setelah dikonfirmasi.\n',
        )
        if (jenis === 'komentar') console.log(komentarHtml(bacaKerja(key), arg))
        else console.log(`Pindahkan ${key} dari "${bacaKerja(key).plane.status}" ke "${arg}"`)
        break
      }
      const k =
        jenis === 'komentar' ? await komentarKePlane(key, arg) : await statusKePlane(key, arg)
      console.log(
        jenis === 'komentar' ? `Komentar terkirim ke ${key}` : `Status ${key}: ${k.plane.status}`,
      )
      break
    }
    default:
      console.log(PAKAI)
      process.exitCode = perintah ? 1 : 0
  }
} catch (e) {
  console.error((e as Error).message)
  process.exitCode = 1
} finally {
  if (perintah === 'potret') await closeSharedBrowser()
}

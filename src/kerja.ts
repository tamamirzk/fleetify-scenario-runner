// bun run kerja — monitoring dan dokumentasi tugas Plane (docs/KERJA.md). Dipakai di sesi Claude Code dan langsung.
//   bun run kerja daftar
//   bun run kerja ambil FMS-87                  salin tiket dari Plane ke kerja/FMS-87/
//   bun run kerja lihat FMS-87                  ringkasan keadaan
//   bun run kerja tahap FMS-87 dipelajari "catatan"
//   bun run kerja target FMS-87 target.json     sasaran potret (halaman + query DB)
//   bun run kerja potret FMS-87 sebelum|sesudah [--rinci]
//   bun run kerja gerbang FMS-87 fokus|ci [--dir ~/work/fleetify/v2] [--rinci]   satu baris + log
//   bun run kerja kesehatan [FMS-87]           layanan v2, Prisma, worktree API, komputer
//   bun run kerja cek FMS-87 lulus|gagal|belum "kriteria" ["bukti"]
//   bun run kerja catat FMS-87 --skenario slug [--branch feat/x --commit abc123 --worktree dir]
//   bun run kerja plane FMS-87 komentar ["catatan"] [--ya]   tanpa --ya: pratinjau saja
//   bun run kerja plane FMS-87 status "Done" [--ya]

import { ringkasGerbang } from './core/gerbang.ts'
import {
  bacaBerkasKerja,
  bacaKerja,
  daftarKerja,
  FASE,
  type Fase,
  HASIL_CEK,
  type HasilCek,
  type Kerja,
  komentarHtml,
  LABEL_TAHAP,
  TAHAP,
  type Tahap,
} from './core/kerja.ts'
import {
  ambilKerja,
  catatKerja,
  cekKerja,
  gerbangKerja,
  komentarKePlane,
  potretKerja,
  setTahap,
  setTarget,
  statusKePlane,
} from './core/kerja-aksi.ts'
import { periksaKesehatan, ringkasKesehatan } from './core/kesehatan.ts'
import { closeSharedBrowser } from './core/lib.ts'

const [perintah, key, ...sisa] = Bun.argv.slice(2)
const ya = sisa.includes('--ya')
const rinci = sisa.includes('--rinci')
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
  const tanda = { lulus: '✓', gagal: '×', belum: '○' } as const
  const v = k.verifikasi
  console.log(
    `  Verifikasi : ${v.length ? `${v.filter((c) => c.hasil === 'lulus').length} lulus, ${v.filter((c) => c.hasil === 'gagal').length} gagal, ${v.filter((c) => c.hasil === 'belum').length} belum` : 'belum ada kriteria'}`,
  )
  for (const c of v)
    console.log(`               ${tanda[c.hasil]} ${c.kriteria}${c.bukti ? ` — ${c.bukti}` : ''}`)
  if (k.branch || k.commit.length)
    console.log(`  Kode v2    : ${k.branch ?? '-'} · commit ${k.commit.join(', ') || '-'}`)
  console.log(`  Target     : ${k.target.layar.length} layar, ${k.target.db.length} query`)
  console.log(`  Sebelum    : ${p('sebelum')}`)
  console.log(`  Sesudah    : ${p('sesudah')}`)
  console.log(`  Skenario   : ${k.skenario.join(', ') || '-'}`)
  console.log(
    `  Catatan    : ${bacaBerkasKerja(k.key, 'catatan.md') ? `ada (kerja/${k.key}/catatan.md)` : 'belum'}`,
  )
  console.log(`  Komentar   : ${k.plane.komentar_at ?? '-'}`)
}

const PAKAI =
  'Pakai: bun run kerja <daftar|ambil|lihat|tahap|target|potret|gerbang|kesehatan|cek|catat|plane> [KEY] ... (lihat docs/KERJA.md)'

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
      // Ringkas (R-10.2): progres hanya dengan --rinci; hasil satu baris + yang gagal.
      const k = await potretKerja(key, f, rinci ? (l) => console.log(`  ${l}`) : undefined)
      const p = k.potret[f]
      const gagal = [...(p?.layar ?? []), ...(p?.db ?? [])].filter((x) => x.galat)
      const nL = p?.layar.filter((l) => l.file).length ?? 0
      const nD = p?.db.filter((d) => d.file).length ?? 0
      console.log(
        `${gagal.length ? '×' : '✓'} potret ${f}: ${nL}/${p?.layar.length ?? 0} layar, ${nD}/${p?.db.length ?? 0} query · kerja/${key}/${f}/`,
      )
      for (const g of gagal) console.log(`  × ${g.nama}: ${String(g.galat).split('\n')[0]}`)
      if (gagal.length) process.exitCode = 1
      break
    }
    case 'gerbang': {
      const t = posisi[0]
      if (!key || (t !== 'fokus' && t !== 'ci'))
        throw new Error('Pakai: bun run kerja gerbang KEY fokus|ci [--dir worktree] [--rinci]')
      const h = await gerbangKerja(key, t, {
        dir: opsi('dir')[0],
        rinci: rinci ? (l) => console.log(l) : undefined,
      })
      console.log(ringkasGerbang(h))
      if (h.hasil === 'gagal') process.exitCode = 1
      break
    }
    case 'kesehatan': {
      const commitKerja = key ? (bacaKerja(key).commit.at(-1) ?? null) : null
      const h = await periksaKesehatan({ commitKerja })
      console.log(ringkasKesehatan(h))
      if (h.cek.some((c) => c.hasil === 'gagal')) process.exitCode = 1
      break
    }
    case 'cek': {
      const hasil = posisi[0] as HasilCek
      if (!key || !HASIL_CEK.includes(hasil) || !posisi[1])
        throw new Error(
          `Pakai: bun run kerja cek KEY <${HASIL_CEK.join('|')}> "kriteria" ["bukti"]`,
        )
      ringkas(cekKerja(key, posisi[1], hasil, posisi.slice(2).join(' ')))
      break
    }
    case 'catat': {
      if (!key)
        throw new Error('Pakai: bun run kerja catat KEY [--skenario s] [--branch b] [--commit c]')
      ringkas(
        catatKerja(key, {
          branch: opsi('branch')[0],
          commit: opsi('commit'),
          skenario: opsi('skenario'),
          worktree: opsi('worktree')[0],
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

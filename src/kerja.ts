// bun run kerja — monitoring dan dokumentasi tugas Plane (docs/KERJA.md). Dipakai di sesi Claude Code dan langsung.
//   bun run kerja daftar
//   bun run kerja ambil FMS-87                  salin tiket dari Plane ke kerja/FMS-87/
//   bun run kerja lihat FMS-87                  ringkasan keadaan
//   bun run kerja tahap FMS-87 dipelajari "catatan"
//   bun run kerja target FMS-87 target.json     sasaran potret (halaman + query DB)
//   bun run kerja potret FMS-87 sebelum|sesudah [--rinci]
//   bun run kerja gerbang FMS-87 fokus|ci [--dir ~/work/fleetify/v2] [--rinci]   satu baris + log
//   bun run kerja kesehatan [FMS-87]           layanan v2, Prisma, worktree API, komputer
//   bun run kerja catatan FMS-87 [brief|akhir] [--render]   gerbang catatan; --render cetak dokumen
//   bun run kerja tanya FMS-87 "pertanyaan" [--usul "a" --usul "b"]
//   bun run kerja jawab FMS-87 <no> "jawaban"            jawaban Tams → keputusan
//   bun run kerja putuskan FMS-87 "keputusan" [--alasan "…"] [--oleh ai|tams]
//   Laporan format 2 (kerja baru; lima kartu, butir hanya ditambah):
//   bun run kerja masalah KEY "ringkas" [--penyebab "…"]
//   bun run kerja temuan KEY "teks" --jenis penyebab|sampingan|risiko|data-uji [--rinci "…" | --rinci-berkas f] [--koreksi n]
//   bun run kerja lakukan KEY "teks" [--rencana] [--commit sha] [--koreksi n]
//   bun run kerja hasil KEY "penyelesaian" [--sementara] [--belum "…"]... [--tabel-berkas f.json]
//   bun run kerja minta-ubah FMS-87 A|B "teks"  ·  bun run kerja ubah-selesai FMS-87 <no>
//   bun run kerja staging FMS-87 tambah "teks" | centang <no> | batal <no>
//   bun run kerja tunda FMS-87 ["alasan"]  ·  bun run kerja aktifkan FMS-87
//   bun run kerja slot FMS-87 <1|2|3>  ·  antre FMS-87 [--slot n]  ·  lepas FMS-87   (slot paralel)
//   bun run kerja antre-urut FMS-87 naik|turun  ·  antre-pindah FMS-87 <n|global>  ·  antre-mulai <n>
//   bun run kerja workspace                  slot, antrean per slot, Antre global, komputer
//   bun run kerja panen FMS-87 [--modul fleet] [--tulis]   catatan → docs-site (pratinjau tanpa --tulis)
//   bun run kerja metrik [FMS-87]            lama per tahap, kerja ulang, token sesi Claude
//   bun run kerja cek FMS-87 lulus|gagal|belum "kriteria" ["bukti"]
//   bun run kerja catat FMS-87 --skenario slug [--branch feat/x --commit abc123 --worktree dir]
//   bun run kerja plane FMS-87 komentar ["catatan"] [--ya]   tanpa --ya: pratinjau saja
//   bun run kerja plane FMS-87 status "Done" [--ya]

import { readFileSync } from 'node:fs'
import { antreanSlot, slotAntre } from './core/antrean.ts'
import {
  centangCekStaging,
  jawabPertanyaan,
  renderCatatan,
  ringkasPeriksaCatatan,
  selesaikanMintaUbah,
  tambahCekStaging,
  tambahKeputusan,
  tambahMintaUbah,
  tambahPertanyaan,
} from './core/catatan.ts'
import { ringkasGerbang } from './core/gerbang.ts'
import {
  bacaBerkasKerja,
  bacaKerja,
  daftarKerja,
  dataCatatan,
  FASE,
  type Fase,
  formatDua,
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
  antrekanKerja,
  aturUrutAntre,
  catatKerja,
  cekKerja,
  gerbangKerja,
  jalankanAntreanSlot,
  komentarKePlane,
  laporanLengkap,
  lepasSlotKerja,
  panenKerja,
  pemakaiSlot,
  periksaCatatanKerja,
  pindahAntre,
  potretKerja,
  semuaMetrik,
  setTahap,
  setTarget,
  slotKerja,
  statusKePlane,
  tempatkanDiSlot,
  tundaKerja,
  ubahDataCatatan,
  ubahLaporan,
} from './core/kerja-aksi.ts'
import { AWALAN_LOKAL, type AwalanLokal, buatKerjaLokal } from './core/kerja-lokal.ts'
import { periksaKesehatan, ringkasKesehatan } from './core/kesehatan.ts'
import { bacaKomputer } from './core/komputer.ts'
import {
  bacaTabel,
  renderLaporanMd,
  setHasil,
  setMasalah,
  tambahDilakukan,
  tambahTemuan,
} from './core/laporan-kerja.ts'
import { closeSharedBrowser } from './core/lib.ts'
import { denganSlot, keadaanSlot, type NomorSlot, SLOT_CHAT, semuaSlot } from './core/slot.ts'

const [perintah, key, ...sisa] = Bun.argv.slice(2)
const ya = sisa.includes('--ya')
const rinci = sisa.includes('--rinci')
// Opsi bernilai (`--alasan "…"`): nilainya bukan argumen posisi. Dulu ikut masuk, sehingga
// `kerja putuskan KEY "…" --alasan "x" --oleh tams` menempelkan "x tams" ke teks keputusan.
const OPSI_BERNILAI = new Set([
  '--alasan',
  '--branch',
  '--commit',
  '--dir',
  '--belum',
  '--jenis',
  '--koreksi',
  '--modul',
  '--oleh',
  '--pelepas',
  '--penyebab',
  '--rinci-berkas',
  '--tabel-berkas',
  '--skenario',
  '--slot',
  '--usul',
  '--worktree',
])
// `--rinci` tanpa nilai = progres potret; bernilai hanya di `kerja temuan --rinci "…"`.
const bernilai = (x: string) => OPSI_BERNILAI.has(x) || (perintah === 'temuan' && x === '--rinci')
const posisi = sisa.filter(
  (x, i) => !x.startsWith('--') && !(i > 0 && bernilai(sisa[i - 1] as string)),
)
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
  if (formatDua(k)) {
    const h = k.hasil
    console.log(
      `  Laporan    : format 2 · masalah ${k.masalah ? '✓' : '○'} · ${k.temuan?.length ?? 0} temuan · ${k.keputusan.length} keputusan · ${k.dilakukan?.length ?? 0} dilakukan · hasil ${h ? (h.sementara ? 'sementara' : h.disetujui ? 'disetujui' : 'ditulis') : '○'}`,
    )
  } else
    console.log(
      `  Catatan    : ${bacaBerkasKerja(k.key, 'catatan.md') ? `ada (kerja/${k.key}/catatan.md)` : 'belum'}`,
    )
  console.log(`  Komentar   : ${k.plane.komentar_at ?? '-'}`)
}

const PAKAI =
  'Pakai: bun run kerja <daftar|ambil|baru|lihat|tahap|target|potret|gerbang|kesehatan|catatan|tanya|jawab|putuskan|minta-ubah|ubah-selesai|staging|tunda|aktifkan|slot|antre|antre-urut|antre-pindah|antre-mulai|lepas|workspace|panen|metrik|cek|catat|plane> [KEY] ... (lihat docs/KERJA.md)'

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
    case 'catatan': {
      if (!key) throw new Error('Pakai: bun run kerja catatan KEY [brief|akhir] [--render]')
      const k = bacaKerja(key)
      if (sisa.includes('--render')) {
        if (formatDua(k)) {
          console.log(renderLaporanMd(key, laporanLengkap(k)))
          break
        }
        console.log(
          renderCatatan({
            key,
            md: bacaBerkasKerja(key, 'catatan.md'),
            data: dataCatatan(k),
            verifikasi: k.verifikasi,
          }),
        )
        break
      }
      // Bawaan: brief sebelum Diverifikasi, akhir sejak Diverifikasi.
      const saat =
        posisi[0] === 'brief' || posisi[0] === 'akhir'
          ? posisi[0]
          : TAHAP.indexOf(k.tahap) >= TAHAP.indexOf('diverifikasi')
            ? 'akhir'
            : 'brief'
      const p = periksaCatatanKerja(key, saat)
      console.log(ringkasPeriksaCatatan(p, saat))
      if (!p.ok) process.exitCode = 1
      break
    }
    case 'masalah': {
      if (!key || !posisi[0])
        throw new Error('Pakai: bun run kerja masalah KEY "ringkas" [--penyebab "…"]')
      const k = ubahLaporan(
        key,
        (l) => setMasalah(l, posisi.join(' '), opsi('penyebab')[0]).laporan,
        (l) => {
          // Masalah awal kerja lokal = judulnya; menggantinya pertama kali bukan perubahan yang perlu dicatat.
          const lama = bacaKerja(key)
          return lama.masalah && lama.masalah.ringkas !== lama.judul
            ? `Masalah diganti: ${l.masalah?.ringkas.slice(0, 80)}`
            : null
        },
      )
      console.log(`✓ masalah dicatat${k.masalah?.penyebab ? ' (dengan penyebab)' : ''}`)
      break
    }
    case 'temuan': {
      const jenis = opsi('jenis')[0]
      if (!key || !posisi[0] || !jenis)
        throw new Error(
          'Pakai: bun run kerja temuan KEY "teks" --jenis penyebab|sampingan|risiko|data-uji [--rinci "…" | --rinci-berkas f] [--koreksi n]',
        )
      const berkas = opsi('rinci-berkas')[0]
      const rinci = berkas ? readFileSync(berkas, 'utf8') : opsi('rinci')[0]
      const k = ubahLaporan(key, (l) =>
        tambahTemuan(l, {
          teks: posisi.join(' '),
          jenis,
          rinci,
          koreksi: opsi('koreksi')[0] ? Number(opsi('koreksi')[0]) : undefined,
        }),
      )
      console.log(`✓ temuan #${k.temuan?.at(-1)?.id} (${jenis})`)
      break
    }
    case 'lakukan': {
      if (!key || !posisi[0])
        throw new Error(
          'Pakai: bun run kerja lakukan KEY "teks" [--rencana] [--commit sha] [--koreksi n]',
        )
      const k = ubahLaporan(key, (l) =>
        tambahDilakukan(l, {
          teks: posisi.join(' '),
          rencana: sisa.includes('--rencana'),
          commit: opsi('commit')[0],
          koreksi: opsi('koreksi')[0] ? Number(opsi('koreksi')[0]) : undefined,
        }),
      )
      console.log(
        `✓ dilakukan #${k.dilakukan?.at(-1)?.id}${sisa.includes('--rencana') ? ' (rencana)' : ''}`,
      )
      break
    }
    case 'hasil': {
      if (!key || !posisi[0])
        throw new Error(
          'Pakai: bun run kerja hasil KEY "penyelesaian" [--sementara] [--belum "…"]... [--tabel-berkas f.json]',
        )
      const tb = opsi('tabel-berkas')[0]
      const k = ubahLaporan(
        key,
        (l) =>
          setHasil(l, {
            penyelesaian: posisi.join(' '),
            sementara: sisa.includes('--sementara'),
            belum: opsi('belum'),
            tabel: tb ? bacaTabel(JSON.parse(readFileSync(tb, 'utf8'))) : undefined,
          }),
        (l) => `Hasil ${l.hasil?.sementara ? 'sementara' : 'akhir'} ditulis`,
      )
      console.log(`✓ hasil ${k.hasil?.sementara ? '(sejauh ini)' : '(penyelesaian)'} dicatat`)
      break
    }
    case 'tanya': {
      if (!key || !posisi[0])
        throw new Error('Pakai: bun run kerja tanya KEY "pertanyaan" [--usul "a"]')
      const k = ubahDataCatatan(key, (d) => tambahPertanyaan(d, posisi.join(' '), opsi('usul')))
      const p = k.pertanyaan.at(-1)
      console.log(
        `○ pertanyaan #${p?.id} dicatat; dijawab Tams di panel atau: bun run kerja jawab ${key} ${p?.id} "…"`,
      )
      break
    }
    case 'jawab': {
      const no = Number(posisi[0])
      if (!key || !no || !posisi[1])
        throw new Error('Pakai: bun run kerja jawab KEY <no> "jawaban"')
      const k = ubahDataCatatan(key, (d) => jawabPertanyaan(d, no, posisi.slice(1).join(' ')))
      console.log(`✓ #${no} dijawab → keputusan #${k.keputusan.at(-1)?.id}`)
      break
    }
    case 'putuskan': {
      const oleh = opsi('oleh')[0] ?? 'ai'
      if (!key || !posisi[0] || (oleh !== 'ai' && oleh !== 'tams'))
        throw new Error(
          'Pakai: bun run kerja putuskan KEY "keputusan" [--alasan "…"] [--oleh ai|tams]',
        )
      // Kerja format 2: keputusan AI selalu beralasan (ditinjau Tams di kartu Keputusan).
      if (oleh === 'ai' && formatDua(bacaKerja(key)) && !opsi('alasan')[0]?.trim())
        throw new Error('Keputusan AI wajib --alasan "…" (kenapa memilih ini)')
      const k = ubahDataCatatan(key, (d) =>
        tambahKeputusan(d, posisi.join(' '), oleh, opsi('alasan')[0]),
      )
      console.log(
        `✓ keputusan #${k.keputusan.at(-1)?.id} (${oleh === 'ai' ? 'AI — tampil untuk ditinjau' : 'Tams'})`,
      )
      break
    }
    case 'minta-ubah': {
      const titik = posisi[0]
      if (!key || (titik !== 'A' && titik !== 'B') || !posisi[1])
        throw new Error('Pakai: bun run kerja minta-ubah KEY A|B "teks"')
      const k = ubahDataCatatan(key, (d) => tambahMintaUbah(d, posisi.slice(1).join(' '), titik))
      console.log(`○ minta ubah #${k.mintaUbah.at(-1)?.id} dicatat`)
      break
    }
    case 'ubah-selesai': {
      const no = Number(posisi[0])
      if (!key || !no) throw new Error('Pakai: bun run kerja ubah-selesai KEY <no>')
      ubahDataCatatan(key, (d) => selesaikanMintaUbah(d, no))
      console.log(`✓ minta ubah #${no} selesai`)
      break
    }
    case 'staging': {
      const aksi = posisi[0]
      if (!key || !['tambah', 'centang', 'batal'].includes(aksi ?? ''))
        throw new Error(
          'Pakai: bun run kerja staging KEY tambah "teks" | centang <no> | batal <no>',
        )
      const k =
        aksi === 'tambah'
          ? ubahDataCatatan(key, (d) => tambahCekStaging(d, posisi.slice(1).join(' ')))
          : ubahDataCatatan(key, (d) => centangCekStaging(d, Number(posisi[1]), aksi === 'centang'))
      const sel = k.cekStaging.filter((c) => c.selesai).length
      console.log(
        `${sel === k.cekStaging.length ? '✓' : '○'} cek staging ${sel}/${k.cekStaging.length}`,
      )
      break
    }
    case 'tunda':
    case 'aktifkan': {
      if (!key) throw new Error('Pakai: bun run kerja tunda KEY ["alasan"] | aktifkan KEY')
      tundaKerja(key, perintah === 'tunda', posisi.join(' '))
      console.log(
        perintah === 'tunda'
          ? `⏸ ${key} ditunda: tidak muncul di "Butuh kamu"`
          : `✓ ${key} aktif lagi`,
      )
      break
    }
    case 'baru': {
      // Kerja lokal tanpa tiket Plane: `kerja baru BUG "judul"` → BUG-n di slot chat.
      const awalan = key as AwalanLokal
      const judul = posisi[0]
      if (!AWALAN_LOKAL.includes(awalan) || !judul)
        throw new Error(
          `Pakai: bun run kerja baru <${AWALAN_LOKAL.join('|')}> "judul" [--tanpa-slot]`,
        )
      const { kerja, langkah } = buatKerjaLokal(awalan, judul, {
        tempat: !sisa.includes('--tanpa-slot'),
      })
      console.log(`✓ ${kerja.key} · ${kerja.judul}`)
      if (kerja.slot) console.log(`  slot ${kerja.slot} (chat) · branch ${kerja.branch}`)
      for (const l of langkah) console.log(`  · ${l}`)
      break
    }
    case 'slot': {
      const n = Number(posisi[0])
      if (!key || ![1, 2, 3].includes(n)) throw new Error('Pakai: bun run kerja slot KEY <1|2|3>')
      const { langkah } = tempatkanDiSlot(key, n as NomorSlot)
      console.log(`✓ ${key} di slot ${n}`)
      for (const l of langkah) console.log(`  · ${l}`)
      break
    }
    case 'antre': {
      // Tanpa --slot: antre global (Tams menempatkan sendiri). Dengan --slot n: antre di slot n,
      // naik otomatis setelah kerja aktif slot itu di-push.
      if (!key) throw new Error('Pakai: bun run kerja antre KEY [--slot <1|2|3>]')
      const n = opsi('slot')[0] ? Number(opsi('slot')[0]) : undefined
      if (n !== undefined && ![1, 2, 3].includes(n)) throw new Error('--slot harus 1, 2, atau 3')
      const k = antrekanKerja(key, n ? { slot: n } : {})
      if (n) {
        const urutan = antreanSlot(daftarKerja(), n).findIndex((x) => x.key === key) + 1
        console.log(`⏸ ${key} masuk antrean slot ${n} (urutan ${urutan})`)
        if (!pemakaiSlot().get(n)?.length)
          console.log(`  ! slot ${n} sedang kosong: mulai dengan "kerja antre-mulai ${n}"`)
      } else console.log(`⏸ ${k.key} masuk antrean global`)
      break
    }
    case 'antre-urut': {
      const arah = posisi[0]
      if (!key || (arah !== 'naik' && arah !== 'turun'))
        throw new Error('Pakai: bun run kerja antre-urut KEY naik|turun')
      aturUrutAntre(key, arah)
      const k = bacaKerja(key)
      const urutan = antreanSlot(daftarKerja(), slotAntre(k)).findIndex((x) => x.key === key) + 1
      console.log(
        `✓ ${key} ${arah}: urutan ${urutan} di antrean ${slotAntre(k) === 'global' ? 'global' : `slot ${slotAntre(k)}`}`,
      )
      break
    }
    case 'antre-pindah': {
      const ke = posisi[0]
      if (!key || !ke || (ke !== 'global' && ![1, 2, 3].includes(Number(ke))))
        throw new Error('Pakai: bun run kerja antre-pindah KEY <1|2|3|global>')
      pindahAntre(key, ke === 'global' ? 'global' : Number(ke))
      console.log(`✓ ${key} dipindah ke antrean ${ke === 'global' ? 'global' : `slot ${ke}`}`)
      break
    }
    case 'antre-mulai': {
      // Dijalankan otomatis (proses terpisah) setelah push; juga bisa manual bila slot kosong.
      const n = Number(key)
      if (![1, 2, 3].includes(n))
        throw new Error('Pakai: bun run kerja antre-mulai <1|2|3> [--pelepas KEY,KEY]')
      const h = await jalankanAntreanSlot(
        n as NomorSlot,
        (opsi('pelepas')[0] ?? '').split(',').filter(Boolean),
      )
      for (const d of h.dilewati) console.log(`↷ ${d.key} dilewati: ${d.alasan}`)
      if (h.ditempatkan)
        console.log(`✓ ${h.ditempatkan} ditempatkan di slot ${n} (DB tidak di-reset)`)
      if (h.gagal) console.log(`× ${h.gagal.key} gagal ditempatkan: ${h.gagal.alasan}`)
      if (!h.ditempatkan && !h.gagal)
        console.log(`antrean slot ${n} kosong atau slot masih terpakai`)
      break
    }
    case 'lepas': {
      if (!key) throw new Error('Pakai: bun run kerja lepas KEY')
      lepasSlotKerja(key)
      console.log(`✓ slot ${key} dilepas`)
      break
    }
    case 'workspace': {
      const pemakai = pemakaiSlot()
      for (const d of semuaSlot()) {
        const k = keadaanSlot(d)
        const p = pemakai.get(d.n) ?? []
        console.log(
          `slot ${d.n}${d.n === SLOT_CHAT ? ' (chat)' : ''}: ${p.length ? p.map((x) => x.key).join(', ') : 'kosong'} · ${k.branch ?? `detached ${k.head ?? '-'}`}${k.bersih ? '' : ' (kotor)'} · API :${d.portApi} ${k.api ? '●' : '○'} · web :${d.portWeb} ${k.web ? '●' : '○'} · DB ${k.dbUkuran ?? '-'}`,
        )
        for (const [i, x] of antreanSlot(daftarKerja(), d.n).entries())
          console.log(
            `    ${i + 1}. berikutnya: ${x.key} · ${x.judul}${x.ditunda ? ' (ditunda)' : ''}`,
          )
      }
      const global = daftarKerja().filter(
        (x) => x.antre && x.antre.slot === undefined && !x.slot && x.tahap !== 'selesai',
      )
      if (global.length) console.log(`antre global: ${global.map((x) => x.key).join(', ')}`)
      const km = bacaKomputer(semuaSlot().map((d) => [`Slot ${d.n}`, d.worktree]))
      console.log(
        `komputer: beban ${km.cpu.beban.toFixed(1)}/${km.cpu.core} · memori bebas ${km.memori.bebasPersen ?? '?'}% · disk sisa ${Math.round(km.disk.sisaGiB)} GiB`,
      )
      for (const w of km.peringatan) console.log(`  ! ${w.teks} → ${w.saran}`)
      break
    }
    case 'panen': {
      if (!key) throw new Error('Pakai: bun run kerja panen KEY [--modul fleet] [--tulis]')
      const tulis = sisa.includes('--tulis')
      const h = panenKerja(key, { modul: opsi('modul')[0], tulis })
      if (!tulis) {
        console.log(
          `PRATINJAU (belum ditulis) → fleetify-ops/${h.rel} · ${h.baru ? 'berkas baru' : h.berubah ? 'berubah' : 'tidak berubah'}\n`,
        )
        console.log(h.isi)
        break
      }
      console.log(
        `${h.cek?.ok ? '✓' : '×'} dipanen → fleetify-ops/${h.rel} (modul ${h.modul}) · check-v2 ${h.cek?.ok ? 'lulus' : 'GAGAL'}`,
      )
      if (!h.cek?.ok) {
        console.log(h.cek?.keluaran)
        process.exitCode = 1
      }
      break
    }
    case 'metrik': {
      const jam = (ms: number) =>
        ms >= 86_400_000
          ? `${(ms / 86_400_000).toFixed(1)} hari`
          : `${(ms / 3_600_000).toFixed(1)} jam`
      const ribu = (n: number) => `${Math.round(n / 1000)}k`
      for (const m of semuaMetrik().filter((x) => !key || x.key === key)) {
        const t = m.token
        console.log(
          `${m.key.padEnd(8)} ${LABEL_TAHAP[m.tahap].padEnd(17)} total ${jam(m.totalMs).padStart(9)} · mundur ${m.kerjaUlang.tahapMundur} · minta ubah ${m.kerjaUlang.mintaUbah}${m.kerjaUlang.gerbangCiGagal ? ' · CI gagal' : ''} · token ${t ? `in ${ribu(t.input)} out ${ribu(t.output)} cache ${ribu(t.cacheBaca + t.cacheTulis)}` : '–'}`,
        )
      }
      break
    }
    case 'kesehatan': {
      const k = key ? bacaKerja(key) : null
      const commitKerja = k ? (k.commit.at(-1) ?? null) : null
      const h = await denganSlot(k ? slotKerja(k) : null, () => periksaKesehatan({ commitKerja }))
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

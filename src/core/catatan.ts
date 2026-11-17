// Catatan kerja sebagai dokumen hidup (docs/RANCANGAN-KERJA-V2.md R-3.3, R-5.1, R-8.1, R-8.2).
// Dua lapis: bagian tulisan di kerja/<KEY>/catatan.md (Masalah & penyebab, Rencana, Yang
// dikerjakan, Kendala) dan bagian data di kerja.json (keputusan, pertanyaan, minta ubah,
// verifikasi, cek staging) yang dirender sehingga tidak bisa basi. Berkas ini murni.

export interface Keputusan {
  id: number
  apa: string
  /** tams = diputuskan Tams; ai = diambil AI sendiri, wajib terlihat untuk ditinjau (R-3.3). */
  oleh: 'tams' | 'ai'
  at: string
  alasan?: string
  /** Nomor pertanyaan yang dijawab oleh keputusan ini. */
  pertanyaan?: number
}

export interface Pertanyaan {
  id: number
  teks: string
  usulan: string[]
  at: string
  jawaban: string | null
  dijawabPada: string | null
}

export interface MintaUbah {
  id: number
  teks: string
  /** Titik sentuh asal: A = rencana, B = hasil. */
  titik: 'A' | 'B'
  at: string
  selesai: string | null
}

export interface CekStaging {
  id: number
  teks: string
  selesai: string | null
}

/** Bagian data catatan di kerja.json. */
export interface DataCatatan {
  keputusan: Keputusan[]
  pertanyaan: Pertanyaan[]
  mintaUbah: MintaUbah[]
  cekStaging: CekStaging[]
}

export const DATA_CATATAN_KOSONG: DataCatatan = {
  keputusan: [],
  pertanyaan: [],
  mintaUbah: [],
  cekStaging: [],
}

const kini = () => new Date().toISOString()
const idBaru = (xs: { id: number }[]) => xs.reduce((m, x) => Math.max(m, x.id), 0) + 1

export function tambahPertanyaan(d: DataCatatan, teks: string, usulan: string[] = []): DataCatatan {
  if (!teks.trim()) throw new Error('Pertanyaan tidak boleh kosong')
  return {
    ...d,
    pertanyaan: [
      ...d.pertanyaan,
      {
        id: idBaru(d.pertanyaan),
        teks: teks.trim(),
        usulan: usulan.map((u) => u.trim()).filter(Boolean),
        at: kini(),
        jawaban: null,
        dijawabPada: null,
      },
    ],
  }
}

/** Menjawab pertanyaan menutupnya dan mencatat jawabannya sebagai keputusan Tams. */
export function jawabPertanyaan(d: DataCatatan, id: number, jawaban: string): DataCatatan {
  const p = d.pertanyaan.find((x) => x.id === id)
  if (!p) throw new Error(`Pertanyaan #${id} tidak ada`)
  if (p.jawaban) throw new Error(`Pertanyaan #${id} sudah dijawab: ${p.jawaban}`)
  if (!jawaban.trim()) throw new Error('Jawaban tidak boleh kosong')
  const at = kini()
  return {
    ...d,
    pertanyaan: d.pertanyaan.map((x) =>
      x.id === id ? { ...x, jawaban: jawaban.trim(), dijawabPada: at } : x,
    ),
    keputusan: [
      ...d.keputusan,
      {
        id: idBaru(d.keputusan),
        apa: `${p.teks} → ${jawaban.trim()}`,
        oleh: 'tams',
        at,
        pertanyaan: id,
      },
    ],
  }
}

export function tambahKeputusan(
  d: DataCatatan,
  apa: string,
  oleh: Keputusan['oleh'],
  alasan?: string,
): DataCatatan {
  if (!apa.trim()) throw new Error('Keputusan tidak boleh kosong')
  const k: Keputusan = { id: idBaru(d.keputusan), apa: apa.trim(), oleh, at: kini() }
  if (alasan?.trim()) k.alasan = alasan.trim()
  return { ...d, keputusan: [...d.keputusan, k] }
}

export function tambahMintaUbah(
  d: DataCatatan,
  teks: string,
  titik: MintaUbah['titik'],
): DataCatatan {
  if (!teks.trim()) throw new Error('Permintaan ubah tidak boleh kosong')
  return {
    ...d,
    mintaUbah: [
      ...d.mintaUbah,
      { id: idBaru(d.mintaUbah), teks: teks.trim(), titik, at: kini(), selesai: null },
    ],
  }
}

export function selesaikanMintaUbah(d: DataCatatan, id: number): DataCatatan {
  if (!d.mintaUbah.some((x) => x.id === id)) throw new Error(`Permintaan ubah #${id} tidak ada`)
  return {
    ...d,
    mintaUbah: d.mintaUbah.map((x) => (x.id === id ? { ...x, selesai: x.selesai ?? kini() } : x)),
  }
}

export function tambahCekStaging(d: DataCatatan, teks: string): DataCatatan {
  if (!teks.trim()) throw new Error('Cek staging tidak boleh kosong')
  return {
    ...d,
    cekStaging: [...d.cekStaging, { id: idBaru(d.cekStaging), teks: teks.trim(), selesai: null }],
  }
}

export function centangCekStaging(d: DataCatatan, id: number, selesai = true): DataCatatan {
  if (!d.cekStaging.some((x) => x.id === id)) throw new Error(`Cek staging #${id} tidak ada`)
  return {
    ...d,
    cekStaging: d.cekStaging.map((x) =>
      x.id === id ? { ...x, selesai: selesai ? (x.selesai ?? kini()) : null } : x,
    ),
  }
}

// ── Bagian tulisan (catatan.md) ────────────────────────────────────────────

export type JenisBagian =
  | 'diminta'
  | 'masalah'
  | 'rencana'
  | 'keputusan'
  | 'dikerjakan'
  | 'perhatian'
  | 'verifikasi'
  | 'kendala'
  | 'deploy'
  | 'lain'

/** Judul bagian → jenis. Alias menampung catatan lama ("Masalahnya: …", "Yang kita lakukan"). */
export function jenisBagian(judul: string): JenisBagian {
  const j = judul.toLowerCase()
  if (/^yang diminta/.test(j)) return 'diminta'
  if (/^masalah/.test(j)) return 'masalah'
  if (/^rencana/.test(j)) return 'rencana'
  if (/^keputusan/.test(j)) return 'keputusan'
  if (/^yang (dikerjakan|kita lakukan|dilakukan)/.test(j)) return 'dikerjakan'
  if (/^(perlu diperhatikan|yang perlu kamu perhatikan|risiko)/.test(j)) return 'perhatian'
  if (/^verifikasi/.test(j)) return 'verifikasi'
  if (/^kendala/.test(j)) return 'kendala'
  if (/^setelah (merge|deploy)|^pasca/.test(j)) return 'deploy'
  return 'lain'
}

export interface Bagian {
  judul: string
  jenis: JenisBagian
  isi: string
}

/** Pecah catatan.md: pembuka (sebelum `##` pertama) dan bagian-bagian `##`. */
export function pecahCatatan(md: string | null): { pembuka: string; bagian: Bagian[] } {
  const bagian: Bagian[] = []
  let pembuka = ''
  let kini_: Bagian | null = null
  let kode = false
  for (const baris of (md ?? '').split('\n')) {
    if (baris.startsWith('```')) kode = !kode
    const h = kode ? null : baris.match(/^##\s+(.+?)\s*$/)
    if (h?.[1]) {
      kini_ = { judul: h[1], jenis: jenisBagian(h[1]), isi: '' }
      bagian.push(kini_)
    } else if (kini_) kini_.isi += `${baris}\n`
    else pembuka += `${baris}\n`
  }
  for (const b of bagian) b.isi = b.isi.trim()
  return { pembuka: pembuka.trim(), bagian }
}

/** Kerangka catatan.md untuk tiket baru: hanya bagian tulisan; bagian data dirender. */
export function templatCatatan(key: string): string {
  return `# ${key} · Catatan

## Masalah & penyebab

<!-- Apa masalahnya dan kenapa terjadi. Untuk tiket keluhan: ulangi klaim tiket di data
     lokal dan tulis hasilnya apa adanya, termasuk bila tidak terulang (R-8.2). -->

## Rencana

<!-- Per lapisan (DB/migrasi, backend, frontend), berkas yang disentuh, risiko.
     Tiket yang fiturnya sudah ada: tulis "Tanpa kode; verifikasi saja". -->

## Yang dikerjakan

<!-- Diisi di akhir Kerjakan: apa yang diubah, commit, dan penyimpangan dari rencana. -->

## Perlu diperhatikan

<!-- Diisi di akhir Kerjakan untuk review Tams (◆B): penyimpangan dari tiket, temuan di luar
     cakupan, dan risiko. Keputusan yang diambil sendiri dicatat lewat "kerja putuskan". -->

## Kendala

<!-- Opsional: hambatan saat uji dan cara menyelesaikannya. -->
`
}

const tanpaKomentar = (s: string) => s.replace(/<!--[\s\S]*?-->/g, '').trim()

// ── Gerbang catatan ────────────────────────────────────────────────────────

/** Pola teks yang menandakan catatan masih berupa rencana/usulan yang belum diputuskan. */
const JUDUL_BASI = /^(usulan|pertanyaan terbuka|belum bisa dikerjakan)/i
const FRASA_BASI =
  /(menunggu keputusan|perlu disetujui sebelum|perlu dikonfirmasi sebelum dikerjakan)/i

export interface PeriksaCatatan {
  ok: boolean
  masalah: string[]
}

/**
 * Gerbang catatan. `brief` = akhir Pahami (sebelum mengerjakan); `akhir` = sebelum
 * Didokumentasikan/Selesai: tak boleh ada pertanyaan/minta-ubah terbuka atau teks basi.
 */
export function periksaCatatan(
  md: string | null,
  d: DataCatatan,
  verifikasi: { kriteria: string; hasil: string }[],
  saat: 'brief' | 'akhir',
): PeriksaCatatan {
  const m: string[] = []
  const { bagian } = pecahCatatan(md)
  const isi = (j: JenisBagian) =>
    bagian
      .filter((b) => b.jenis === j)
      .map((b) => tanpaKomentar(b.isi))
      .join('\n')
      .trim()
  if (!md) m.push('catatan.md belum ada')
  if (!isi('masalah')) m.push('bagian "Masalah & penyebab" kosong')
  if (saat === 'brief' && !isi('rencana')) m.push('bagian "Rencana" kosong')
  if (!verifikasi.length)
    m.push('belum ada kriteria (bun run kerja cek KEY belum "kriteria" "cara membuktikan")')
  if (saat === 'akhir') {
    if (!isi('dikerjakan')) m.push('bagian "Yang dikerjakan" kosong')
    const belum = verifikasi.filter((v) => v.hasil === 'belum').length
    if (belum) m.push(`${belum} kriteria belum dicek`)
    const tanya = d.pertanyaan.filter((p) => !p.jawaban).length
    if (tanya) m.push(`${tanya} pertanyaan belum dijawab`)
    const ubah = d.mintaUbah.filter((x) => !x.selesai).length
    if (ubah) m.push(`${ubah} permintaan ubah belum selesai`)
    for (const b of bagian)
      if (JUDUL_BASI.test(b.judul)) m.push(`bagian "${b.judul}" masih berupa usulan/pertanyaan`)
    // Hanya isi; judul basi sudah dilaporkan di atas.
    const { pembuka } = pecahCatatan(md)
    const basi = tanpaKomentar([pembuka, ...bagian.map((b) => b.isi)].join('\n')).match(FRASA_BASI)
    if (basi) m.push(`teks basi: "${basi[0]}"`)
  }
  return { ok: !m.length, masalah: m }
}

export function ringkasPeriksaCatatan(p: PeriksaCatatan, saat: 'brief' | 'akhir'): string {
  const nama = saat === 'brief' ? 'brief' : 'catatan akhir'
  return p.ok
    ? `✓ ${nama} lengkap`
    : [`× ${nama}: ${p.masalah.length} masalah`, ...p.masalah.map((x) => `  × ${x}`)].join('\n')
}

// ── Render dokumen hidup ───────────────────────────────────────────────────

const tgl = (iso: string) =>
  new Date(iso).toLocaleString('id-ID', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
const sel = (s: string) => s.replace(/\|/g, '\\|').replace(/\n+/g, ' ')
const TANDA = { lulus: '✓', gagal: '×', belum: '○' } as Record<string, string>

/**
 * Catatan lengkap (markdown) untuk panel dan ekspor: bagian tulisan dalam urutan tetap, diselingi
 * bagian data. Bagian tulisan yang tak dikenal tetap ikut di akhir, supaya tidak ada isi hilang.
 */
export function renderCatatan(o: {
  key: string
  md: string | null
  data: DataCatatan
  verifikasi: { kriteria: string; hasil: string; bukti?: string }[]
}): string {
  const { pembuka, bagian } = pecahCatatan(o.md)
  const ambil = (j: JenisBagian) => bagian.filter((b) => b.jenis === j && tanpaKomentar(b.isi))
  const keluar: string[] = [pembuka || `# ${o.key} · Catatan`]
  const tulis = (judul: string, isi: string) =>
    isi.trim() && keluar.push(`## ${judul}\n\n${isi.trim()}`)
  const prosa = (j: JenisBagian) =>
    ambil(j)
      .map((b, _i, xs) =>
        xs.length > 1 || jenisBagian(b.judul) === 'lain'
          ? `### ${b.judul}\n\n${tanpaKomentar(b.isi)}`
          : tanpaKomentar(b.isi),
      )
      .join('\n\n')

  tulis('Yang diminta', prosa('diminta'))
  tulis('Masalah & penyebab', prosa('masalah'))
  tulis('Rencana', prosa('rencana'))

  const tanya = o.data.pertanyaan.filter((p) => !p.jawaban)
  tulis(
    'Pertanyaan terbuka',
    tanya
      .map(
        (p) =>
          `- ○ **#${p.id}** ${p.teks}${p.usulan.length ? ` — usulan: ${p.usulan.join(' / ')}` : ''}`,
      )
      .join('\n'),
  )
  const ubah = o.data.mintaUbah.filter((x) => !x.selesai)
  tulis('Minta ubah', ubah.map((x) => `- ○ **#${x.id}** (${x.titik}) ${x.teks}`).join('\n'))

  const tabelKeputusan = o.data.keputusan.length
    ? `| # | Keputusan | Oleh | Kapan |\n|---|---|---|---|\n${o.data.keputusan
        .map(
          (k) =>
            `| ${k.id} | ${sel(k.apa)}${k.alasan ? ` — ${sel(k.alasan)}` : ''} | ${k.oleh === 'ai' ? '**AI — tinjau**' : 'Tams'} | ${tgl(k.at)} |`,
        )
        .join('\n')}`
    : ''
  tulis('Keputusan', [prosa('keputusan'), tabelKeputusan].filter(Boolean).join('\n\n'))

  tulis('Yang dikerjakan', prosa('dikerjakan'))
  tulis('Perlu diperhatikan', prosa('perhatian'))

  const tabelV = o.verifikasi.length
    ? `| Kriteria | Hasil |\n|---|---|\n${o.verifikasi
        .map((v) => {
          const bukti = (v.bukti ?? '')
            .replace(/\s*\([^)]*\.(png|jpe?g|webp|json)[^)]*\)/gi, '')
            .trim()
          return `| ${sel(v.kriteria)} | ${TANDA[v.hasil] ?? v.hasil}${bukti ? ` ${sel(bukti)}` : ''} |`
        })
        .join('\n')}`
    : ''
  tulis('Verifikasi', tabelV)

  tulis('Kendala', prosa('kendala'))

  const daftarStaging = o.data.cekStaging
    .map((c) => `- ${c.selesai ? '✓' : '○'} ${c.teks}`)
    .join('\n')
  tulis('Setelah deploy', [prosa('deploy'), daftarStaging].filter(Boolean).join('\n\n'))

  for (const b of ambil('lain')) tulis(b.judul, tanpaKomentar(b.isi))
  return `${keluar.join('\n\n')}\n`
}

/** Isi bagian "Perlu diperhatikan" (tanpa komentar panduan) untuk paket review. */
export const bagianPerhatian = (md: string | null) =>
  pecahCatatan(md)
    .bagian.filter((b) => b.jenis === 'perhatian')
    .map((b) => tanpaKomentar(b.isi))
    .filter(Boolean)
    .join('\n\n')

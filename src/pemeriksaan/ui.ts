// Pelaksana Pemeriksaan UI per langkah (docs/PEMERIKSAAN.md, bagian UI). Meniru Pemeriksa DB:
// pemeriksaan DOM berjalan langsung di halaman saat langkah selesai (harus sebelum aksi
// berikutnya), pemeriksa statis (check:design di repo v2) diantre asinkron per pola rute dan
// hasilnya masuk ke langkah lewat promise `selesai`. Repo v2 hanya dibaca.
import path from 'node:path'
import type { Page } from 'playwright'
import { config } from '../core/config.ts'
import type {
  HasilPemeriksaanUi,
  KelompokStatis,
  StatusUiLangkah,
  TemuanDom,
  UiLangkah,
} from '../core/run-types.ts'
import { AntreanSnapshot } from './jalankan.ts'
import {
  ATURAN_DOM,
  bacaToken,
  periksaDomHalaman,
  screenshotBersorot,
  type TokenTema,
} from './ui-dom.ts'
import {
  ATURAN_STATIS,
  type BaselineDesain,
  bacaBaseline,
  bandingBaseline,
  cuplikanBaris,
  jalankanCheckDesign,
  type KeluaranCheckDesign,
  masalahV2Dir,
} from './ui-statis.ts'

export const ATURAN_UI = [...ATURAN_STATIS, ...ATURAN_DOM] as const

const firstLine = (e: unknown) => (e instanceof Error ? e.message : String(e)).split('\n')[0] ?? ''

export interface OpsiPemeriksaUi {
  nonaktif?: readonly string[]
  abaikanHalaman?: readonly string[]
  log?: (l: string) => void
  v2Dir?: string | null
}

interface HasilStatis {
  keluaran: KeluaranCheckDesign
  baru: KelompokStatis[]
  sudahAda: KelompokStatis[]
  durasiMs: number
}

/** Kelompok yang sama di dua langkah = berkas + aturan yang sama. */
const kunciKelompok = (g: KelompokStatis) => `${g.file}\n${g.rule}`

export class PemeriksaUi {
  readonly v2Dir: string | null
  private readonly masalah: string | null
  private readonly nonaktif: readonly string[]
  private readonly abaikanHalaman: readonly string[]
  private readonly log: (l: string) => void
  private token: TokenTema | null = null
  private baseline: BaselineDesain | null = null
  private readonly antrean = new AntreanSnapshot<HasilStatis>()
  /** Cache hasil statis per pola rute (pathname bila tidak cocok pola) dalam satu jalan. */
  private readonly cache = new Map<string, Promise<HasilStatis>>()
  private readonly langkah: { n: number; hasil: Promise<UiLangkah> }[] = []
  private readonly durasiStatis: number[] = []
  private hitCache = 0
  private readonly durasiDom: { evalMs: number; durasiMs: number }[] = []

  constructor(opsi: OpsiPemeriksaUi = {}) {
    this.nonaktif = opsi.nonaktif ?? []
    this.abaikanHalaman = opsi.abaikanHalaman ?? []
    this.log = opsi.log ?? (() => {})
    this.v2Dir = opsi.v2Dir === undefined ? config.v2Dir : opsi.v2Dir
    this.masalah = masalahV2Dir(this.v2Dir)
  }

  get dikonfigurasi() {
    return this.masalah === null
  }

  /** Baca token tema dan baseline sekali saat jalan mulai. Tidak melempar. */
  siapkan() {
    if (!this.v2Dir || this.masalah) return
    try {
      this.token = bacaToken(this.v2Dir)
      this.baseline = bacaBaseline(this.v2Dir)
      this.log(
        `Pemeriksaan UI: ${this.token?.warna.length ?? 0} warna token, radius ${this.token?.radius.join('/') ?? '-'} px, baseline ${this.baseline ? `${Object.keys(this.baseline.files).length} berkas` : 'tidak ada'} (${this.v2Dir})`,
      )
    } catch (e) {
      this.log(`Pemeriksaan UI: gagal membaca token/baseline — ${firstLine(e)}`)
    }
  }

  private halamanDiabaikan(pathname: string) {
    return this.abaikanHalaman.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  }

  private kosong(status: StatusUiLangkah, url: string | null): UiLangkah {
    return {
      status,
      url,
      pattern: null,
      page: null,
      statis: null,
      dom: null,
      shotUi: null,
      galat: [],
    }
  }

  /** Statis untuk satu pathname, dipakai ulang per pola rute. */
  private statis(pathname: string): {
    dimulai: Promise<void>
    selesai: Promise<HasilStatis>
    cache: boolean
  } {
    const v2Dir = this.v2Dir
    if (!v2Dir) throw new Error('Pemeriksaan UI tidak dikonfigurasi')
    // Pola rute baru diketahui dari keluaran skrip; kunci awal pathname tanpa id.
    const kunciAwal = pathname.replaceAll(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      '{id}',
    )
    const ada = this.cache.get(kunciAwal)
    if (ada) {
      this.hitCache++
      return { dimulai: Promise.resolve(), selesai: ada, cache: true }
    }
    const { dimulai, selesai } = this.antrean.tambah(async () => {
      const t0 = Date.now()
      const keluaran = await jalankanCheckDesign(v2Dir, pathname)
      const { baru, sudahAda } = bandingBaseline(keluaran.violations, this.baseline, this.nonaktif)
      for (const g of baru)
        for (const b of g.baris) {
          const c = cuplikanBaris(v2Dir, b.file, b.line)
          if (c !== null) b.cuplikan = c
        }
      const durasiMs = Date.now() - t0
      this.durasiStatis.push(durasiMs)
      return { keluaran, baru, sudahAda, durasiMs }
    })
    this.cache.set(kunciAwal, selesai)
    return { dimulai, selesai, cache: false }
  }

  /**
   * Periksa langkah `n` (1-based) pada halaman yang sedang tampil. Bagian DOM dan screenshot
   * bersorot diawait (harus selesai sebelum aksi berikutnya); bagian statis diantre dan hasilnya
   * dilengkapi lewat `selesai`. `shotFile` = nama berkas screenshot langkah (untuk nama -ui.png).
   * null bila tidak dikonfigurasi.
   */
  async mulaiLangkah(
    n: number,
    page: Page | null,
    dir: string,
    shotFile: string | null,
  ): Promise<{ awal: UiLangkah; selesai: Promise<UiLangkah> } | null> {
    if (!this.v2Dir || this.masalah) return null
    let url: string | null = null
    try {
      url = page?.url() ?? null
    } catch {
      url = null
    }
    const pathname = url ? new URL(url).pathname : null
    if (!page || !pathname) {
      const u = this.kosong('galat', url)
      u.galat.push('tidak ada halaman yang tampil')
      return { awal: u, selesai: Promise.resolve(u) }
    }
    if (this.halamanDiabaikan(pathname)) {
      const u = this.kosong('dilewati', url)
      this.langkah.push({ n, hasil: Promise.resolve(u) })
      return { awal: u, selesai: Promise.resolve(u) }
    }
    const awal = this.kosong('memeriksa', url)
    // DOM: langsung, sebelum aksi berikutnya mengubah halaman.
    if (this.token) {
      const t0 = Date.now()
      try {
        const h = await periksaDomHalaman(page, this.token, this.nonaktif)
        let shotUi: string | null = null
        if (h.temuan.length && shotFile) {
          const nama = shotFile.replace(/\.png$/, '-ui.png')
          if (await screenshotBersorot(page, h.temuan, path.join(dir, nama))) shotUi = nama
        }
        awal.dom = {
          temuan: h.temuan,
          evalMs: h.evalMs,
          durasiMs: Date.now() - t0,
          elemen: h.elemen,
          terpotong: h.terpotong,
        }
        awal.shotUi = shotUi
        this.durasiDom.push({ evalMs: h.evalMs, durasiMs: awal.dom.durasiMs })
      } catch (e) {
        awal.galat.push(`DOM: ${firstLine(e)}`)
      }
    } else awal.galat.push('token tema tidak terbaca; pemeriksaan DOM dilewati')
    // Statis: diantre.
    const s = this.statis(pathname)
    const selesai = s.selesai.then(
      (h): UiLangkah => {
        const u: UiLangkah = {
          ...awal,
          pattern: h.keluaran.route?.pattern ?? null,
          page: h.keluaran.route?.page ?? null,
          statis: {
            berkas: h.keluaran.files.length,
            baru: h.baru,
            sudahAda: h.sudahAda,
            durasiMs: h.durasiMs,
            cache: s.cache,
          },
        }
        u.status = statusLangkah(u)
        return u
      },
      (e): UiLangkah => {
        const u: UiLangkah = { ...awal, galat: [...awal.galat, `statis: ${firstLine(e)}`] }
        u.status = statusLangkah(u)
        return u
      },
    )
    this.langkah.push({ n, hasil: selesai })
    await s.dimulai
    return { awal, selesai }
  }

  async tunggu() {
    await this.antrean.tunggu()
  }

  private tidakDikonfigurasi(): HasilPemeriksaanUi {
    return {
      status: 'tidak_dikonfigurasi',
      baru: [],
      sudahAda: [],
      dom: [],
      dilewati: [],
      galat: [],
      statis: { jumlah: 0, rataMs: 0, cache: 0 },
      domWaktu: { jumlah: 0, rataEvalMs: 0, rataMs: 0 },
      durasiMs: 0,
      pesan: this.masalah ?? undefined,
    }
  }

  /** Ringkasan akhir dari semua langkah (menunggu antrean statis). */
  async akhir(): Promise<HasilPemeriksaanUi> {
    if (!this.v2Dir || this.masalah) return this.tidakDikonfigurasi()
    const t0 = Date.now()
    await this.tunggu()
    const hasil = await Promise.all(this.langkah.map(async (l) => ({ n: l.n, u: await l.hasil })))
    return ringkasUi(hasil, {
      durasiMs: Date.now() - t0,
      statis: {
        jumlah: this.durasiStatis.length,
        rataMs: rata(this.durasiStatis),
        cache: this.hitCache,
      },
      domWaktu: {
        jumlah: this.durasiDom.length,
        rataEvalMs: rata(this.durasiDom.map((d) => d.evalMs)),
        rataMs: rata(this.durasiDom.map((d) => d.durasiMs)),
      },
      pesan: this.v2Dir,
    })
  }
}

const rata = (xs: readonly number[]) =>
  xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : 0

/** Status satu langkah: pelanggaran bila ada statis baru; peringatan bila hanya DOM; galat bila ada galat tanpa temuan. */
export function statusLangkah(u: UiLangkah): StatusUiLangkah {
  if (u.statis?.baru.length) return 'pelanggaran'
  if (u.dom?.temuan.length) return 'peringatan'
  if (u.galat.length) return 'galat'
  return 'ok'
}

/** Gabungkan hasil per langkah (murni, diuji). Kelompok statis yang sama di beberapa langkah
 * dihitung sekali, diatribusikan ke langkah pertama yang memuatnya. */
export function ringkasUi(
  hasil: readonly { n: number; u: UiLangkah }[],
  opsi: {
    durasiMs: number
    statis: HasilPemeriksaanUi['statis']
    domWaktu: HasilPemeriksaanUi['domWaktu']
    pesan?: string
  },
): HasilPemeriksaanUi {
  const baru = new Map<string, KelompokStatis>()
  const lama = new Map<string, KelompokStatis>()
  const dom = new Map<string, { aturan: string; jumlah: number; langkah: number[] }>()
  const dilewati: HasilPemeriksaanUi['dilewati'] = []
  const galat: HasilPemeriksaanUi['galat'] = []
  for (const { n, u } of [...hasil].sort((a, b) => a.n - b.n)) {
    if (u.status === 'dilewati') {
      dilewati.push({ langkah: n, url: u.url ?? '' })
      continue
    }
    for (const g of u.statis?.baru ?? [])
      if (!baru.has(kunciKelompok(g))) baru.set(kunciKelompok(g), { ...g, langkah: n })
    for (const g of u.statis?.sudahAda ?? [])
      if (!lama.has(kunciKelompok(g)) && !baru.has(kunciKelompok(g)))
        lama.set(kunciKelompok(g), { ...g, langkah: n })
    for (const t of u.dom?.temuan ?? []) {
      const d = dom.get(t.aturan) ?? { aturan: t.aturan, jumlah: 0, langkah: [] }
      d.jumlah += t.jumlah
      if (!d.langkah.includes(n)) d.langkah.push(n)
      dom.set(t.aturan, d)
    }
    for (const g of u.galat) galat.push({ langkah: n, pesan: g })
  }
  const status: HasilPemeriksaanUi['status'] = baru.size
    ? 'pelanggaran'
    : dom.size
      ? 'peringatan'
      : galat.length && !hasil.some(({ u }) => u.statis)
        ? 'galat'
        : 'lulus'
  return {
    status,
    baru: [...baru.values()],
    sudahAda: [...lama.values()],
    dom: [...dom.values()].sort((a, b) => b.jumlah - a.jumlah),
    dilewati,
    galat,
    statis: opsi.statis,
    domWaktu: opsi.domWaktu,
    durasiMs: opsi.durasiMs,
    pesan: opsi.pesan,
  }
}

/** Teks satu baris per langkah untuk CLI. */
export function teksUiLangkah(u: UiLangkah | undefined): string | null {
  if (!u) return null
  if (u.status === 'memeriksa') return '… UI memeriksa'
  if (u.status === 'dilewati') return '– UI dilewati (abaikanHalaman)'
  const domN = (u.dom?.temuan ?? []).reduce((a, t) => a + t.jumlah, 0)
  const berkas = u.statis ? `${u.statis.berkas} berkas` : 'statis gagal'
  if (u.status === 'pelanggaran' && u.statis) {
    const g = u.statis.baru[0]
    const lokasi = g ? `${g.rule} ${path.basename(g.file)}:${g.baris[0]?.line ?? '?'}` : ''
    return `✗ UI ${jumlahBaruStatis(u)} baru: ${lokasi}${u.statis.baru.length > 1 ? ` (+${u.statis.baru.length - 1} kelompok)` : ''} · ${domN} DOM`
  }
  const galat = u.galat.length ? ` · galat: ${u.galat.join('; ')}` : ''
  if (u.status === 'peringatan')
    return `! UI ${domN} temuan DOM (${[...new Set(u.dom?.temuan.map((t) => t.aturan))].join(', ')}) · ${berkas}, 0 baru${galat}`
  return `${u.status === 'galat' ? '!' : '✓'} UI ok (${berkas}, ${domN} DOM)${galat}`
}

export const jumlahBaruStatis = (u: UiLangkah) =>
  (u.statis?.baru ?? []).reduce((a, g) => a + g.baru, 0)
export const jumlahLamaStatis = (u: UiLangkah) =>
  (u.statis?.sudahAda ?? []).reduce((a, g) => a + Math.min(g.jumlah, g.baseline), 0) +
  (u.statis?.baru ?? []).reduce((a, g) => a + g.baseline, 0)
export const jumlahDom = (t: readonly TemuanDom[] | undefined) =>
  (t ?? []).reduce((a, x) => a + x.jumlah, 0)

/** Ringkasan teks akhir untuk CLI. */
export function teksHasilUi(h: HasilPemeriksaanUi | undefined): string {
  if (!h) return 'Pemeriksaan UI: tidak dijalankan'
  if (h.status === 'tidak_dikonfigurasi')
    return `Pemeriksaan UI: tidak dikonfigurasi — ${h.pesan ?? 'isi V2_DIR di .env'}`
  const baru = h.baru.reduce((a, g) => a + g.baru, 0)
  const lama =
    h.sudahAda.reduce((a, g) => a + g.jumlah, 0) + h.baru.reduce((a, g) => a + g.baseline, 0)
  const domN = h.dom.reduce((a, d) => a + d.jumlah, 0)
  const out = [
    `Pemeriksaan UI: ${h.status === 'pelanggaran' ? `PELANGGARAN STATIS BARU ${baru} (${h.baru.length} berkas/aturan)` : h.status === 'peringatan' ? `${domN} temuan DOM (peringatan)` : h.status === 'galat' ? 'galat' : 'lulus'} · ${lama} sudah ada · statis ${h.statis.jumlah}× rata-rata ${h.statis.rataMs} ms (${h.statis.cache} dari cache) · DOM ${h.domWaktu.jumlah}× rata-rata ${h.domWaktu.rataEvalMs} ms evaluasi, ${h.domWaktu.rataMs} ms total`,
  ]
  for (const g of h.baru)
    out.push(
      `  ✗ ${g.rule} ${g.file}: ${g.jumlah} (baseline ${g.baseline}, +${g.baru}) · langkah ${g.langkah} · DESIGN ${g.pasal}`,
      ...g.baris.slice(0, 8).map((b) => `      ${b.file}:${b.line}:${b.col}  ${b.message}`),
    )
  for (const d of h.dom)
    out.push(`  ! DOM ${d.aturan}: ${d.jumlah} · langkah ${d.langkah.join(', ')}`)
  for (const g of h.galat) out.push(`  ! langkah ${g.langkah}: ${g.pesan}`)
  for (const d of h.dilewati) out.push(`  – langkah ${d.langkah} dilewati: ${d.url}`)
  return out.join('\n')
}

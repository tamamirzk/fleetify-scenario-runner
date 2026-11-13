// Pelaksana Pemeriksaan: buka koneksi Bun.sql ke DB lokal v2, jalankan semua invarian (dan baris
// dokumen yang diikuti) dalam satu transaksi READ ONLY per snapshot. Snapshot diambil di baseline
// (sebelum siapkan) dan setelah tiap langkah; snapshot per langkah berjalan asinkron terhadap
// pemutaran lewat antrean berurutan (satu koneksi, tidak pernah paralel, tidak pernah dilewati).
// Tidak ada INSERT/UPDATE/DELETE/DDL di sini.
import { config } from '../core/config.ts'
import { cariDbUrl, namaDb } from '../core/db.ts'
import type { DbLangkah, HasilPemeriksaan } from '../core/run-types.ts'
import type { DokumenRujukan } from '../pustaka/types.ts'
import {
  atribusiLangkah,
  type Baris,
  type HasilInvarian,
  hasilAtribusi,
  type KeadaanAtribusi,
  mulaiAtribusi,
  type Snapshot,
  type SnapshotDokumen,
  sekali,
} from './banding.ts'
import { INVARIAN, type Invarian } from './invarian.ts'

const STATEMENT_TIMEOUT = '20s'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NAMA_SQL = /^[a-z_][a-z0-9_]*$/
const firstLine = (e: unknown) => (e instanceof Error ? e.message : String(e)).split('\n')[0] ?? ''

type Klien = {
  unsafe<T = Baris>(q: string, params?: unknown[]): Promise<T[]>
}

interface Dokumen extends DokumenRujukan {
  label: string
}

/** Alamat DB yang akan dipakai (null = tidak dikonfigurasi); pagar host ada di cariDbUrl. */
export function dbUrlPemeriksaan(): string | null {
  return cariDbUrl({ dbUrl: config.v2DatabaseUrl, backendDir: config.v2BackendDir })
}

/**
 * Antrean snapshot berurutan: `tambah` mengembalikan {dimulai, selesai}. `dimulai` resolve saat
 * kerja benar-benar mulai (yang sebelumnya selesai), `selesai` saat hasilnya ada. Kerja yang gagal
 * tidak memutus antrean, dan tidak ada yang dilewati.
 */
export class AntreanSnapshot<T> {
  private ekor: Promise<unknown> = Promise.resolve()
  private tertunda = 0

  get sisa() {
    return this.tertunda
  }

  tambah(kerja: () => Promise<T>): { dimulai: Promise<void>; selesai: Promise<T> } {
    this.tertunda++
    let tandaiMulai: () => void = () => {}
    const dimulai = new Promise<void>((r) => {
      tandaiMulai = r
    })
    const selesai = this.ekor.then(async () => {
      tandaiMulai()
      try {
        return await kerja()
      } finally {
        this.tertunda--
      }
    })
    this.ekor = selesai.catch(() => {})
    return { dimulai, selesai }
  }

  /** Tunggu semua yang sudah masuk antrean. */
  async tunggu(): Promise<void> {
    await this.ekor
  }
}

export class Pemeriksa {
  private readonly url: string | null
  private readonly nonaktif: readonly string[]
  private readonly log: (l: string) => void
  private baseline: Snapshot | null = null
  private galatBaseline: string | null = null
  private atribusi: KeadaanAtribusi | null = null
  private readonly antrean = new AntreanSnapshot<Snapshot>()
  private readonly dokumen: Dokumen[] = []
  private readonly durasi: number[] = []
  private adaLangkah = false

  constructor(opsi: { nonaktif?: readonly string[]; log?: (l: string) => void } = {}) {
    this.nonaktif = opsi.nonaktif ?? []
    this.log = opsi.log ?? (() => {})
    let url: string | null = null
    try {
      url = dbUrlPemeriksaan()
    } catch (e) {
      // Host ditolak: perlakukan seperti tidak dikonfigurasi, tapi beri tahu.
      this.log(`Pemeriksaan dimatikan: ${firstLine(e)}`)
    }
    this.url = url
  }

  get dikonfigurasi() {
    return this.url !== null
  }

  get tenant() {
    return config.tenantSlug
  }

  get jumlahSnapshot() {
    return this.durasi.length
  }

  get rataMs() {
    return this.durasi.length
      ? Math.round(this.durasi.reduce((a, b) => a + b, 0) / this.durasi.length)
      : 0
  }

  /** Daftarkan baris dokumen hasil aksi pustaka (`dokumen()` di definisi aksi) untuk diikuti. */
  daftarkanDokumen(rujukan: DokumenRujukan[], kunci: string | undefined, nama: string) {
    for (const r of rujukan) {
      const nilai = Object.values(r.where)
      if (!NAMA_SQL.test(r.tabel) || !nilai.length) continue
      if (!Object.keys(r.where).every((k) => NAMA_SQL.test(k))) continue
      if (!nilai.every((v) => typeof v === 'string' && UUID.test(v))) continue
      const dasar = kunci ?? nama
      const label = r.label ? `${dasar} · ${r.label}` : dasar
      if (this.dokumen.some((d) => d.label === label)) continue
      this.dokumen.push({ ...r, label })
    }
  }

  private tidakDikonfigurasi(): HasilPemeriksaan {
    return {
      status: 'tidak_dikonfigurasi',
      baru: [],
      sudahAda: [],
      dilewati: [],
      galat: [],
      diperiksa: 0,
      durasiMs: 0,
      pesan:
        'isi V2_DATABASE_URL di .env (atau V2_BACKEND_DIR yang .env-nya memuat MIGRATE_DATABASE_URL)',
    }
  }

  /** Semua invarian + baris dokumen sekali jalan, dalam satu transaksi READ ONLY. */
  async snapshot(): Promise<Snapshot> {
    if (!this.url) throw new Error('Pemeriksaan tidak dikonfigurasi')
    const t0 = Date.now()
    const { SQL } = await import('bun')
    const sql = new SQL(this.url, { max: 1 })
    try {
      const { hasil, dokumen } = await sql.begin('read only', async (tx) => {
        const k = tx as unknown as Klien
        await k.unsafe(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`)
        const tenant = await k.unsafe<{ id: string }>('SELECT id FROM companies WHERE slug = $1', [
          this.tenant,
        ])
        const companyId = tenant[0]?.id
        if (!companyId) throw new Error(`Tenant "${this.tenant}" tidak ada di tabel companies`)
        const tabel = new Set(
          (
            await k.unsafe<{ table_name: string }>(
              `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`,
            )
          ).map((r) => r.table_name),
        )
        const hasil: HasilInvarian[] = []
        for (const inv of INVARIAN) hasil.push(await this.satu(k, inv, companyId, tabel))
        const dokumen: SnapshotDokumen = {}
        for (const d of this.dokumen) {
          if (!tabel.has(d.tabel)) continue
          const kolom = Object.keys(d.where)
          const q = `SELECT to_jsonb(t) AS baris FROM ${d.tabel} t WHERE ${kolom
            .map((c, i) => `t.${c} = $${i + 1}::uuid`)
            .join(' AND ')} LIMIT 1`
          try {
            await k.unsafe('SAVEPOINT dok')
            const rows = await k.unsafe<{ baris: Baris }>(q, Object.values(d.where))
            await k.unsafe('RELEASE SAVEPOINT dok')
            dokumen[d.label] = { tabel: d.tabel, baris: rows[0]?.baris ?? null }
          } catch {
            await k.unsafe('ROLLBACK TO SAVEPOINT dok').catch(() => {})
          }
        }
        return { hasil, dokumen }
      })
      const durasiMs = Date.now() - t0
      this.durasi.push(durasiMs)
      return { waktu: new Date().toISOString(), hasil, dokumen, durasiMs }
    } finally {
      await sql.close({ timeout: 2 }).catch(() => {})
    }
  }

  private async satu(
    k: Klien,
    inv: Invarian,
    companyId: string,
    tabel: ReadonlySet<string>,
  ): Promise<HasilInvarian> {
    if (this.nonaktif.includes(inv.id)) return { id: inv.id, dilewati: 'dinonaktifkan skenario' }
    const hilang = inv.tabel.filter((t) => !tabel.has(t))
    if (hilang.length)
      return { id: inv.id, dilewati: `tabel tidak ada di database ini: ${hilang.join(', ')}` }
    const q = typeof inv.sql === 'string' ? inv.sql : inv.sql(tabel)
    try {
      await k.unsafe('SAVEPOINT inv')
      const baris = await k.unsafe(q, q.includes('$1') ? [companyId] : [])
      await k.unsafe('RELEASE SAVEPOINT inv')
      return { id: inv.id, baris: baris.map((b) => ({ ...b })) }
    } catch (e) {
      // Satu SQL gagal tidak menggugurkan invarian lain.
      await k.unsafe('ROLLBACK TO SAVEPOINT inv').catch(() => {})
      return { id: inv.id, galat: firstLine(e) }
    }
  }

  /** Baseline sebelum siapkan data. Tidak pernah melempar: galat dicatat di hasil akhir. */
  async ambilBaseline(): Promise<void> {
    if (!this.url) return
    try {
      this.baseline = await this.snapshot()
      this.atribusi = mulaiAtribusi(this.baseline)
      this.log(
        `Pemeriksaan: baseline ${namaDb(this.url)} diambil (${this.baseline.hasil.length} invarian, ${this.baseline.durasiMs} ms)`,
      )
    } catch (e) {
      this.galatBaseline = firstLine(e)
      this.log(`Pemeriksaan: baseline gagal — ${this.galatBaseline}`)
    }
  }

  /**
   * Snapshot setelah langkah `n` (1-based; 0 = sesudah siapkan), masuk antrean. `dimulai` resolve
   * saat query-nya mulai (pemutaran boleh lanjut); `selesai` membawa hasil langkah itu.
   * null bila Pemeriksaan tidak dikonfigurasi atau baseline gagal.
   */
  mulaiLangkah(n: number): { dimulai: Promise<void>; selesai: Promise<DbLangkah> } | null {
    if (!this.url || !this.atribusi) return null
    const atribusi = this.atribusi
    this.adaLangkah = true
    const { dimulai, selesai } = this.antrean.tambah(() => this.snapshot())
    const hasil = selesai.then(
      (snap): DbLangkah => {
        const r = atribusiLangkah(atribusi, INVARIAN, n, snap, this.nonaktif)
        return {
          status: r.pelanggaran.length ? 'pelanggaran' : r.galat.length ? 'galat' : 'ok',
          pelanggaran: r.pelanggaran,
          sembuh: r.sembuh,
          dokumen: r.dokumen,
          galat: r.galat,
          durasiMs: snap.durasiMs ?? null,
        }
      },
      (e): DbLangkah => ({
        status: 'galat',
        pelanggaran: [],
        sembuh: [],
        dokumen: [],
        galat: [{ id: '*', pesan: firstLine(e) }],
        durasiMs: null,
      }),
    )
    return { dimulai, selesai: hasil }
  }

  /** Tunggu semua snapshot yang sudah diantre selesai. */
  async tunggu(): Promise<void> {
    await this.antrean.tunggu()
  }

  /** Hasil akhir: ringkasan atribusi semua langkah (snapshot langkah terakhir = keadaan akhir). */
  async akhir(): Promise<HasilPemeriksaan> {
    if (!this.url) return this.tidakDikonfigurasi()
    const t0 = Date.now()
    if (!this.baseline || !this.atribusi) {
      return {
        ...this.tidakDikonfigurasi(),
        status: 'galat',
        pesan: this.galatBaseline
          ? `baseline gagal: ${this.galatBaseline}`
          : 'baseline belum diambil',
      }
    }
    try {
      // Jalan berhenti sebelum langkah pertama selesai: ambil satu snapshot sekarang (langkah 0).
      if (!this.adaLangkah) {
        const r = this.mulaiLangkah(0)
        if (r) await r.selesai
      }
      await this.tunggu()
      return hasilAtribusi(this.atribusi, INVARIAN, {
        nonaktif: this.nonaktif,
        durasiMs: Date.now() - t0,
        pesan: namaDb(this.url),
        snapshot: { jumlah: this.jumlahSnapshot, rataMs: this.rataMs },
      })
    } catch (e) {
      return {
        ...this.tidakDikonfigurasi(),
        status: 'galat',
        durasiMs: Date.now() - t0,
        pesan: `pemeriksaan akhir gagal: ${firstLine(e)}`,
      }
    }
  }

  /** Satu pass tanpa baseline (bun run pemeriksaan). */
  async sekali(): Promise<HasilPemeriksaan> {
    if (!this.url) return this.tidakDikonfigurasi()
    const t0 = Date.now()
    try {
      const snap = await this.snapshot()
      return sekali(INVARIAN, snap, { durasiMs: Date.now() - t0, pesan: namaDb(this.url) })
    } catch (e) {
      return {
        ...this.tidakDikonfigurasi(),
        status: 'galat',
        durasiMs: Date.now() - t0,
        pesan: firstLine(e),
      }
    }
  }
}

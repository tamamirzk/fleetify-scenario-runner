// Pelaksana Pemeriksaan: buka koneksi Bun.sql ke DB lokal v2, jalankan semua invarian (dan baris
// dokumen yang diikuti) dalam satu transaksi READ ONLY per snapshot. Snapshot diambil di baseline
// (sebelum siapkan) dan setelah tiap langkah; snapshot per langkah berjalan asinkron terhadap
// pemutaran lewat antrean berurutan (satu koneksi, tidak pernah paralel, tidak pernah dilewati).
// Snapshot juga membaca jejak baris tenant (semua tabel ber-company_id) untuk layar Transaksi
// database, dan pernyataan data langkah. Tidak ada INSERT/UPDATE/DELETE/DDL di sini.
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
import {
  diffJejak,
  type HasilPernyataan,
  KOLOM_TENANT,
  nilaiPernyataan,
  type PernyataanSiap,
  type SnapshotJejak,
  sqlPernyataan,
  susunSnapshot,
} from './jejak.ts'

const STATEMENT_TIMEOUT = '20s'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NAMA_SQL = /^[a-z_][a-z0-9_]*$/
/**
 * Batas baris jejak per snapshot. Tenant seed MBL dipakai bersama dan terus bertambah, jadi bisa
 * besar; di atas batas, jejak dilewati dengan galat yang jelas (invarian tetap jalan).
 */
export const BATAS_JEJAK = 60_000
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

  /**
   * `kerja` menerima `mulai()`: panggil saat keadaan yang dibaca sudah terkunci (snapshot DB terbentuk),
   * supaya pemutaran baru lanjut sesudahnya. Tanpa panggilan, `dimulai` resolve saat kerja selesai/gagal.
   */
  tambah(kerja: (mulai: () => void) => Promise<T>): {
    dimulai: Promise<void>
    selesai: Promise<T>
  } {
    this.tertunda++
    let tandaiMulai: () => void = () => {}
    const dimulai = new Promise<void>((r) => {
      tandaiMulai = r
    })
    const selesai = this.ekor.then(async () => {
      try {
        return await kerja(tandaiMulai)
      } finally {
        tandaiMulai()
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

  /** Jejak baris snapshot terakhir yang sudah diproses (pembanding perubahan langkah berikutnya). */
  private jejakTerakhir: SnapshotJejak | null = null
  /** Alasan jejak baris dimatikan untuk jalan ini (gagal/terlalu besar di baseline); null = aktif. */
  private jejakMati: string | null = null

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

  /** Alasan Pemeriksaan DB dilewati di jalan ini; Fleetify hanya punya sasaran lokal, jadi selalu null. */
  get dilewati(): string | null {
    return null
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

  /**
   * Jejak baris: semua baris tabel ber-company_id milik tenant (to_jsonb), identitas = kunci
   * primer. Satu UNION ALL; bila gagal, per tabel dengan SAVEPOINT (tabel yang gagal dilewati).
   */
  private async jejak(k: Klien, tenant: string): Promise<SnapshotJejak> {
    const tabel = (
      await k.unsafe<{ t: string; pk: string | null }>(
        `SELECT c.table_name AS t,
                (SELECT string_agg(a.attname, ',' ORDER BY array_position(i.indkey::int2[], a.attnum))
                   FROM pg_index i JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
                  WHERE i.indrelid = format('public.%I', c.table_name)::regclass AND i.indisprimary) AS pk
           FROM information_schema.columns c
           JOIN information_schema.tables tb
             ON tb.table_schema = c.table_schema AND tb.table_name = c.table_name AND tb.table_type = 'BASE TABLE'
          WHERE c.table_schema = 'public' AND c.column_name = '${KOLOM_TENANT}'
          ORDER BY 1`,
      )
    ).filter((x) => NAMA_SQL.test(x.t))
    const pk = Object.fromEntries(tabel.map((x) => [x.t, x.pk ? x.pk.split(',') : []]))
    const satu = (t: string) =>
      `SELECT '${t}' AS t, to_jsonb(r) AS j FROM "${t}" r WHERE r.${KOLOM_TENANT} = $1::uuid`
    const jumlah = await k.unsafe<{ n: string }>(
      `SELECT (${tabel.map((x) => `(SELECT count(*) FROM "${x.t}" WHERE ${KOLOM_TENANT} = $1::uuid)`).join(' + ') || '0'})::text AS n`,
      [tenant],
    )
    const n = Number(jumlah[0]?.n ?? 0)
    if (n > BATAS_JEJAK)
      throw new Error(
        `jejak baris dilewati: ${n.toLocaleString('id-ID')} baris tenant melebihi batas ${BATAS_JEJAK.toLocaleString('id-ID')}`,
      )
    let rows: { t: string; j: Baris }[] = []
    try {
      await k.unsafe('SAVEPOINT jejak')
      rows = await k.unsafe(tabel.map((x) => satu(x.t)).join('\nUNION ALL\n'), [tenant])
      await k.unsafe('RELEASE SAVEPOINT jejak')
    } catch {
      await k.unsafe('ROLLBACK TO SAVEPOINT jejak').catch(() => {})
      for (const x of tabel)
        try {
          await k.unsafe('SAVEPOINT jejak1')
          rows.push(...(await k.unsafe<{ t: string; j: Baris }>(satu(x.t), [tenant])))
          await k.unsafe('RELEASE SAVEPOINT jejak1')
        } catch {
          await k.unsafe('ROLLBACK TO SAVEPOINT jejak1').catch(() => {})
        }
    }
    return susunSnapshot(rows, pk)
  }

  /** Pernyataan data langkah `n` di transaksi yang sama (baca-saja, dibatasi tenant). */
  private async pernyataan(
    k: Klien,
    tenant: string,
    n: number,
    daftar: readonly PernyataanSiap[],
  ): Promise<HasilPernyataan[]> {
    const out: HasilPernyataan[] = []
    for (const p of daftar) {
      const q = sqlPernyataan(p)
      const dasar = {
        id: p.id,
        judul: p.judul,
        langkah: n,
        lulus: false,
        diharapkan: p.jumlah !== undefined ? `${p.jumlah} baris` : String(p.diharapkan ?? ''),
      }
      if (!q) {
        out.push({ ...dasar, terlihat: '–', galat: 'nama tabel/kolom tidak sah' })
        continue
      }
      try {
        await k.unsafe('SAVEPOINT pd')
        const rows = await k.unsafe<{ v: string | null }>(q.sql, [tenant, ...q.params])
        await k.unsafe('RELEASE SAVEPOINT pd')
        out.push(
          nilaiPernyataan(
            p,
            n,
            rows.map((r) => r.v),
          ),
        )
      } catch (e) {
        await k.unsafe('ROLLBACK TO SAVEPOINT pd').catch(() => {})
        out.push({ ...dasar, terlihat: '–', galat: firstLine(e) })
      }
    }
    return out
  }

  /**
   * Semua invarian + baris dokumen + jejak baris (+ pernyataan data) dalam satu transaksi
   * REPEATABLE READ READ ONLY: semua query membaca SATU keadaan DB (yang terkunci pada SELECT pertama),
   * jadi aksi langkah berikutnya yang tersimpan selama snapshot berjalan tidak ikut terbaca. `mulai`
   * dipanggil sesudah SELECT pertama itu, saat pemutaran boleh lanjut.
   */
  async snapshot(
    minta: { langkah: number; pernyataan: readonly PernyataanSiap[] } | null = null,
    mulai: () => void = () => {},
  ): Promise<Snapshot> {
    if (!this.url) throw new Error('Pemeriksaan tidak dikonfigurasi')
    const t0 = Date.now()
    const { SQL } = await import('bun')
    const sql = new SQL(this.url, { max: 1 })
    try {
      const isi = await sql.begin('isolation level repeatable read read only', async (tx) => {
        const k = tx as unknown as Klien
        await k.unsafe(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`)
        const tenant = await k.unsafe<{ id: string }>('SELECT id FROM companies WHERE slug = $1', [
          this.tenant,
        ])
        // Snapshot transaksi sudah terkunci oleh SELECT di atas: pemutaran boleh lanjut.
        mulai()
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
        let jejak: SnapshotJejak | undefined
        let galatJejak: string | undefined
        if (!this.jejakMati)
          try {
            await k.unsafe('SAVEPOINT jejak0')
            jejak = await this.jejak(k, companyId)
            await k.unsafe('RELEASE SAVEPOINT jejak0')
          } catch (e) {
            await k.unsafe('ROLLBACK TO SAVEPOINT jejak0').catch(() => {})
            galatJejak = firstLine(e)
          }
        const pernyataan = minta?.pernyataan.length
          ? await this.pernyataan(k, companyId, minta.langkah, minta.pernyataan)
          : undefined
        return { hasil, dokumen, jejak, galatJejak, pernyataan }
      })
      const durasiMs = Date.now() - t0
      this.durasi.push(durasiMs)
      return { waktu: new Date().toISOString(), ...isi, durasiMs }
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
      this.jejakTerakhir = this.baseline.jejak ?? null
      if (this.baseline.galatJejak) {
        this.jejakMati = this.baseline.galatJejak
        this.log(`Pemeriksaan: transaksi database tidak dicatat — ${this.jejakMati}`)
      }
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
  mulaiLangkah(
    n: number,
    opsi: { pernyataan?: readonly PernyataanSiap[] } = {},
  ): { dimulai: Promise<void>; selesai: Promise<DbLangkah> } | null {
    if (!this.url || !this.atribusi) return null
    const atribusi = this.atribusi
    this.adaLangkah = true
    const minta = { langkah: n, pernyataan: opsi.pernyataan ?? [] }
    const { dimulai, selesai } = this.antrean.tambah((mulai) => this.snapshot(minta, mulai))
    const hasil = selesai.then(
      (snap): DbLangkah => {
        const r = atribusiLangkah(atribusi, INVARIAN, n, snap, this.nonaktif)
        // Antrean berurutan: handler ini berjalan sesuai urutan snapshot, jadi pembandingnya benar.
        const perubahan =
          snap.jejak && this.jejakTerakhir ? diffJejak(this.jejakTerakhir, snap.jejak) : undefined
        if (snap.jejak) this.jejakTerakhir = snap.jejak
        const galat = snap.galatJejak
          ? [...r.galat, { id: 'jejak', pesan: snap.galatJejak }]
          : r.galat
        return {
          status: r.pelanggaran.length ? 'pelanggaran' : galat.length ? 'galat' : 'ok',
          pelanggaran: r.pelanggaran,
          sembuh: r.sembuh,
          dokumen: r.dokumen,
          galat,
          durasiMs: snap.durasiMs ?? null,
          waktu: snap.waktu,
          ...(perubahan ? { perubahan } : {}),
          ...(snap.pernyataan ? { pernyataan: snap.pernyataan } : {}),
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
      const h = hasilAtribusi(this.atribusi, INVARIAN, {
        nonaktif: this.nonaktif,
        durasiMs: Date.now() - t0,
        pesan: namaDb(this.url),
        snapshot: { jumlah: this.jumlahSnapshot, rataMs: this.rataMs },
      })
      return this.jejakMati ? { ...h, jejakMati: this.jejakMati } : h
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

// Jejak baris per tenant (murni, diuji Vitest): snapshot baris tabel ber-company_id dibandingkan
// antar-snapshot (sebelum siapkan, sesudah siapkan/capai, sesudah tiap langkah) → baris baru (INSERT),
// hilang (DELETE), kolom berubah (UPDATE, lama → baru). Hanya yang terlihat dari isi tabel: status
// COMMIT/ROLLBACK per transaksi tidak diketahui dan tidak dikarang. Pernyataan data dinilai di sini juga.

export type Baris = Record<string, unknown>
/** tabel → kunci baris → isi baris (to_jsonb). */
export type SnapshotJejak = Record<string, Record<string, Baris>>
export type Operasi = 'INSERT' | 'UPDATE' | 'DELETE'

export interface PerubahanBaris {
  /** Identitas baris: nilai kunci primer (atau isi baris bila tabel tanpa kunci primer). */
  kunci: string
  operasi: Operasi
  /** INSERT: kolom berisi (dari = null); DELETE: kolom lama (ke = null); UPDATE: kolom yang berubah. */
  kolom: { kolom: string; dari: unknown; ke: unknown }[]
}

export interface PerubahanTabel {
  tabel: string
  insert: number
  update: number
  delete: number
  baris: PerubahanBaris[]
}

/** Kolom yang tidak ditampilkan di diff (tetap dihitung sebagai perubahan baris). */
/** Kolom tenant di DB (tenant = baris tabel companies). */
export const KOLOM_TENANT = 'company_id'

export const KOLOM_SENYAP = new Set([KOLOM_TENANT])
const sama = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Kunci baris dari kolom kunci primer; tanpa kunci primer: seluruh isi baris. */
export function kunciBaris(b: Baris, pk: readonly string[]): string {
  if (!pk.length) return JSON.stringify(b)
  return pk.map((k) => String(b[k] ?? '∅')).join('·')
}

/** Kelompokkan baris mentah {t, j} hasil SQL menjadi snapshot, memakai peta kunci primer per tabel. */
export function susunSnapshot(
  rows: readonly { t: string; j: Baris }[],
  pk: Readonly<Record<string, readonly string[]>>,
): SnapshotJejak {
  const out: SnapshotJejak = {}
  for (const { t, j } of rows) {
    const tabel = out[t] ?? {}
    out[t] = tabel
    tabel[kunciBaris(j, pk[t] ?? [])] = j
  }
  return out
}

/** Perubahan baris antara dua snapshot jejak, per tabel (urut nama tabel). */
export function diffJejak(sebelum: SnapshotJejak, sesudah: SnapshotJejak): PerubahanTabel[] {
  const out: PerubahanTabel[] = []
  for (const tabel of [...new Set([...Object.keys(sebelum), ...Object.keys(sesudah)])].sort()) {
    const a = sebelum[tabel] ?? {}
    const b = sesudah[tabel] ?? {}
    const baris: PerubahanBaris[] = []
    for (const [k, x] of Object.entries(b)) {
      const lama = a[k]
      if (!lama) {
        baris.push({
          kunci: k,
          operasi: 'INSERT',
          kolom: Object.keys(x)
            .filter((c) => x[c] != null && !KOLOM_SENYAP.has(c))
            .map((c) => ({ kolom: c, dari: null, ke: x[c] })),
        })
        continue
      }
      const kolom = [...new Set([...Object.keys(lama), ...Object.keys(x)])]
        .filter((c) => !sama(lama[c], x[c]))
        .map((c) => ({ kolom: c, dari: lama[c] ?? null, ke: x[c] ?? null }))
      if (kolom.length) baris.push({ kunci: k, operasi: 'UPDATE', kolom })
    }
    for (const [k, x] of Object.entries(a))
      if (!b[k])
        baris.push({
          kunci: k,
          operasi: 'DELETE',
          kolom: Object.keys(x)
            .filter((c) => x[c] != null && !KOLOM_SENYAP.has(c))
            .map((c) => ({ kolom: c, dari: x[c], ke: null })),
        })
    if (!baris.length) continue
    out.push({
      tabel,
      insert: baris.filter((r) => r.operasi === 'INSERT').length,
      update: baris.filter((r) => r.operasi === 'UPDATE').length,
      delete: baris.filter((r) => r.operasi === 'DELETE').length,
      baris,
    })
  }
  return out
}

// ── Pernyataan data ──────────────────────────────────────────────────────────
export interface PernyataanSiap {
  id: string
  judul: string
  tabel: string
  cocok: Record<string, string | number | boolean | null>
  kolom?: string
  diharapkan?: string
  jumlah?: number
}

export interface HasilPernyataan {
  id: string
  judul: string
  langkah: number
  lulus: boolean
  diharapkan: string
  terlihat: string
  galat?: string
}

const NAMA_SQL = /^[a-z_][a-z0-9_]*$/

/** SQL baca-saja satu pernyataan (dibatasi tenant $1); parameter $2.. = nilai cocok. null bila nama tidak sah. */
export function sqlPernyataan(p: PernyataanSiap): { sql: string; params: unknown[] } | null {
  const kolomCocok = Object.keys(p.cocok)
  if (![p.tabel, ...kolomCocok, ...(p.kolom ? [p.kolom] : [])].every((n) => NAMA_SQL.test(n)))
    return null
  const where = [
    `t.${KOLOM_TENANT} = $1::uuid`,
    ...kolomCocok.map((c, i) =>
      p.cocok[c] === null ? `t.${c} IS NULL` : `t.${c}::text = $${i + 2}::text`,
    ),
  ].join(' AND ')
  const params = kolomCocok.map((c) => (p.cocok[c] === null ? null : String(p.cocok[c])))
  const pilih = p.jumlah !== undefined ? 'count(*)::text AS v' : `t.${p.kolom}::text AS v`
  return { sql: `SELECT ${pilih} FROM ${p.tabel} t WHERE ${where} LIMIT 50`, params }
}

const normal = (t: string) => t.replaceAll(/\s+/g, ' ').trim().toLowerCase()
/** Nilai DB vs diharapkan: angka dibanding sebagai angka, pola "/regex/", selain itu teks tanpa beda huruf. */
export function cocokNilaiDb(v: string | null, diharapkan: string): boolean {
  if (v === null) return false
  const re = /^\/(.*)\/([a-z]*)$/s.exec(diharapkan)
  if (re) return new RegExp(re[1] ?? '', re[2]).test(v)
  const a = Number(v)
  const b = Number(diharapkan)
  if (v.trim() !== '' && diharapkan.trim() !== '' && Number.isFinite(a) && Number.isFinite(b))
    return a === b
  return normal(v) === normal(diharapkan)
}

/** Nilai hasil SELECT pernyataan → hasil. */
export function nilaiPernyataan(
  p: PernyataanSiap,
  langkah: number,
  nilai: readonly (string | null)[],
): HasilPernyataan {
  const dasar = { id: p.id, judul: p.judul, langkah }
  if (p.jumlah !== undefined) {
    const n = Number(nilai[0] ?? 0)
    return {
      ...dasar,
      diharapkan: `${p.jumlah} baris`,
      terlihat: `${n} baris`,
      lulus: n === p.jumlah,
    }
  }
  const diharapkan = String(p.diharapkan ?? '')
  if (!nilai.length)
    return { ...dasar, diharapkan, terlihat: 'tidak ada baris yang cocok', lulus: false }
  const unik = [...new Set(nilai.map((v) => v ?? '∅'))]
  return {
    ...dasar,
    diharapkan,
    terlihat:
      unik.length > 1 ? `${nilai.length} baris: ${unik.slice(0, 5).join(', ')}` : (unik[0] ?? ''),
    lulus: nilai.every((v) => cocokNilaiDb(v, diharapkan)),
  }
}

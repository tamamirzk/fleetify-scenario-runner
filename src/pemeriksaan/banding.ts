// Pembanding baseline vs akhir (murni, diuji Vitest). Identitas baris = nilai kolomKunci.
import type { DiffDokumen, HasilPemeriksaan, ItemPemeriksaan } from '../core/run-types.ts'
import type { Invarian } from './invarian.ts'

export type Baris = Record<string, unknown>

/** Hasil satu invarian pada satu pass (baseline atau akhir). */
export interface HasilInvarian {
  id: string
  baris?: Baris[]
  dilewati?: string
  galat?: string
}

/** Baris dokumen yang diikuti: kunci = label, nilai = baris (null = tidak ada). */
export type SnapshotDokumen = Record<string, { tabel: string; baris: Baris | null }>

export interface Snapshot {
  waktu: string
  hasil: HasilInvarian[]
  dokumen?: SnapshotDokumen
  durasiMs?: number
}

export const kunciBaris = (baris: Baris, kolomKunci: readonly string[]): string =>
  JSON.stringify(kolomKunci.map((k) => (baris[k] === undefined ? null : String(baris[k]))))

const angka = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/** Baris akhir yang tidak ada di baseline (mode pelanggaran) — identitas lewat kolomKunci. */
export function barisBaru(inv: Invarian, baseline: Baris[], akhir: Baris[]) {
  const lama = new Set(baseline.map((b) => kunciBaris(b, inv.kolomKunci)))
  const baru: Baris[] = []
  const sudahAda: Baris[] = []
  for (const b of akhir) (lama.has(kunciBaris(b, inv.kolomKunci)) ? sudahAda : baru).push(b)
  return { baru, sudahAda }
}

/** Mode kenaikan: baris akhir yang kolomAngka-nya lebih besar daripada baseline (tanpa baseline = 0). */
export function barisNaik(inv: Invarian, baseline: Baris[], akhir: Baris[]): Baris[] {
  const lama = new Map(baseline.map((b) => [kunciBaris(b, inv.kolomKunci), b]))
  const out: Baris[] = []
  for (const b of akhir) {
    const sebelum = lama.get(kunciBaris(b, inv.kolomKunci))
    const naik = (inv.kolomAngka ?? []).filter((k) => angka(b[k]) > angka(sebelum?.[k]))
    if (naik.length)
      out.push({
        ...b,
        kenaikan: naik.map((k) => `${k} ${angka(sebelum?.[k])} → ${angka(b[k])}`).join(', '),
      })
  }
  return out
}

/** Gabungkan dua snapshot menjadi hasil akhir. `nonaktif` = id yang dimatikan skenario. */
export function bandingkan(
  daftar: readonly Invarian[],
  baseline: Snapshot,
  akhir: Snapshot,
  opsi: { nonaktif?: readonly string[]; durasiMs: number; pesan?: string },
): HasilPemeriksaan {
  const out: HasilPemeriksaan = {
    status: 'lulus',
    baru: [],
    sudahAda: [],
    dilewati: [],
    galat: [],
    diperiksa: 0,
    durasiMs: opsi.durasiMs,
    pesan: opsi.pesan,
  }
  const b0 = new Map(baseline.hasil.map((h) => [h.id, h]))
  const b1 = new Map(akhir.hasil.map((h) => [h.id, h]))
  for (const inv of daftar) {
    const item = (baris: Baris[]): ItemPemeriksaan => ({
      id: inv.id,
      judul: inv.judul,
      keterangan: inv.keterangan,
      baris,
    })
    if (opsi.nonaktif?.includes(inv.id)) {
      out.dilewati.push({ id: inv.id, judul: inv.judul, alasan: 'dinonaktifkan skenario' })
      continue
    }
    const h0 = b0.get(inv.id)
    const h1 = b1.get(inv.id)
    const galat = h1?.galat ?? h0?.galat
    if (galat) {
      out.galat.push({ id: inv.id, judul: inv.judul, pesan: galat })
      continue
    }
    const dilewati = h1?.dilewati ?? h0?.dilewati
    if (dilewati || !h1) {
      out.dilewati.push({ id: inv.id, judul: inv.judul, alasan: dilewati ?? 'tidak dijalankan' })
      continue
    }
    out.diperiksa++
    if (inv.mode === 'kenaikan') {
      const naik = barisNaik(inv, h0?.baris ?? [], h1.baris ?? [])
      if (naik.length) out.baru.push(item(naik))
      continue
    }
    const { baru, sudahAda } = barisBaru(inv, h0?.baris ?? [], h1.baris ?? [])
    if (baru.length) out.baru.push(item(baru))
    if (sudahAda.length) out.sudahAda.push(item(sudahAda))
  }
  out.status = out.baru.length ? 'pelanggaran' : out.galat.length ? 'galat' : 'lulus'
  return out
}

/** Satu pass tanpa baseline (bun run pemeriksaan): semua baris dilaporkan sebagai "ada". */
export function sekali(
  daftar: readonly Invarian[],
  snap: Snapshot,
  opsi: { durasiMs: number; pesan?: string },
): HasilPemeriksaan {
  const out = bandingkan(daftar, { waktu: snap.waktu, hasil: [] }, snap, opsi)
  // Tanpa baseline semua baris terbaca "baru"; pindahkan ke sudahAda supaya tidak dibaca pelanggaran skenario.
  out.sudahAda = out.baru
  out.baru = []
  // Mode kenaikan tidak punya pembanding: tampilkan nilai penghitungnya apa adanya.
  for (const inv of daftar) {
    if (inv.mode !== 'kenaikan' || out.sudahAda.some((i) => i.id === inv.id)) continue
    const h = snap.hasil.find((x) => x.id === inv.id)
    if (h?.baris)
      out.sudahAda.push({
        id: inv.id,
        judul: inv.judul,
        keterangan: inv.keterangan,
        baris: h.baris,
      })
  }
  out.status = out.galat.length ? 'galat' : 'lulus'
  return out
}

const nilai = (v: unknown) => (v == null ? '-' : String(v))

/** Ringkasan teks untuk CLI. */
export function teksHasil(h: HasilPemeriksaan | undefined, { maksBaris = 5 } = {}): string {
  if (!h) return 'Pemeriksaan: tidak dijalankan'
  if (h.status === 'tidak_dikonfigurasi')
    return `Pemeriksaan: tidak dikonfigurasi — ${h.pesan ?? 'isi V2_DATABASE_URL di .env'}`
  const baris: string[] = []
  const judul =
    h.status === 'pelanggaran'
      ? `PELANGGARAN BARU di ${h.baru.length} invarian`
      : h.status === 'galat'
        ? `galat di ${h.galat.length} invarian`
        : `semua invarian lulus (${h.diperiksa} diperiksa)`
  baris.push(
    `Pemeriksaan: ${judul}${h.snapshot ? ` · ${h.snapshot.jumlah} snapshot, rata-rata ${h.snapshot.rataMs} ms` : ''}${h.pesan ? ` · ${h.pesan}` : ''}`,
  )
  const tabel = (rows: Baris[]) => {
    const kolom = Object.keys(rows[0] ?? {})
    for (const r of rows.slice(0, maksBaris))
      baris.push(`      ${kolom.map((k) => `${k}=${nilai(r[k])}`).join('  ')}`)
    if (rows.length > maksBaris) baris.push(`      … ${rows.length - maksBaris} baris lagi`)
  }
  for (const it of h.baru) {
    const di =
      it.langkah !== undefined
        ? ` (muncul di langkah ${it.langkah}${it.sembuh !== undefined ? `, sembuh di langkah ${it.sembuh}` : ''})`
        : ''
    baris.push(`  ✗ ${it.id} — ${it.judul}: ${it.baris.length} baris baru${di}`)
    tabel(it.baris)
  }
  for (const it of h.sudahAda)
    baris.push(`  · ${it.id}: ${it.baris.length} baris sudah ada sebelumnya`)
  for (const g of h.galat) baris.push(`  ! ${g.id} galat: ${g.pesan}`)
  for (const d of h.dilewati) baris.push(`  – ${d.id} dilewati: ${d.alasan}`)
  return baris.join('\n')
}

// ── Atribusi per langkah ─────────────────────────────────────────────────────
interface Catatan {
  id: string
  kunci: string
  baris: Baris
  langkah: number
  sembuh?: number
}

/** Keadaan atribusi: pelanggaran yang pernah muncul sejak baseline, dengan langkah muncul/sembuh. */
export interface KeadaanAtribusi {
  baseline: Snapshot
  catatan: Catatan[]
  /** Snapshot terakhir yang diproses (pembanding diff dokumen). */
  terakhir: Snapshot
}

export const mulaiAtribusi = (baseline: Snapshot): KeadaanAtribusi => ({
  baseline,
  catatan: [],
  terakhir: baseline,
})

const kelompok = (daftar: readonly Invarian[], cs: Catatan[]): ItemPemeriksaan[] => {
  const out: ItemPemeriksaan[] = []
  for (const c of cs) {
    const inv = daftar.find((i) => i.id === c.id)
    if (!inv) continue
    let item = out.find((o) => o.id === c.id && o.langkah === c.langkah && o.sembuh === c.sembuh)
    if (!item) {
      item = {
        id: inv.id,
        judul: inv.judul,
        keterangan: inv.keterangan,
        baris: [],
        langkah: c.langkah,
      }
      if (c.sembuh !== undefined) item.sembuh = c.sembuh
      out.push(item)
    }
    item.baris.push(c.baris)
  }
  return out
}

/**
 * Proses snapshot setelah langkah `n` (1-based; 0 = sesudah siapkan). Mengubah `k` dan mengembalikan
 * pelanggaran yang pertama muncul di langkah ini, yang sembuh di langkah ini, galat SQL, dan diff dokumen.
 */
export function atribusiLangkah(
  k: KeadaanAtribusi,
  daftar: readonly Invarian[],
  n: number,
  snap: Snapshot,
  nonaktif: readonly string[] = [],
) {
  const b0 = new Map(k.baseline.hasil.map((h) => [h.id, h]))
  const b1 = new Map(snap.hasil.map((h) => [h.id, h]))
  const baru: Catatan[] = []
  const sembuh: Catatan[] = []
  const galat: { id: string; pesan: string }[] = []
  for (const inv of daftar) {
    if (nonaktif.includes(inv.id)) continue
    const h0 = b0.get(inv.id)
    const h1 = b1.get(inv.id)
    if (h1?.galat) {
      galat.push({ id: inv.id, pesan: h1.galat })
      continue
    }
    if (!h1?.baris || h0?.galat) continue
    const kini =
      inv.mode === 'kenaikan'
        ? barisNaik(inv, h0?.baris ?? [], h1.baris)
        : barisBaru(inv, h0?.baris ?? [], h1.baris).baru
    const kunciKini = new Map(kini.map((b) => [kunciBaris(b, inv.kolomKunci), b]))
    const aktif = k.catatan.filter((c) => c.id === inv.id && c.sembuh === undefined)
    for (const c of aktif)
      if (!kunciKini.has(c.kunci)) {
        c.sembuh = n
        sembuh.push(c)
      }
    for (const [kunci, baris] of kunciKini) {
      if (aktif.some((c) => c.kunci === kunci)) continue
      const c: Catatan = { id: inv.id, kunci, baris, langkah: n }
      k.catatan.push(c)
      baru.push(c)
    }
  }
  const dokumen = diffDokumen(k.terakhir.dokumen ?? {}, snap.dokumen ?? {})
  k.terakhir = snap
  return { pelanggaran: kelompok(daftar, baru), sembuh: kelompok(daftar, sembuh), galat, dokumen }
}

/** Ringkasan akhir dari atribusi: semua pelanggaran yang pernah muncul (dengan langkah muncul dan sembuh). */
export function hasilAtribusi(
  k: KeadaanAtribusi,
  daftar: readonly Invarian[],
  opsi: {
    nonaktif?: readonly string[]
    durasiMs: number
    pesan?: string
    snapshot?: { jumlah: number; rataMs: number }
  },
): HasilPemeriksaan {
  const dasar = bandingkan(daftar, k.baseline, k.terakhir, opsi)
  // Pembanding akhir hanya melihat yang masih ada; riwayat memuat juga yang sembuh di tengah jalan.
  const baru = kelompok(
    daftar,
    k.catatan.filter((c) => !opsi.nonaktif?.includes(c.id)),
  )
  return {
    ...dasar,
    baru,
    status: baru.length ? 'pelanggaran' : dasar.galat.length ? 'galat' : 'lulus',
    snapshot: opsi.snapshot,
  }
}

// ── Diff dokumen ─────────────────────────────────────────────────────────────
const KOLOM_DIABAIKAN = new Set(['updated_at'])
const sama = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

/** Kolom yang berubah per dokumen antara dua snapshot dokumen. */
export function diffDokumen(sebelum: SnapshotDokumen, sesudah: SnapshotDokumen): DiffDokumen[] {
  const out: DiffDokumen[] = []
  for (const [label, d1] of Object.entries(sesudah)) {
    const d0 = sebelum[label]
    const b0 = d0?.baris ?? null
    const b1 = d1.baris
    if (!b0 && !b1) continue
    if (!b0 && b1) {
      out.push({ label, tabel: d1.tabel, jenis: 'dibuat', perubahan: ringkasBaris(b1) })
      continue
    }
    if (b0 && !b1) {
      out.push({ label, tabel: d1.tabel, jenis: 'dihapus', perubahan: [] })
      continue
    }
    if (!b0 || !b1) continue
    const perubahan = [...new Set([...Object.keys(b0), ...Object.keys(b1)])]
      .filter((k) => !KOLOM_DIABAIKAN.has(k) && !sama(b0[k], b1[k]))
      .sort()
      .map((kolom) => ({ kolom, dari: b0[kolom] ?? null, ke: b1[kolom] ?? null }))
    if (perubahan.length) out.push({ label, tabel: d1.tabel, jenis: 'berubah', perubahan })
  }
  return out
}

/** Baris baru: tampilkan kolom bermakna saja (status, nomor, angka), bukan seluruh baris. */
const KOLOM_PENTING =
  /^(status|.*_status|.*number|.*_qty|quantity.*|.*_rupiah|.*_quantity|stage.*|version)$/
function ringkasBaris(b: Baris) {
  return Object.keys(b)
    .filter((k) => KOLOM_PENTING.test(k) && b[k] != null)
    .sort()
    .map((kolom) => ({ kolom, dari: null, ke: b[kolom] }))
}

export const nilaiDiff = (v: unknown) =>
  v == null ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v)

/** Satu baris teks per dokumen: "mr: status APPROVED → ISSUED, …". */
export function teksDiff(d: DiffDokumen): string {
  if (d.jenis === 'dihapus') return `${d.label}: baris dihapus`
  const isi = d.perubahan
    .map((p) =>
      d.jenis === 'dibuat'
        ? `${p.kolom}=${nilaiDiff(p.ke)}`
        : `${p.kolom} ${nilaiDiff(p.dari)} → ${nilaiDiff(p.ke)}`,
    )
    .join(', ')
  return `${d.label}${d.jenis === 'dibuat' ? ' dibuat' : ''}: ${isi}`
}

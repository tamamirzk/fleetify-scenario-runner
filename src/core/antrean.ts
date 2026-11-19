// Antrean per slot (docs/RANCANGAN-KERJA-V2.md K21). Bagian murni: urutan antrean, kerja berikutnya,
// cek basi, deteksi antrean tertahan, dan usulan rencana slot. Tanpa git, DB, Plane, atau berkas;
// efek sampingnya (menempatkan, menyimpan) ada di kerja-aksi.ts dan memanggil fungsi di sini.
import type { ButuhKamu } from './butuh-kamu.ts'
import { adalahKerjaLokal, type Kerja } from './kerja.ts'
import { NOMOR_SLOT, SLOT_CHAT } from './slot.ts'

/** Tujuan antre: nomor slot, atau `global` (tidak terikat slot; perilaku lama). */
export type TujuanAntre = number | 'global'

const HARI = 86_400_000

export const slotAntre = (k: Kerja): TujuanAntre => k.antre?.slot ?? 'global'

const dalamAntrean = (k: Kerja) => !!k.antre && !k.slot

const urut = (a: Kerja, b: Kerja) =>
  (a.antre?.urutan ?? Number.POSITIVE_INFINITY) - (b.antre?.urutan ?? Number.POSITIVE_INFINITY) ||
  (a.antre?.at ?? '').localeCompare(b.antre?.at ?? '') ||
  a.key.localeCompare(b.key, undefined, { numeric: true })

/** Antrean sebuah tujuan, terurut (termasuk yang sudah selesai: dipakai untuk membersihkan). */
export function antreanLengkap(semua: Kerja[], tujuan: TujuanAntre): Kerja[] {
  return semua.filter((k) => dalamAntrean(k) && slotAntre(k) === tujuan).sort(urut)
}

/** Antrean untuk ditampilkan: tanpa kerja yang sudah selesai. */
export const antreanSlot = (semua: Kerja[], tujuan: TujuanAntre): Kerja[] =>
  antreanLengkap(semua, tujuan).filter((k) => k.tahap !== 'selesai')

/** Kerja berikutnya yang boleh ditempatkan: yang pertama di antrean dan tidak ditunda. */
export const pilihBerikutnya = (antrean: Kerja[]): Kerja | null =>
  antrean.find((k) => !k.ditunda) ?? null

/** Nomor urutan berikutnya untuk antrean sebuah tujuan. */
export function urutanBerikut(semua: Kerja[], tujuan: TujuanAntre): number {
  const ada = antreanLengkap(semua, tujuan).map((k) => k.antre?.urutan ?? 0)
  return Math.max(0, ...ada, antreanLengkap(semua, tujuan).length) + 1
}

/** Salinan kerja yang masuk antrean `tujuan` (di ujung); waktu masuk pertama dipertahankan. */
export function denganAntre(semua: Kerja[], k: Kerja, tujuan: TujuanAntre, kini: string): Kerja {
  if (k.slot) throw new Error(`${k.key} sedang memegang slot ${k.slot}`)
  if (k.tahap === 'selesai') throw new Error(`${k.key} sudah selesai`)
  if (tujuan !== 'global' && !(NOMOR_SLOT as readonly number[]).includes(tujuan))
    throw new Error(`Slot ${tujuan} tidak ada`)
  const { peringatanAntre: _p, ...tanpa } = k
  const lain = semua.filter((x) => x.key !== k.key)
  return {
    ...tanpa,
    antre: {
      at: k.antre?.at ?? kini,
      ...(tujuan === 'global' ? {} : { slot: tujuan }),
      urutan: urutanBerikut(lain, tujuan),
    },
  } as Kerja
}

/**
 * Geser satu butir naik/turun dalam antreannya. Mengembalikan nomor urutan baru (1..n) hanya untuk
 * butir yang berubah; kosong bila sudah di ujung.
 */
export function geserUrutan(
  semua: Kerja[],
  key: string,
  arah: 'naik' | 'turun',
): { key: string; urutan: number }[] {
  const k = semua.find((x) => x.key === key)
  if (!k || !dalamAntrean(k)) throw new Error(`${key} tidak ada di antrean`)
  const daftar = antreanLengkap(semua, slotAntre(k))
  const i = daftar.findIndex((x) => x.key === key)
  const j = arah === 'naik' ? i - 1 : i + 1
  if (j < 0 || j >= daftar.length) return []
  const baru = [...daftar]
  const [ambil] = baru.splice(i, 1)
  baru.splice(j, 0, ambil as Kerja)
  return baru
    .map((x, n) => ({ key: x.key, urutan: n + 1, lama: x.antre?.urutan }))
    .filter((x) => x.urutan !== x.lama)
    .map(({ key: kk, urutan }) => ({ key: kk, urutan }))
}

const NAMA_BATAL = ['cancelled', 'canceled', 'dibatalkan']

/**
 * Cek basi saat giliran tiba: alasan melewati kerja, atau null bila boleh ditempatkan.
 * `statusPlane` = status segar dari Plane (null = tak diketahui: tidak dianggap basi).
 * Kerja lokal (tanpa Plane) tidak dicek ke Plane.
 */
export function cekBasi(
  k: Kerja,
  statusPlane: string | null,
  selesaiNama: string[],
): string | null {
  if (k.tahap === 'selesai') return 'kerja sudah selesai'
  if (adalahKerjaLokal(k) || !statusPlane) return null
  const s = statusPlane.trim().toLowerCase()
  if (selesaiNama.some((x) => x.trim().toLowerCase() === s))
    return `sudah selesai di Plane (${statusPlane})`
  if (NAMA_BATAL.includes(s)) return `dibatalkan di Plane (${statusPlane})`
  return null
}

/** Kenapa kerja aktif ini menunggu Tams (satu kalimat), atau null bila bergerak. */
export function alasanTahan(k: Kerja, butuh: ButuhKamu | null, kini: number): string | null {
  if (k.tahap === 'selesai') return null
  if (k.sesi?.status === 'bekerja') return null
  const tanya = k.pertanyaan.filter((p) => !p.jawaban).length
  if (tanya) return `${tanya} pertanyaan terbuka`
  if (butuh?.titik === 'B') return 'menunggu review ◆B'
  if (k.sesi?.status === 'menunggu') return 'Claude menunggu kamu'
  if (k.ditunda) return 'ditunda'
  const diam = kini - Date.parse(k.diperbarui_at)
  if (Number.isFinite(diam) && diam > HARI)
    return `tahap ${k.tahap} tidak bergerak ${Math.floor(diam / HARI)} hari`
  return null
}

export interface AntreanTertahan {
  slot: number
  oleh: string
  judulOleh: string
  alasan: string
  /** Sisa antrean slot itu (yang bisa dipindahkan). */
  antrean: { key: string; judul: string }[]
}

/**
 * Antrean slot yang tertahan: slot punya antrean dan kerja aktifnya menunggu Tams.
 * `butuhDari` memberi hasil `butuhKamu` per kerja (dihitung pemanggil; butuh baca catatan).
 */
export function antreanTertahan(
  semua: Kerja[],
  butuhDari: (k: Kerja) => ButuhKamu | null,
  kini: number,
): AntreanTertahan[] {
  const out: AntreanTertahan[] = []
  for (const n of NOMOR_SLOT) {
    const antre = antreanSlot(semua, n)
    if (!antre.length) continue
    const aktif = semua.filter((k) => k.slot === n && k.tahap !== 'selesai')
    for (const k of aktif) {
      const alasan = alasanTahan(k, butuhDari(k), kini)
      if (alasan) {
        out.push({
          slot: n,
          oleh: k.key,
          judulOleh: k.judul,
          alasan,
          antrean: antre.map((x) => ({ key: x.key, judul: x.judul })),
        })
        break
      }
    }
  }
  return out
}

// ── Rencana slot ───────────────────────────────────────────────────────────

export const PERINGATAN_KLASTER =
  'Bila tiket bergantung pada tiket lain yang belum di-merge, pakai klaster.'

export interface TiketRencana {
  key: string
  judul: string
  /** Slug modul (tebakModul / `modul` kerja); null = tidak dikenali. */
  modul: string | null
  /** Kerja lokal (BUG/REQ): hanya slot chat. */
  lokal: boolean
}

export interface InfoSlotRencana {
  n: number
  siap: boolean
  pemakai: { key: string; modul: string | null }[]
  /** Panjang antrean slot saat ini. */
  antre: number
}

export interface OpsiRencana {
  jenis: 'antre' | 'slot' | 'klaster'
  n: number
  label: string
}

export interface UsulanTiket {
  key: string
  judul: string
  modul: string | null
  /** Pilihan bawaan (opsi pertama) beserta alasannya; Tams memutuskan per tiket. */
  usulan: OpsiRencana
  alasan: string
  opsi: OpsiRencana[]
}

const opsiAntre = (n: number): OpsiRencana => ({ jenis: 'antre', n, label: `Antre di slot ${n}` })
const opsiSlot = (n: number): OpsiRencana => ({ jenis: 'slot', n, label: `Slot terpisah ${n}` })
const opsiKlaster = (n: number, sama: string): OpsiRencana => ({
  jenis: 'klaster',
  n,
  label: `Satu klaster dengan ${sama} (slot ${n})`,
})

/**
 * Usulan pengelompokan tiket yang belum punya slot. Aturan: modul sama dengan pemakai sebuah slot
 * → antre di slot itu; selain itu slot kosong → slot terpisah; bila semua penuh → antre di slot
 * dengan antrean terpendek. Klaster tidak pernah bawaan (hanya Tams yang tahu satu fitur atau
 * bukan); ia muncul sebagai pilihan lain. Slot chat hanya untuk kerja lokal, atau dipinjam tiket
 * Plane bila slot lain tidak siap/penuh.
 */
export function usulanRencana(tiket: TiketRencana[], slot: InfoSlotRencana[]): UsulanTiket[] {
  type Isi = { key: string; modul: string | null; rencana: boolean }
  const isi = new Map<number, Isi[]>(
    slot.map((s) => [s.n, s.pemakai.map((p) => ({ ...p, rencana: false }))]),
  )
  const panjang = new Map(slot.map((s) => [s.n, s.antre]))
  const siap = (n: number) => slot.find((s) => s.n === n)?.siap ?? false
  const kosong = (n: number) => siap(n) && !(isi.get(n)?.length ?? 0)
  const out: UsulanTiket[] = []

  for (const t of tiket) {
    const utama = slot.filter((s) => s.siap && s.n !== SLOT_CHAT).map((s) => s.n)
    const layak = t.lokal
      ? slot.filter((s) => s.siap && s.n === SLOT_CHAT).map((s) => s.n)
      : [...utama, ...slot.filter((s) => s.siap && s.n === SLOT_CHAT).map((s) => s.n)]
    // Slot chat dipinjam tiket Plane hanya bila semua slot utama terisi.
    const boleh = (n: number) => t.lokal || n !== SLOT_CHAT || utama.every((u) => !kosong(u))
    const kandidat = layak.filter(boleh)
    const sama = t.modul
      ? kandidat.find((n) => (isi.get(n) ?? []).some((x) => x.modul === t.modul))
      : undefined
    const bebas = kandidat.find(kosong)
    const terpendek = [...kandidat].sort(
      (a, b) => (panjang.get(a) ?? 0) - (panjang.get(b) ?? 0) || a - b,
    )[0]

    let usulan: OpsiRencana | null = null
    let alasan = ''
    if (sama !== undefined) {
      const pemegang = (isi.get(sama) ?? []).find((x) => x.modul === t.modul) as Isi
      usulan = opsiAntre(sama)
      alasan = `modul ${t.modul} sama dengan ${pemegang.key}${pemegang.rencana ? ' (rencana)' : ''} di slot ${sama}`
    } else if (bebas !== undefined) {
      usulan = opsiSlot(bebas)
      alasan = t.lokal
        ? 'slot chat kosong'
        : `slot ${bebas} kosong${t.modul ? ` (modul ${t.modul} belum dipakai slot lain)` : ''}`
    } else if (terpendek !== undefined) {
      usulan = opsiAntre(terpendek)
      alasan = t.lokal
        ? `slot chat ${terpendek} terisi; antre di belakangnya`
        : `semua slot terisi modul lain; slot ${terpendek} antreannya terpendek`
    }
    if (!usulan) {
      // Tidak ada slot siap sama sekali: antre global (Tams menempatkan sendiri).
      usulan = { jenis: 'antre', n: 0, label: 'Antre global' }
      alasan = 'tidak ada slot yang siap'
    }

    const opsi: OpsiRencana[] = [usulan]
    const tambah = (o: OpsiRencana) => {
      if (!opsi.some((x) => x.jenis === o.jenis && x.n === o.n)) opsi.push(o)
    }
    if (sama !== undefined) {
      const pemegang = (isi.get(sama) ?? []).find((x) => x.modul === t.modul) as Isi
      tambah(opsiKlaster(sama, pemegang.key))
    }
    for (const n of kandidat.filter(kosong)) tambah(opsiSlot(n))
    for (const n of kandidat) tambah(opsiAntre(n))

    // Perbarui keadaan rencana agar tiket berikutnya melihat hasil usulan ini.
    if (usulan.jenis === 'slot') isi.set(usulan.n, [{ key: t.key, modul: t.modul, rencana: true }])
    else if (usulan.jenis === 'antre' && usulan.n)
      panjang.set(usulan.n, (panjang.get(usulan.n) ?? 0) + 1)

    out.push({ key: t.key, judul: t.judul, modul: t.modul, usulan, alasan, opsi })
  }
  return out
}

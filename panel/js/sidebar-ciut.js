// Sidebar bisa diciutkan: seluruh sidebar → rel ikon, dan tiap grup (Project, Uji per
// modul, blok bawah) serta kelompok modul di daftar skenario bisa dibuka-tutup. Keadaan
// diingat per peramban (localStorage). Murni terhadap objek penyimpanan; galat penyimpanan diabaikan.

const KUNCI = { ciut: 'srf.sbCiut', tutup: 'srf.sbGrupTutup', lipat: 'srf.skLipat' }

const bacaSet = (storage, k) => {
  try {
    const v = JSON.parse(storage?.getItem(k) ?? '[]')
    return new Set(Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

/** @param {{ getItem(k: string): string | null } | null | undefined} storage */
export function muatSidebar(storage) {
  let ciut = false
  try {
    ciut = storage?.getItem(KUNCI.ciut) === '1'
  } catch {
    // Penyimpanan diblokir: bawaan terbuka.
  }
  return { ciut, tutup: bacaSet(storage, KUNCI.tutup), lipat: bacaSet(storage, KUNCI.lipat) }
}

/** @param {{ setItem(k: string, v: string): void } | null | undefined} storage @param {{ ciut?: boolean, tutup?: Set<string>, lipat?: Set<string> }} ubah */
export function simpanSidebar(storage, ubah) {
  try {
    if (ubah.ciut !== undefined) storage?.setItem(KUNCI.ciut, ubah.ciut ? '1' : '0')
    if (ubah.tutup) storage?.setItem(KUNCI.tutup, JSON.stringify([...ubah.tutup]))
    if (ubah.lipat) storage?.setItem(KUNCI.lipat, JSON.stringify([...ubah.lipat]))
  } catch {
    // Diabaikan: hanya kenyamanan.
  }
}

/**
 * Grup yang bawaannya TERTUTUP (rincian Sumber tugas): disimpan sebagai "+kunci" bila dibuka. Grup lain
 * bawaannya terbuka: disimpan sebagai "kunci" bila ditutup.
 */
const bawaanTutup = (k) => k === 'mcp'

/** Apakah grup `k` terbuka menurut himpunan `tutup`. */
export const terbuka = (tutup, k) => (bawaanTutup(k) ? tutup.has(`+${k}`) : !tutup.has(k))

/** id elemen isi grup (aria-controls). */
export const idGrup = (k) => `sbg-${String(k).replaceAll(/[^a-zA-Z0-9-]/g, '-')}`

/**
 * Kunci grup yang memuat butir aktif (dibuka otomatis saat halaman dimuat).
 * @param {{ halaman: string, modulAktif?: string | null }} o
 */
export function grupAktif({ halaman, modulAktif = null }) {
  if (halaman !== 'skenario') return []
  void modulAktif
  return ['proj', 'uji']
}

/** Buka grup-grup aktif: kembalikan Set baru tanpa kunci itu. */
export function bukaAktif(tutup, aktif) {
  const s = new Set(tutup)
  for (const k of aktif) {
    if (bawaanTutup(k)) s.add(`+${k}`)
    else s.delete(k)
  }
  return s
}

/** Balik satu grup. */
export function balik(tutup, k) {
  const s = new Set(tutup)
  const kunci = bawaanTutup(k) ? `+${k}` : k
  if (s.has(kunci)) s.delete(kunci)
  else s.add(kunci)
  return s
}

/** "Ciutkan semua" / "Buka semua" kelompok modul di daftar skenario. */
export const lipatSemua = (kelompok, tutup) => (tutup ? new Set(kelompok) : new Set())

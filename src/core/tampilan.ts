// Tampilan aplikasi: ukuran layar dan skala halaman.
// Diterapkan sebagai viewport CSS = ukuran ÷ skala dengan deviceScaleFactor = skala, jadi screenshot/
// tampilan langsung tetap berukuran piksel yang dipilih sementara aplikasi tampak lebih kecil ("zoom
// out"); semua koordinat Playwright (klik, bbox relatif viewport, cincin target) tetap dalam satu sistem
// CSS px. Bawaan 1400×900 · 100% (ukuran tempat skenario Fleetify ditulis). Murni, diuji Vitest.

export const UKURAN_LAPTOP = ['1400x900', '1280x800', '1600x1000', '1920x1080'] as const
export type UkuranLaptop = (typeof UKURAN_LAPTOP)[number]
export const SKALA = [1, 0.9, 0.8, 0.67] as const

export interface Tampilan {
  /** Ukuran layar dalam piksel screenshot. */
  ukuran: { w: number; h: number }
  /** Skala halaman (zoom peramban): 1 = 100 %. */
  skala: number
}

export const TAMPILAN_BAWAAN: Tampilan = { ukuran: { w: 1400, h: 900 }, skala: 1 }

/** Validasi masukan panel/CLI; galat bila di luar pilihan. */
export function bacaTampilan(ukuran?: unknown, skala?: unknown): Tampilan {
  const u = ukuran === undefined || ukuran === null || ukuran === '' ? '1400x900' : String(ukuran)
  if (!(UKURAN_LAPTOP as readonly string[]).includes(u))
    throw new Error(`Ukuran layar ${u} tidak tersedia; pilih ${UKURAN_LAPTOP.join(', ')}`)
  const s = skala === undefined || skala === null || skala === '' ? 1 : Number(skala)
  if (!(SKALA as readonly number[]).includes(s))
    throw new Error(
      `Skala ${String(skala)} tidak tersedia; pilih ${SKALA.map((x) => `${Math.round(x * 100)}%`).join(', ')}`,
    )
  const [w, h] = u.split('x').map(Number) as [number, number]
  return { ukuran: { w, h }, skala: s }
}

/** Viewport CSS = ukuran ÷ skala. */
export function viewportCss(t: Tampilan): { width: number; height: number } {
  return { width: Math.round(t.ukuran.w / t.skala), height: Math.round(t.ukuran.h / t.skala) }
}

export const adalahBawaan = (t: Tampilan) =>
  t.ukuran.w === TAMPILAN_BAWAAN.ukuran.w &&
  t.ukuran.h === TAMPILAN_BAWAAN.ukuran.h &&
  t.skala === 1

export const teksTampilan = (t: Tampilan) =>
  `${t.ukuran.w}×${t.ukuran.h} · ${Math.round(t.skala * 100)}%`

export const PERINGATAN_TAMPILAN =
  'Skenario ditulis pada 1400×900; di ukuran lain sebagian langkah bisa tidak menemukan sasaran.'

// ── Mutu tampilan langsung (ralat pemilik: HANYA screencast dipertajam) ─────────────────────
// Screenshot langkah/laporan tidak tersentuh (deviceScaleFactor dan ukuran berkas tetap). Bingkai screencast
// tidak disimpan ke disk. "Hemat" = perilaku lama (JPEG 70, maks. 1400×900); "Tajam" = JPEG 92, batas
// mengikuti ukuran tampil × devicePixelRatio peramban panel, maks. 2560×1600. Chromium tidak membesarkan
// bingkai melebihi piksel tangkapan aslinya, jadi tajam = setajam screenshot langkah, tanpa peregangan.

export const MUTU_LANGSUNG = ['tajam', 'hemat'] as const
export type MutuLangsung = (typeof MUTU_LANGSUNG)[number]
export const SCREENCAST_HEMAT = {
  format: 'jpeg',
  quality: 70,
  maxWidth: 1400,
  maxHeight: 900,
} as const
export const SCREENCAST_MAKS = { w: 2560, h: 1600 } as const

export function bacaMutu(m: unknown, bawaan: MutuLangsung = 'hemat'): MutuLangsung {
  if (m === undefined || m === null || m === '') return bawaan
  if (!(MUTU_LANGSUNG as readonly string[]).includes(String(m)))
    throw new Error(`Mutu gambar ${String(m)} tidak tersedia; pilih tajam atau hemat`)
  return m as MutuLangsung
}

/** Ukuran area tampil di panel (CSS px) dan devicePixelRatio perambannya. */
export interface LayarPanel {
  w: number
  h: number
  dpr: number
}

export function bacaLayar(b: unknown): LayarPanel | null {
  const o = b as Record<string, unknown> | null
  const w = Number(o?.w)
  const h = Number(o?.h)
  const dpr = Number(o?.dpr)
  if (![w, h, dpr].every((x) => Number.isFinite(x) && x > 0)) return null
  return { w: Math.round(w), h: Math.round(h), dpr: Math.min(4, dpr) }
}

/** Parameter Page.startScreencast untuk mutu dan layar panel (null = belum dilapor: batas maks.). */
export function opsiScreencast(mutu: MutuLangsung, layar: LayarPanel | null = null) {
  if (mutu === 'hemat') return { ...SCREENCAST_HEMAT }
  const lebar = layar ? Math.ceil(layar.w * layar.dpr) : SCREENCAST_MAKS.w
  const tinggi = layar ? Math.ceil(layar.h * layar.dpr) : SCREENCAST_MAKS.h
  return {
    format: 'jpeg' as const,
    quality: 92,
    // Tidak di bawah batas lama (bingkai tidak lebih kecil daripada Hemat), tidak di atas batas wajar.
    maxWidth: Math.min(SCREENCAST_MAKS.w, Math.max(SCREENCAST_HEMAT.maxWidth, lebar)),
    maxHeight: Math.min(SCREENCAST_MAKS.h, Math.max(SCREENCAST_HEMAT.maxHeight, tinggi)),
  }
}

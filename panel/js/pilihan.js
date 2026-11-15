// Pilihan tontonan yang diingat per peramban (localStorage): kecepatan terakhir dan sakelar
// "Jeda tiap langkah". Murni terhadap objek penyimpanan (bisa palsu di uji); galat penyimpanan diabaikan.
// Kunci berawalan "srf." supaya tidak bercampur dengan panel lain di origin yang sama (127.0.0.1:4800).

export const KECEPATAN = [0.25, 0.5, 1, 1.5, 2, 3]
/** Tampilan aplikasi (sama dengan src/core/tampilan.ts): ukuran layar dan skala halaman. */
export const UKURAN = ['1400x900', '1280x800', '1600x1000', '1920x1080']
export const UKURAN_BAWAAN = '1400x900'
export const SKALA = [1, 0.9, 0.8, 0.67]
/** Mutu tampilan langsung (screencast saja; screenshot langkah/laporan tidak berubah). */
export const MUTU = ['tajam', 'hemat']
export const LABEL_MUTU = { tajam: 'Tajam', hemat: 'Hemat' }
export const PERINGATAN_TAMPILAN =
  'Skenario ditulis pada 1400×900; di ukuran lain sebagian langkah bisa tidak menemukan sasaran.'
const KUNCI = {
  kecepatan: 'srf.kecepatan',
  jeda: 'srf.jedaTiapLangkah',
  ukuran: 'srf.ukuran',
  skala: 'srf.skala',
  mutu: 'srf.mutuLangsung',
}

/** @param {{ getItem(k: string): string | null } | null | undefined} storage */
export function muatPilihan(storage) {
  let kecepatan = 1
  let jedaTiapLangkah = false
  /** Peramban ini pernah memilih sakelar (hanya yang tersimpan dikirim ke server saat panel dimuat). */
  let jedaTersimpan = false
  let ukuran = UKURAN_BAWAAN
  let skala = 1
  let tampilanTersimpan = false
  let mutu = 'tajam'
  let mutuTersimpan = false
  try {
    const k = Number(storage?.getItem(KUNCI.kecepatan))
    if (KECEPATAN.includes(k)) kecepatan = k
    const u = storage?.getItem(KUNCI.ukuran) ?? ''
    const sk = Number(storage?.getItem(KUNCI.skala))
    if (UKURAN.includes(u)) ukuran = u
    if (SKALA.includes(sk)) skala = sk
    tampilanTersimpan = UKURAN.includes(u) || SKALA.includes(sk)
    const m = storage?.getItem(KUNCI.mutu) ?? ''
    if (MUTU.includes(m)) mutu = m
    mutuTersimpan = MUTU.includes(m)
    const j = storage?.getItem(KUNCI.jeda)
    jedaTersimpan = j === '1' || j === '0'
    jedaTiapLangkah = j === '1'
  } catch {
    // Penyimpanan diblokir (mode privat): pakai bawaan.
  }
  return {
    kecepatan,
    jedaTiapLangkah,
    jedaTersimpan,
    ukuran,
    skala,
    tampilanTersimpan,
    mutu,
    mutuTersimpan,
  }
}

/** @param {{ setItem(k: string, v: string): void } | null | undefined} storage @param {{ kecepatan?: number, jedaTiapLangkah?: boolean, ukuran?: string, skala?: number, mutu?: string }} ubah */
export function simpanPilihan(storage, ubah) {
  try {
    if (ubah.kecepatan !== undefined && KECEPATAN.includes(ubah.kecepatan))
      storage?.setItem(KUNCI.kecepatan, String(ubah.kecepatan))
    if (ubah.jedaTiapLangkah !== undefined)
      storage?.setItem(KUNCI.jeda, ubah.jedaTiapLangkah ? '1' : '0')
    if (ubah.ukuran !== undefined && UKURAN.includes(ubah.ukuran))
      storage?.setItem(KUNCI.ukuran, ubah.ukuran)
    if (ubah.skala !== undefined && SKALA.includes(ubah.skala))
      storage?.setItem(KUNCI.skala, String(ubah.skala))
    if (ubah.mutu !== undefined && MUTU.includes(ubah.mutu)) storage?.setItem(KUNCI.mutu, ubah.mutu)
  } catch {
    // Diabaikan: pilihan hanya kenyamanan.
  }
}

export const teksKecepatan = (s) => `${String(s).replace('.', ',')}×`

/** Isi menu kecepatan: pilihan 0,25×–3× + sakelar "Jeda tiap langkah". */
export function menuKecepatan(kecepatan, jedaTiapLangkah) {
  return `${KECEPATAN.map((s) => `<button type="button" role="menuitemradio" aria-checked="${kecepatan === s}" data-speed="${s}">${teksKecepatan(s)}${s < 1 ? ' <span class="dim">lambat</span>' : ''}</button>`).join('')}<div class="rn-menu-sep" role="separator"></div><button type="button" role="menuitemcheckbox" aria-checked="${jedaTiapLangkah}" data-jeda-langkah><span class="sk-cek" aria-hidden="true">${jedaTiapLangkah ? '✓' : ''}</span>Jeda tiap langkah</button>`
}

export const teksUkuran = (u) => u.replace('x', '×')
export const teksSkala = (s) => `${Math.round(s * 100)}%`
export const tampilanBawaan = (ukuran, skala) => ukuran === UKURAN_BAWAAN && Number(skala) === 1

/** Rasio screenshot dari tampilan jalan (bawaan 1400×900 ≈ 1,56). Jalan lama tanpa `tampilan` = 1400×900. */
export function rasioLaptop(tampilan) {
  const u = tampilan?.ukuran
  return u?.w > 0 && u?.h > 0 ? u.w / u.h : 1400 / 900
}

export const KET_TAMPILAN =
  'Ukuran layar + skala halaman: skala lebih kecil = aplikasi tampak lebih "zoom out".'

/** Pilihan Tampilan aplikasi (Ringkasan): ukuran layar laptop + skala halaman, keterangan bila bukan bawaan. */
export function kotakTampilan(ukuran, skala, mutu = 'tajam') {
  return `<div class="tampilan-app"><label>Layar aplikasi <select id="tampilan-ukuran" class="in" aria-label="Ukuran layar aplikasi">${UKURAN.map((u) => `<option value="${u}" ${u === ukuran ? 'selected' : ''}>${teksUkuran(u)}${u === UKURAN_BAWAAN ? ' (bawaan)' : ''}</option>`).join('')}</select></label>
    <label>Skala <select id="tampilan-skala" class="in" aria-label="Skala halaman aplikasi">${SKALA.map((s) => `<option value="${s}" ${s === Number(skala) ? 'selected' : ''}>${teksSkala(s)}${s === 1 ? ' (bawaan)' : ''}</option>`).join('')}</select></label>
    <label>Mutu gambar <select id="tampilan-mutu" class="in" aria-label="Mutu tampilan langsung" title="Hanya tampilan langsung di runner; screenshot langkah dan laporan tidak berubah">${MUTU.map((m) => `<option value="${m}" ${m === mutu ? 'selected' : ''}>${LABEL_MUTU[m]}${m === 'tajam' ? ' (bawaan)' : ' — perilaku lama, lebih ringan'}</option>`).join('')}</select></label>
    <span class="dim">${KET_TAMPILAN}</span>${tampilanBawaan(ukuran, skala) ? '' : `<span class="warn-t">${PERINGATAN_TAMPILAN}</span>`}</div>`
}

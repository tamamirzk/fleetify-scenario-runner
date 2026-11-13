// Pemeriksa DOM langsung: dijalankan di halaman yang sedang tampil lewat page.evaluate, menilai
// elemen yang terlihat terhadap token tema v2 (warna, radius, bayangan kartu, font, kontras
// kuning). Bagian murni (token, normalisasi warna, dedup) diuji Vitest; fungsi `periksaDom`
// berjalan di browser dan diuji dengan fixture HTML lewat Playwright headless.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import type { Page } from 'playwright'
import type { TemuanDom } from '../core/run-types.ts'

export const ATURAN_DOM = [
  'warna-luar-token',
  'radius-menyimpang',
  'bayangan-kartu',
  'font-bukan-inter',
  'kontras-kuning',
] as const
export type AturanDom = (typeof ATURAN_DOM)[number]

/** Pasal DESIGN.md v2 yang dirujuk tiap aturan DOM. */
export const PASAL_DOM: Record<AturanDom, string> = {
  'warna-luar-token': '§3, §8',
  'radius-menyimpang': '§1',
  'bayangan-kartu': '§6',
  'font-bukan-inter': '§4',
  'kontras-kuning': '§2',
}

export const BATAS_TEMUAN = 50
export const BATAS_ELEMEN = 6000

/** Daftar warna sah (rgb ternormalisasi) dan radius sah (px) dari tokens.ts + palette.ts. */
export interface TokenTema {
  warna: string[]
  radius: number[]
  /** Dasar turunan: token + varian light/dark yang MUI hitung dari tiap token (tonalOffset 0.2). */
  basis: string[]
}

const lighten = (c: [number, number, number], k: number) =>
  c.map((v) => Math.round(v + (255 - v) * k)) as [number, number, number]
const darken = (c: [number, number, number], k: number) =>
  c.map((v) => Math.round(v * (1 - k))) as [number, number, number]
const kunci3 = (c: [number, number, number]) => `rgb(${c[0]},${c[1]},${c[2]})`

// ── Normalisasi warna ─────────────────────────────────────────────────────────
export interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

/** `#RGB`, `#RRGGBB`, `#RRGGBBAA`, `rgb()`, `rgba()` → komponen; null bila bukan warna yang dikenal. */
export function uraiWarna(s: string): Rgba | null {
  const t = s.trim().toLowerCase()
  if (t === 'transparent') return { r: 0, g: 0, b: 0, a: 0 }
  let m = t.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/)
  if (m?.[1]) {
    let h = m[1]
    if (h.length <= 4) h = [...h].map((c) => c + c).join('')
    const n = (i: number) => Number.parseInt(h.slice(i, i + 2), 16)
    return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 }
  }
  m = t.match(
    /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/,
  )
  if (m) {
    const a =
      m[4] === undefined ? 1 : m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4])
    return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]), a }
  }
  return null
}

/** Kunci rgb tanpa alpha: `rgb(255,219,14)`. */
export const kunciRgb = (c: Rgba) => `rgb(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)})`

/** Normalisasi string warna apa pun ke kunci rgb; null bila tidak dikenal. */
export function normalisasiWarna(s: string): string | null {
  const c = uraiWarna(s)
  return c ? kunciRgb(c) : null
}

/** Toleransi per kanal: pembulatan browser dan transisi warna yang tertangkap di tengah animasi. */
export const TOLERANSI_KANAL = 6
/** Selisih koefisien lighten/darken antar kanal yang masih dianggap satu turunan. */
const TOLERANSI_KOEFISIEN = 0.04

const uraiKunci = (k: string): [number, number, number] => {
  const m = k.match(/\d+/g) ?? []
  return [Number(m[0] ?? 0), Number(m[1] ?? 0), Number(m[2] ?? 0)]
}

/**
 * Turunan MUI dari satu token: `lighten(T, k)` = T + (255 − T)·k atau `darken(T, k)` = T·(1 − k)
 * dengan k yang sama di tiga kanal (Alert standard = lighten 0.9 / darken 0.6 dari warna status,
 * palette.light/dark = lighten/darken 0.2, dsb.). Dinilai di luar browser dan di dalamnya dengan
 * rumus yang sama (periksaDom menyalin logikanya karena harus mandiri).
 */
export function turunanToken(c: [number, number, number], t: [number, number, number]): boolean {
  if (c.every((v, i) => Math.abs(v - (t[i] ?? 0)) <= TOLERANSI_KANAL)) return true
  const koef = (f: (i: number) => number | null) => {
    const ks = [0, 1, 2].map(f).filter((k): k is number => k !== null)
    if (!ks.length) return false
    const lo = Math.min(...ks)
    const hi = Math.max(...ks)
    return lo >= -0.02 && hi <= 1.02 && hi - lo <= TOLERANSI_KOEFISIEN
  }
  const lighten = koef((i) => {
    const ti = t[i] ?? 0
    const ci = c[i] ?? 0
    if (255 - ti < TOLERANSI_KANAL) return Math.abs(ci - ti) <= TOLERANSI_KANAL ? null : 2
    return (ci - ti) / (255 - ti)
  })
  if (lighten) return true
  return koef((i) => {
    const ti = t[i] ?? 0
    const ci = c[i] ?? 0
    if (ti < TOLERANSI_KANAL) return ci <= TOLERANSI_KANAL ? null : 2
    return 1 - ci / ti
  })
}

/**
 * Warna dianggap sah bila transparan; rgb-nya ada di daftar token (termasuk rgba dengan alpha —
 * MUI menurunkan hover/selected/disabled dari token dengan alpha); hitam/putih murni dengan alpha
 * (common.black/white: action.hover, backdrop); atau turunan lighten/darken satu token
 * (`turunanToken`). Toleransi ±6 per kanal.
 */
export function warnaSah(
  s: string,
  tokenRgb: ReadonlySet<string>,
  basis: Iterable<string> = tokenRgb,
): boolean {
  const c = uraiWarna(s)
  if (!c) return true // color(), currentcolor, dsb.: tidak dinilai
  if (c.a === 0) return true
  const k = kunciRgb(c)
  if (tokenRgb.has(k)) return true
  if (c.a < 1 && (k === 'rgb(0,0,0)' || k === 'rgb(255,255,255)')) return true
  const rgb: [number, number, number] = [Math.round(c.r), Math.round(c.g), Math.round(c.b)]
  for (const t of basis) if (turunanToken(rgb, uraiKunci(t))) return true
  return false
}

// ── Token dari repo v2 ────────────────────────────────────────────────────────
const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g
const RGBA = /rgba?\([^)]*\)/g

/** Semua literal warna di sumber tokens.ts + palette.ts (rgb ternormalisasi, unik, urut) dan radius.* */
export function uraiToken(tokensSrc: string, paletteSrc = ''): TokenTema {
  const warna = new Set<string>()
  for (const src of [tokensSrc, paletteSrc])
    for (const m of [...src.matchAll(HEX), ...src.matchAll(RGBA)]) {
      const k = normalisasiWarna(m[0])
      if (k) warna.add(k)
    }
  // Hitam dan putih murni: dasar common.black/white MUI dan latar bawaan dokumen.
  warna.add('rgb(0,0,0)')
  warna.add('rgb(255,255,255)')
  const radius = new Set<number>([0])
  const blok = tokensSrc.match(/export const radius\s*=\s*\{([^}]*)\}/)
  if (blok?.[1]) for (const m of blok[1].matchAll(/:\s*(\d+(?:\.\d+)?)/g)) radius.add(Number(m[1]))
  // MUI createPalette: light = lighten(main, 0.2), dark = darken(main, 0.3) (tonalOffset 0.2 → ×1.5).
  const basis = new Set(warna)
  for (const w of warna) {
    const c = uraiKunci(w)
    basis.add(kunci3(lighten(c, 0.2)))
    basis.add(kunci3(darken(c, 0.3)))
  }
  return {
    warna: [...warna].sort(),
    radius: [...radius].sort((a, b) => a - b),
    basis: [...basis].sort(),
  }
}

/** Baca token dari <V2_DIR>/Frontend/src/shared/theme/{tokens,palette}.ts; null bila tidak ada. */
export function bacaToken(v2Dir: string): TokenTema | null {
  const dir = path.join(v2Dir, 'Frontend/src/shared/theme')
  const t = path.join(dir, 'tokens.ts')
  if (!existsSync(t)) return null
  const p = path.join(dir, 'palette.ts')
  return uraiToken(readFileSync(t, 'utf8'), existsSync(p) ? readFileSync(p, 'utf8') : '')
}

// ── Evaluasi di halaman ───────────────────────────────────────────────────────
export interface ArgumenDom {
  tokenRgb: string[]
  /** Dasar turunan lighten/darken: token + palette.light/dark MUI (lighten 0.2, darken 0.3). */
  basis?: string[]
  radius: number[]
  nonaktif: string[]
  batasTemuan: number
  batasElemen: number
}

export interface HasilDom {
  temuan: TemuanDom[]
  evalMs: number
  elemen: number
  terpotong: boolean
}

/**
 * Berjalan DI BROWSER (diserialisasi Playwright): tidak boleh merujuk apa pun di luar fungsi ini.
 * Menilai elemen yang terlihat (bbox > 0, di viewport). Elemen runner (#sr-*, .sr-ui-overlay),
 * img/canvas/svg, Highcharts, dan peta dikecualikan.
 */
export function periksaDom(arg: ArgumenDom): HasilDom {
  const t0 = performance.now()
  const token = new Set(arg.tokenRgb)
  const radiusSah = new Set(arg.radius)
  const aktif = (a: string) => !arg.nonaktif.includes(a)
  const vw = window.innerWidth
  const vh = window.innerHeight
  const kunci = new Map<string, TemuanDom>()
  let terpotong = false
  let elemen = 0

  const urai = (s: string): [number, number, number, number] | null => {
    const t = s.trim().toLowerCase()
    if (t === 'transparent') return [0, 0, 0, 0]
    const m = t.match(
      /^rgba?\(\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*[, ]\s*([\d.]+)\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/,
    )
    if (!m) return null
    const a =
      m[4] === undefined ? 1 : m[4].endsWith('%') ? Number(m[4].slice(0, -1)) / 100 : Number(m[4])
    return [Number(m[1]), Number(m[2]), Number(m[3]), a]
  }
  const kunciRgb = (c: [number, number, number, number]) =>
    `rgb(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])})`
  const TOL = 6
  const TOLK = 0.04
  const tokenRgb = (arg.basis ?? arg.tokenRgb).map(
    (k) => (k.match(/\d+/g) ?? []).map(Number) as [number, number, number],
  )
  // Salinan turunanToken (ui-dom.ts): fungsi ini diserialisasi ke browser dan harus mandiri.
  const turunan = (c: [number, number, number], t: [number, number, number]) => {
    if (c.every((v, i) => Math.abs(v - (t[i] ?? 0)) <= TOL)) return true
    const koef = (f: (i: number) => number | null) => {
      const ks = [0, 1, 2].map(f).filter((k): k is number => k !== null)
      if (!ks.length) return false
      const lo = Math.min(...ks)
      const hi = Math.max(...ks)
      return lo >= -0.02 && hi <= 1.02 && hi - lo <= TOLK
    }
    const ti = (i: number) => t[i] ?? 0
    const ci = (i: number) => c[i] ?? 0
    if (
      koef((i) =>
        255 - ti(i) < TOL
          ? Math.abs(ci(i) - ti(i)) <= TOL
            ? null
            : 2
          : (ci(i) - ti(i)) / (255 - ti(i)),
      )
    )
      return true
    return koef((i) => (ti(i) < TOL ? (ci(i) <= TOL ? null : 2) : 1 - ci(i) / ti(i)))
  }
  const sahCache = new Map<string, boolean>()
  const sah = (s: string) => {
    const ada = sahCache.get(s)
    if (ada !== undefined) return ada
    let ok: boolean
    const c = urai(s)
    if (!c || c[3] === 0) ok = true
    else {
      const k = kunciRgb(c)
      if (token.has(k) || (c[3] < 1 && (k === 'rgb(0,0,0)' || k === 'rgb(255,255,255)'))) ok = true
      else {
        const rgb: [number, number, number] = [Math.round(c[0]), Math.round(c[1]), Math.round(c[2])]
        ok = tokenRgb.some((t) => turunan(rgb, t))
      }
    }
    sahCache.set(s, ok)
    return ok
  }
  const dekat = (c: [number, number, number, number], r: number, g: number, b: number, tol = 28) =>
    c[3] > 0.5 &&
    Math.abs(c[0] - r) <= tol &&
    Math.abs(c[1] - g) <= tol &&
    Math.abs(c[2] - b) <= tol
  const luminance = (c: [number, number, number, number]) => {
    const f = (v: number) => {
      const x = v / 255
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
    }
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2])
  }
  const latarEfektif = (el: Element): [number, number, number, number] => {
    let e: Element | null = el
    while (e) {
      const c = urai(getComputedStyle(e).backgroundColor)
      if (c && c[3] > 0.5) return c
      e = e.parentElement
    }
    return [255, 255, 255, 1]
  }
  const dalam = (el: Element, sel: string) => !!el.closest(sel)
  // Elemen fixed/sticky (PageActionBar, AppBar) memang mengambang: bayangannya sah (DESIGN §6).
  const mengambang = (el: Element) => {
    let e: Element | null = el
    for (let i = 0; e && i < 4; i++, e = e.parentElement) {
      const p = getComputedStyle(e).position
      if (p === 'fixed' || p === 'sticky') return true
    }
    return false
  }
  const selektor = (el: Element) => {
    const cls =
      [...el.classList].find((c) => /^Mui[A-Za-z]+-root$/.test(c)) ?? el.classList[0] ?? ''
    const teks = (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 30)
    return `${el.tagName.toLowerCase()}${cls ? `.${cls}` : ''}${teks ? ` “${teks}”` : ''}`
  }
  const catat = (aturan: string, el: Element, r: DOMRect, nilai: string, pesan: string) => {
    const cls =
      [...el.classList].find((c) => /^Mui[A-Za-z]+-root$/.test(c)) ?? el.classList[0] ?? el.tagName
    const k = `${aturan}|${nilai}|${cls}`
    const ada = kunci.get(k)
    if (ada) {
      ada.jumlah++
      return
    }
    if (kunci.size >= arg.batasTemuan) {
      terpotong = true
      return
    }
    kunci.set(k, {
      aturan,
      pesan,
      selector: selektor(el),
      bbox: {
        x: Math.round(r.x),
        y: Math.round(r.y),
        w: Math.round(r.width),
        h: Math.round(r.height),
      },
      nilai,
      jumlah: 1,
    })
  }
  const radiusOk = (v: string, w: number, h: number) => {
    if (v.includes('%')) return v.split(/[\s/]+/).every((p) => !p || p === '50%' || p === '0%')
    const parts = v.split(/[\s/]+/).filter(Boolean)
    const minSisi = Math.min(w, h)
    return parts.every((p) => {
      const n = Number.parseFloat(p)
      if (!Number.isFinite(n)) return true
      if (radiusSah.has(n)) return true
      // Pill/lingkaran: radius ≥ setengah sisi terpendek (9999px, 999px, 50% yang dihitung).
      return n >= 999 || (minSisi > 0 && n >= minSisi / 2 - 0.5)
    })
  }
  const KECUALI =
    '#sr-caption,#sr-cursor,#sr-frame,.sr-ui-overlay,img,canvas,svg,picture,video,iframe,.highcharts-container,.leaflet-container,[data-ilustrasi]'
  const semua = document.body.querySelectorAll('*')
  for (const el of semua) {
    if (elemen >= arg.batasElemen) {
      terpotong = true
      break
    }
    if (el.matches(KECUALI) || dalam(el, KECUALI)) continue
    const r = el.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0 || r.bottom < 0 || r.right < 0 || r.top > vh || r.left > vw)
      continue
    const cs = getComputedStyle(el)
    if (cs.visibility === 'hidden' || cs.opacity === '0' || cs.display === 'none') continue
    elemen++
    const bg = cs.backgroundColor
    const bgC = urai(bg)
    const adaLatar = !!bgC && bgC[3] > 0
    const tepi = ['Top', 'Right', 'Bottom', 'Left'].filter(
      (s) =>
        Number.parseFloat(cs.getPropertyValue(`border-${s.toLowerCase()}-width`)) > 0 &&
        cs.getPropertyValue(`border-${s.toLowerCase()}-style`) !== 'none',
    )
    const adaTepi = tepi.length > 0
    const adaTeks = [...el.childNodes].some((n) => n.nodeType === 3 && (n.textContent ?? '').trim())

    if (aktif('warna-luar-token')) {
      if (adaTeks && !sah(cs.color))
        catat('warna-luar-token', el, r, cs.color, `color ${cs.color} bukan token tema`)
      if (adaLatar && !sah(bg))
        catat('warna-luar-token', el, r, bg, `background-color ${bg} bukan token tema`)
      for (const s of tepi) {
        const c = cs.getPropertyValue(`border-${s.toLowerCase()}-color`)
        if (!sah(c)) {
          catat('warna-luar-token', el, r, c, `border-color ${c} bukan token tema`)
          break
        }
      }
    }
    if (aktif('radius-menyimpang') && (adaLatar || adaTepi)) {
      const br = cs.borderRadius
      if (br && br !== '0px' && !radiusOk(br, r.width, r.height))
        catat(
          'radius-menyimpang',
          el,
          r,
          br,
          `border-radius ${br} bukan ${arg.radius.join('/')} px, 50%, atau pill`,
        )
    }
    if (
      aktif('bayangan-kartu') &&
      (el.classList.contains('MuiCard-root') || el.classList.contains('MuiPaper-root')) &&
      cs.boxShadow !== 'none' &&
      !dalam(
        el,
        '.MuiDialog-root,.MuiPopover-root,.MuiMenu-root,.MuiDrawer-root,.MuiSnackbar-root,.MuiTooltip-popper,.MuiAutocomplete-popper,[role=tooltip]',
      ) &&
      !el.classList.contains('Mui-selected') &&
      !mengambang(el) &&
      !dalam(el, '[role=tab][aria-selected=true]')
    )
      catat(
        'bayangan-kartu',
        el,
        r,
        cs.boxShadow.slice(0, 60),
        'box-shadow pada Card/Paper yang bukan overlay (kartu harus datar)',
      )
    if (aktif('font-bukan-inter') && adaTeks) {
      const ff = cs.fontFamily.replace(/["']/g, '').trim()
      if (
        !/^(inter|roboto|helvetica|arial|monospace|ui-monospace|menlo|jetbrains mono|sf mono|consolas)/i.test(
          ff,
        ) &&
        !/mono|icon/i.test(ff)
      )
        catat(
          'font-bukan-inter',
          el,
          r,
          ff.slice(0, 60),
          `font-family "${ff.slice(0, 40)}" bukan Inter/Roboto/Helvetica/Arial/monospace`,
        )
    }
    if (aktif('kontras-kuning')) {
      const col = urai(cs.color)
      if (adaTeks && col && dekat(col, 255, 219, 14)) {
        const bgE = latarEfektif(el)
        if (luminance(bgE) > 0.5)
          catat(
            'kontras-kuning',
            el,
            r,
            `${cs.color} di atas ${kunciRgb(bgE)}`,
            'teks kuning merek di atas latar terang (kuning hanya untuk permukaan terisi)',
          )
      }
      if (
        adaTeks &&
        adaLatar &&
        bgC &&
        dekat(bgC, 255, 219, 14) &&
        col &&
        col[0] >= 240 &&
        col[1] >= 240 &&
        col[2] >= 240 &&
        col[3] > 0.5
      )
        catat(
          'kontras-kuning',
          el,
          r,
          `${cs.color} di atas ${bg}`,
          'teks putih di atas kuning merek (harus ink)',
        )
    }
  }
  return {
    temuan: [...kunci.values()],
    evalMs: Math.round(performance.now() - t0),
    elemen,
    terpotong,
  }
}

/** Jalankan periksaDom di halaman. */
export async function periksaDomHalaman(
  page: Page,
  token: TokenTema,
  nonaktif: readonly string[],
): Promise<HasilDom> {
  return page.evaluate(periksaDom, {
    tokenRgb: token.warna,
    basis: token.basis,
    radius: token.radius,
    nonaktif: [...nonaktif],
    batasTemuan: BATAS_TEMUAN,
    batasElemen: BATAS_ELEMEN,
  })
}

export const KELAS_OVERLAY = 'sr-ui-overlay'

/** Suntik kotak merah + label aturan di tiap bbox (pointer-events none), ambil screenshot, lalu hapus. */
export async function screenshotBersorot(
  page: Page,
  temuan: readonly TemuanDom[],
  file: string,
  { timeout = 10_000 } = {},
): Promise<boolean> {
  await page.evaluate(
    ({ items, kelas }) => {
      for (const el of document.querySelectorAll(`.${kelas}`)) el.remove()
      for (const t of items) {
        const d = document.createElement('div')
        d.className = kelas
        Object.assign(d.style, {
          position: 'fixed',
          left: `${t.bbox.x - 1}px`,
          top: `${t.bbox.y - 1}px`,
          width: `${t.bbox.w + 2}px`,
          height: `${t.bbox.h + 2}px`,
          border: '2px solid #E5484D',
          borderRadius: '3px',
          boxSizing: 'border-box',
          zIndex: '2147483645',
          pointerEvents: 'none',
        })
        const l = document.createElement('span')
        l.textContent = t.aturan
        Object.assign(l.style, {
          position: 'absolute',
          left: '-2px',
          top: t.bbox.y > 16 ? '-15px' : `${t.bbox.h}px`,
          background: '#E5484D',
          color: '#fff',
          font: '600 10px/13px Inter, Arial, sans-serif',
          padding: '0 4px',
          borderRadius: '2px',
          whiteSpace: 'nowrap',
          pointerEvents: 'none',
        })
        d.appendChild(l)
        document.body.appendChild(d)
      }
    },
    { items: temuan, kelas: KELAS_OVERLAY },
  )
  let ok = true
  try {
    await page.screenshot({ path: file, fullPage: false, timeout })
  } catch {
    ok = false
  } finally {
    await hapusSorot(page)
  }
  return ok
}

export async function hapusSorot(page: Page) {
  await page
    .evaluate((kelas) => {
      for (const el of document.querySelectorAll(`.${kelas}`)) el.remove()
    }, KELAS_OVERLAY)
    .catch(() => {})
}

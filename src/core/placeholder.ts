// Placeholder {kunci} dan {kunci.sub.0} pada nilai skenario JSON, diisi dari data jalan.
// Kunci diawali huruf atau garis bawah, jadi kuantifier regex seperti \d{6} tidak terbaca placeholder.

const PLACEHOLDER = /\{([a-zA-Z_][\w]*(?:\.[\w]+)*)\}/g
const UTUH = /^\{([a-zA-Z_][\w]*(?:\.[\w]+)*)\}$/

export class DataBelumAda extends Error {}

function ambil(data: Record<string, unknown>, jalur: string): unknown {
  let cur: unknown = data
  for (const bagian of jalur.split('.')) {
    if (cur === null || cur === undefined || typeof cur !== 'object') return undefined
    cur = (cur as Record<string, unknown>)[bagian]
  }
  return cur
}

/** Isi semua placeholder secara rekursif. String yang hanya berisi satu placeholder
 * menghasilkan nilai aslinya (objek, array, angka); selain itu diinterpolasi sebagai teks. */
export function isiPlaceholder<T>(nilai: T, data: Record<string, unknown>): T {
  if (typeof nilai === 'string') {
    const utuh = nilai.match(UTUH)
    if (utuh?.[1]) {
      const v = ambil(data, utuh[1])
      if (v === undefined) throw new DataBelumAda(`Data {${utuh[1]}} belum ada`)
      return v as T
    }
    return nilai.replace(PLACEHOLDER, (_, jalur: string) => {
      const v = ambil(data, jalur)
      if (v === undefined) throw new DataBelumAda(`Data {${jalur}} belum ada`)
      return typeof v === 'object' ? JSON.stringify(v) : String(v)
    }) as T
  }
  if (Array.isArray(nilai)) return nilai.map((x) => isiPlaceholder(x, data)) as T
  if (nilai && typeof nilai === 'object')
    return Object.fromEntries(
      Object.entries(nilai).map(([k, v]) => [k, isiPlaceholder(v, data)]),
    ) as T
  return nilai
}

/** Seperti isiPlaceholder, tapi placeholder yang belum ada dibiarkan (untuk tampilan). */
export function isiSebisanya(teks: string, data: Record<string, unknown>): string {
  return teks.replace(PLACEHOLDER, (asli, jalur: string) => {
    const v = ambil(data, jalur)
    return v === undefined ? asli : typeof v === 'object' ? JSON.stringify(v) : String(v)
  })
}

/** Akar kunci yang dirujuk sebuah nilai (mis. {mr.id} → "mr"). */
export function rujukan(nilai: unknown): string[] {
  const out = new Set<string>()
  const jelajah = (v: unknown) => {
    if (typeof v === 'string')
      for (const m of v.matchAll(PLACEHOLDER)) out.add(m[1]?.split('.')[0] ?? '')
    else if (Array.isArray(v)) v.forEach(jelajah)
    else if (v && typeof v === 'object') Object.values(v).forEach(jelajah)
  }
  jelajah(nilai)
  out.delete('')
  return [...out]
}

/** "/pola/flags" → RegExp; selain itu teks apa adanya. */
export function pola(teks: string): string | RegExp {
  const m = teks.match(/^\/(.+)\/([dgimsuy]*)$/s)
  return m?.[1] ? new RegExp(m[1], m[2]) : teks
}

/** Selalu RegExp (teks biasa di-escape). */
export function polaRegex(teks: string): RegExp {
  const p = pola(teks)
  return p instanceof RegExp ? p : new RegExp(p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
}

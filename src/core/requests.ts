// Pencatat request tulis per langkah: dari jendela skenario (page.on('response')) dan dari klien
// API aksi pustaka (hook di lib.apiSend). Dipakai Pemeriksaan DB untuk menunjuk "transaksi
// tersangka" pada pelanggaran baru. Bagian murni (anonimisasi, filter) diuji Vitest.
import type { Page, Request } from 'playwright'
import type { RequestTulis } from './run-types.ts'

export const METODE_TULIS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
const AWALAN_API = '/api/v1'
/** Request yang bukan transaksi dokumen: sesi dan impersonasi runner. */
const ABAIKAN = [/^\/auth\//, /\/impersonate$/]

/** Path API tanpa origin dan tanpa awalan /api/v1; null bila bukan request API v1. */
export function pathApi(url: string): string | null {
  let p: string
  try {
    p = new URL(url, 'http://localhost').pathname
  } catch {
    return null
  }
  if (!p.startsWith(`${AWALAN_API}/`)) return null
  return p.slice(AWALAN_API.length)
}

/** UUID → `{id}` untuk tampilan. */
export const anonimPath = (p: string) => p.replaceAll(UUID, '{id}')

export const requestDiabaikan = (p: string) => ABAIKAN.some((r) => r.test(p))

/** Bentuk catatan dari komponen mentah; null bila bukan request tulis API yang dicatat. */
export function catatanRequest(x: {
  method: string
  url: string
  status: number
  durasiMs: number | null
  sumber: RequestTulis['sumber']
  waktu?: Date
}): RequestTulis | null {
  const method = x.method.toUpperCase()
  if (!METODE_TULIS.has(method)) return null
  const p = pathApi(x.url)
  if (!p || requestDiabaikan(p)) return null
  return {
    method,
    path: anonimPath(p),
    pathAsli: p,
    status: x.status,
    durasiMs: x.durasiMs,
    waktu: (x.waktu ?? new Date()).toISOString(),
    sumber: x.sumber,
  }
}

/** Urutkan terbaru dulu (yang terakhir sebelum snapshot paling atas). */
export const terbaruDulu = (xs: readonly RequestTulis[]) =>
  [...xs].sort((a, b) => (a.waktu < b.waktu ? 1 : a.waktu > b.waktu ? -1 : 0))

export const teksRequest = (r: RequestTulis) =>
  `${r.method} ${r.path} → ${r.status}${r.durasiMs != null ? ` (${r.durasiMs} ms)` : ''}${r.sumber === 'api' ? ' · API' : ''}`

/** Pendengar klien API (lib.apiSend) → catatan; dipasang Run selama jalan. */
export type PendengarApi = (x: {
  method: string
  url: string
  status: number
  durasiMs: number
}) => void

/**
 * Pencatat untuk satu jalan: `aktif(n)` memilih langkah tujuan (null = tidak mencatat, mis. saat
 * siapkan/bersihkan). `dariBrowser` dipasang ke page.on('response'); `dariApi` ke lib.
 */
export class PencatatRequest {
  private langkah: number | null = null
  /** Request tulis API dari jendela yang belum selesai (belum ada respons/gagal). */
  private readonly tertunda = new Set<Request>()
  private readonly simpan: (n: number, r: RequestTulis) => void

  constructor(simpan: (n: number, r: RequestTulis) => void) {
    this.simpan = simpan
  }

  aktif(n: number | null) {
    this.langkah = n
  }

  private catat(r: RequestTulis | null) {
    if (r && this.langkah !== null) this.simpan(this.langkah, r)
  }

  pasangBrowser(page: Page) {
    const tulisApi = (req: Request) =>
      METODE_TULIS.has(req.method().toUpperCase()) && pathApi(req.url()) !== null
    page.on('request', (req) => {
      if (tulisApi(req)) this.tertunda.add(req)
    })
    const lepas = (req: Request) => {
      this.tertunda.delete(req)
    }
    page.on('requestfinished', lepas)
    page.on('requestfailed', lepas)
    page.on('response', (res) => {
      const req = res.request()
      let durasiMs: number | null = null
      try {
        const t = req.timing()
        durasiMs = t.responseEnd >= 0 ? Math.round(t.responseEnd) : null
      } catch {
        durasiMs = null
      }
      this.catat(
        catatanRequest({
          method: req.method(),
          url: res.url(),
          status: res.status(),
          durasiMs,
          sumber: 'browser',
        }),
      )
    })
  }

  /** Jumlah request tulis dari jendela yang masih berjalan. */
  get sisaTulis() {
    return this.tertunda.size
  }

  /**
   * Tunggu request tulis dari jendela selesai (maks. `batasMs`), supaya request yang dikirim di ujung
   * langkah tercatat di langkah itu dan perubahan datanya masuk snapshot langkah itu. Kembalikan jumlah
   * yang masih berjalan saat batas habis (0 = semua selesai).
   */
  async tungguTulis(batasMs = 10_000): Promise<number> {
    const akhir = Date.now() + batasMs
    while (this.tertunda.size && Date.now() < akhir) await new Promise((r) => setTimeout(r, 50))
    // Respons sudah tiba; beri event 'response' kesempatan mencatat.
    await new Promise((r) => setTimeout(r, 0))
    return this.tertunda.size
  }

  readonly dariApi: PendengarApi = (x) => {
    this.catat(catatanRequest({ ...x, sumber: 'api' }))
  }
}

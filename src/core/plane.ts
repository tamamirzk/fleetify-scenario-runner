// Sumber "Tugas saya": isu Plane yang di-assign ke pemilik API key, lewat REST API Plane
// (header X-API-Key). Hanya baca. Hasil disimpan sementara supaya panel tidak memukul Plane tiap render.
import { config } from './config.ts'

export interface Tugas {
  /** Kunci tiket, mis. FMS-87 (sama dengan field `tiket` skenario). */
  key: string
  judul: string
  /** Nama status Plane, mis. "Ready in Staging and for Testing". */
  status: string
  statusId: string
  /** Grup status Plane: backlog | unstarted | started | completed | cancelled | triage. */
  grup: string
  prioritas: string
  label: { nama: string; warna: string }[]
  tenggat: string | null
  diubah: string | null
  url: string
  /** Done (atau status di PLANE_STATUS_SELESAI) dan grup cancelled; panel menyembunyikannya bawaan. */
  selesai: boolean
}

/** Status project Plane, urut seperti kolom papan Plane. */
export interface StatusPlane {
  id: string
  nama: string
  grup: string
  warna: string
  selesai: boolean
}

type Isu = Record<string, unknown>
/** Urutan grup seperti papan Plane. */
export const URUT_GRUP = ['triage', 'backlog', 'unstarted', 'started', 'completed', 'cancelled']
const URUT_PRIORITAS = ['urgent', 'high', 'medium', 'low', 'none']
const pos = (arr: string[], v: string) => (arr.includes(v) ? arr.indexOf(v) : arr.length)

const apaSelesai = (grup: string, nama: string, selesai: Set<string>) =>
  grup === 'cancelled' || selesai.has(nama.toLowerCase())

/** Status project → urutan papan Plane: grup, lalu `sequence`. */
export function urutStatus(states: Isu[], selesaiNama: string[] = ['Done']): StatusPlane[] {
  const selesai = new Set(selesaiNama.map((x) => x.toLowerCase()))
  return [...states]
    .sort(
      (a, b) =>
        pos(URUT_GRUP, String(a.group)) - pos(URUT_GRUP, String(b.group)) ||
        Number(a.sequence ?? 0) - Number(b.sequence ?? 0),
    )
    .map((st) => ({
      id: String(st.id),
      nama: String(st.name),
      grup: String(st.group),
      warna: String(st.color ?? ''),
      selesai: apaSelesai(String(st.group), String(st.name), selesai),
    }))
}

/**
 * Isu Plane → semua Tugas milik `meId` (termasuk yang selesai, ditandai `selesai`), urut: grup
 * status, prioritas, nomor. Label dipetakan dari `labels` (id → nama + warna).
 */
export function petakanTugas(
  isu: Isu[],
  o: {
    meId: string
    identifier: string
    urlTiket: (key: string) => string
    selesai?: string[]
    labels?: Isu[]
  },
): Tugas[] {
  const selesai = new Set((o.selesai ?? ['Done']).map((x) => x.toLowerCase()))
  const label = new Map((o.labels ?? []).map((l) => [String(l.id), l]))
  const idDari = (x: unknown) =>
    typeof x === 'string' ? x : ((x as { id?: string } | null)?.id ?? '')
  const out: Tugas[] = []
  for (const i of isu) {
    const assignees = Array.isArray(i.assignees) ? i.assignees.map(idDari) : []
    if (!assignees.includes(o.meId)) continue
    const st = (typeof i.state === 'object' && i.state ? i.state : {}) as Record<string, unknown>
    const grup = String(st.group ?? i.state__group ?? 'unstarted')
    const nama = String(st.name ?? grup)
    const key = `${o.identifier}-${String(i.sequence_id)}`
    out.push({
      key,
      judul: String(i.name ?? ''),
      status: nama,
      statusId: String(st.id ?? idDari(i.state)),
      grup,
      prioritas: String(i.priority ?? 'none'),
      label: (Array.isArray(i.labels) ? i.labels.map(idDari) : [])
        .map((id) => label.get(id))
        .filter((l): l is Isu => !!l)
        .map((l) => ({ nama: String(l.name), warna: String(l.color ?? '') })),
      tenggat: (i.target_date as string | null) ?? null,
      diubah: (i.updated_at as string | null) ?? null,
      url: o.urlTiket(key),
      selesai: apaSelesai(grup, nama, selesai),
    })
  }
  const nomor = (k: string) => Number(k.split('-').pop())
  return out.sort(
    (a, b) =>
      pos(URUT_GRUP, a.grup) - pos(URUT_GRUP, b.grup) ||
      pos(URUT_PRIORITAS, a.prioritas) - pos(URUT_PRIORITAS, b.prioritas) ||
      nomor(a.key) - nomor(b.key),
  )
}

export const planeDikonfigurasi = () =>
  !!(config.plane.apiKey && config.plane.url && config.plane.workspace)

async function ambil(
  jalur: string,
  kirim?: { metode: 'POST' | 'PATCH'; data: unknown },
): Promise<{ status: number; body: unknown }> {
  const res = await fetch(`${config.plane.url}/api/v1${jalur}`, {
    method: kirim?.metode ?? 'GET',
    headers: {
      'X-API-Key': config.plane.apiKey ?? '',
      Accept: 'application/json',
      ...(kirim ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(kirim ? { body: JSON.stringify(kirim.data) } : {}),
  })
  const teks = await res.text()
  let body: unknown = teks
  try {
    body = JSON.parse(teks)
  } catch {}
  return { status: res.status, body }
}

async function wajib(jalur: string, label: string): Promise<Record<string, unknown>> {
  const r = await ambil(jalur)
  if (r.status === 401 || r.status === 403)
    throw new Error(
      `Plane menolak API key (${r.status}) saat ${label}; periksa PLANE_API_KEY di .env`,
    )
  if (r.status >= 400) throw new Error(`Plane ${r.status} saat ${label}`)
  return r.body as Record<string, unknown>
}

const daftar = (b: Record<string, unknown>) =>
  (Array.isArray(b) ? b : Array.isArray(b.results) ? b.results : []) as Isu[]

/** Semua isu project (berhalaman kursor), lewat /issues/ atau /work-items/ (Plane versi baru). */
async function semuaIsu(ws: string, pid: string): Promise<Isu[]> {
  for (const jenis of ['issues', 'work-items']) {
    const out: Isu[] = []
    let kursor = ''
    for (let hal = 0; hal < 30; hal++) {
      const q = `?per_page=100&expand=state${kursor ? `&cursor=${encodeURIComponent(kursor)}` : ''}`
      const r = await ambil(`/workspaces/${ws}/projects/${pid}/${jenis}/${q}`)
      if (r.status === 404 && hal === 0) break
      if (r.status >= 400) throw new Error(`Plane ${r.status} saat membaca isu`)
      const b = r.body as Record<string, unknown>
      out.push(...daftar(b))
      if (!b.next_page_results || !b.next_cursor) return out
      kursor = String(b.next_cursor)
    }
    if (out.length) return out
  }
  return []
}

/**
 * Satu isu berdasarkan kunci (mis. FMS-87) lewat /issues/<KEY>/ atau /work-items/<KEY>/ —
 * satu permintaan (±0,2 dtk), bukan mengunduh semua isu project. null bila tidak ditemukan
 * di kedua jalur (isu tidak ada, atau Plane belum mendukung jalur ini).
 */
async function isuSatu(ws: string, key: string): Promise<Isu | null> {
  for (const jenis of ['issues', 'work-items']) {
    const r = await ambil(`/workspaces/${ws}/${jenis}/${key}/?expand=state`)
    if (r.status === 404) continue
    if (r.status >= 400) throw new Error(`Plane ${r.status} saat membaca ${key}`)
    return r.body as Isu
  }
  return null
}

let cache: {
  at: number
  data: { saya: string; project: string; status: StatusPlane[]; tugas: Tugas[] }
} | null = null
const UMUR_CACHE = 60_000
/** Kapan daftar Tugas saya terakhir diambil dari Plane (ISO), atau null bila belum pernah. */
export const waktuTugasSaya = () => (cache ? new Date(cache.at).toISOString() : null)
/** Daftar Tugas saya terakhir yang tersimpan, berapa pun umurnya (null bila belum pernah). */
export const tugasSayaTersimpan = () => cache?.data ?? null

/** Tugas saya dari Plane. `segarkan` melewati cache. */
export async function tugasSaya(segarkan = false) {
  if (!planeDikonfigurasi()) throw new Error('Plane belum dikonfigurasi (PLANE_API_KEY di .env)')
  if (!segarkan && cache && Date.now() - cache.at < UMUR_CACHE)
    return { ...cache.data, cache: true }
  const { workspace: ws, project: identifier } = config.plane
  const me = await wajib('/users/me/', 'membaca akun')
  const projects = daftar(await wajib(`/workspaces/${ws}/projects/`, 'membaca project'))
  const proj = projects.find((p) => String(p.identifier) === identifier)
  if (!proj) throw new Error(`Project ${identifier} tidak ada di workspace ${ws}`)
  const pid = String(proj.id)
  const [isu, states, labels] = await Promise.all([
    semuaIsu(ws, pid),
    wajib(`/workspaces/${ws}/projects/${pid}/states/`, 'membaca status').then(daftar),
    // Label opsional: tanpa izin membaca label, kartu tetap tampil tanpa label.
    ambil(`/workspaces/${ws}/projects/${pid}/labels/`).then((r) =>
      r.status < 400 ? daftar(r.body as Record<string, unknown>) : [],
    ),
  ])
  const base = config.ticketUrl
  const tugas = petakanTugas(isu, {
    meId: String(me.id),
    identifier,
    urlTiket: (key) => (base ? `${base}${key}` : `${config.plane.url}/${ws}/browse/${key}/`),
    selesai: config.plane.statusSelesai,
    labels,
  })
  const data = {
    saya: String(me.display_name ?? me.first_name ?? me.email ?? ''),
    project: String(proj.name ?? identifier),
    status: urutStatus(states, config.plane.statusSelesai),
    tugas,
  }
  cache = { at: Date.now(), data }
  return { ...data, cache: false }
}

// ── Satu tiket: ambil, komentar, pindah status (tahap Kerja) ─────────────────────────────

type ProjectPlane = { ws: string; id: string; nama: string; identifier: string }
/** Daftar project hampir tak berubah: disimpan 10 menit per (url, workspace, project). */
let cacheProject: { kunci: string; at: number; p: ProjectPlane } | null = null
const UMUR_PROJECT = 10 * 60_000

/** Project Plane (id + identifier) sesuai PLANE_PROJECT. */
async function projectPlane(): Promise<ProjectPlane> {
  if (!planeDikonfigurasi()) throw new Error('Plane belum dikonfigurasi (PLANE_API_KEY di .env)')
  const { workspace: ws, project: identifier } = config.plane
  const kunci = `${config.plane.url}|${ws}|${identifier}`
  if (cacheProject?.kunci === kunci && Date.now() - cacheProject.at < UMUR_PROJECT)
    return cacheProject.p
  const projects = daftar(await wajib(`/workspaces/${ws}/projects/`, 'membaca project'))
  const proj = projects.find((p) => String(p.identifier) === identifier)
  if (!proj) throw new Error(`Project ${identifier} tidak ada di workspace ${ws}`)
  const p = { ws, id: String(proj.id), nama: String(proj.name ?? identifier), identifier }
  cacheProject = { kunci, at: Date.now(), p }
  return p
}

export interface TiketPlane {
  key: string
  /** id isu di Plane (untuk komentar/pindah status). */
  id: string
  projectId: string
  judul: string
  deskripsiHtml: string
  status: string
  prioritas: string
  url: string
}

/** Satu tiket lengkap (dengan deskripsi) berdasarkan kunci, mis. "FMS-87". */
export async function ambilTiket(key: string): Promise<TiketPlane> {
  const m = key.match(/^([A-Z]+)-(\d+)$/)
  if (!m) throw new Error(`Kunci tiket tidak sah: ${key} (format FMS-87)`)
  const p = await projectPlane()
  if (m[1] !== p.identifier)
    throw new Error(`Tiket ${key} bukan project ${p.identifier} (PLANE_PROJECT)`)
  // Satu permintaan lebih dulu; cadangan ke daftar semua isu bila jalur per-kunci tak ada.
  const satu = await isuSatu(p.ws, key)
  const isu =
    satu && String(satu.sequence_id) === m[2]
      ? satu
      : (await semuaIsu(p.ws, p.id)).find((i) => String(i.sequence_id) === m[2])
  if (!isu) throw new Error(`Tiket ${key} tidak ada di Plane`)
  const st = (typeof isu.state === 'object' && isu.state ? isu.state : {}) as Record<
    string,
    unknown
  >
  const base = config.ticketUrl
  return {
    key,
    id: String(isu.id),
    projectId: p.id,
    judul: String(isu.name ?? ''),
    deskripsiHtml: String(isu.description_html ?? ''),
    status: String(st.name ?? ''),
    prioritas: String(isu.priority ?? 'none'),
    url: base ? `${base}${key}` : `${config.plane.url}/${p.ws}/browse/${key}/`,
  }
}

/** Kirim komentar HTML ke tiket. Terlihat oleh tim: panggil hanya setelah dikonfirmasi pengguna. */
export async function komentarTiket(t: { id: string; projectId: string }, html: string) {
  const ws = config.plane.workspace
  for (const jenis of ['issues', 'work-items']) {
    const r = await ambil(`/workspaces/${ws}/projects/${t.projectId}/${jenis}/${t.id}/comments/`, {
      metode: 'POST',
      data: { comment_html: html },
    })
    if (r.status === 404) continue
    if (r.status >= 400) throw new Error(`Plane ${r.status} saat mengirim komentar`)
    cache = null
    return
  }
  throw new Error('Plane 404 saat mengirim komentar')
}

/** Pindahkan tiket ke status bernama `nama`. Terlihat oleh tim: panggil hanya setelah dikonfirmasi. */
export async function pindahStatusTiket(t: { id: string; projectId: string }, nama: string) {
  const ws = config.plane.workspace
  const states = daftar(
    await wajib(`/workspaces/${ws}/projects/${t.projectId}/states/`, 'membaca status'),
  )
  const st = states.find((x) => String(x.name).toLowerCase() === nama.toLowerCase())
  if (!st)
    throw new Error(
      `Status "${nama}" tidak ada; pilih: ${states.map((x) => String(x.name)).join(', ')}`,
    )
  for (const jenis of ['issues', 'work-items']) {
    const r = await ambil(`/workspaces/${ws}/projects/${t.projectId}/${jenis}/${t.id}/`, {
      metode: 'PATCH',
      data: { state: st.id },
    })
    if (r.status === 404) continue
    if (r.status >= 400) throw new Error(`Plane ${r.status} saat memindah status`)
    cache = null
    return String(st.name)
  }
  throw new Error('Plane 404 saat memindah status')
}

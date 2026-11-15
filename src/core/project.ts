// Project › Modul. Satu project "Fleetify v2" sekarang;
// strukturnya siap untuk lebih dari satu. Modul = folder scenarios/<modul>/ (sama dengan field `modul`
// skenario) — nama tampilan dan urutan di sini; folder yang belum terdaftar tetap muncul di belakang
// dengan nama dari folder. Sumber tugas Plane/Jira belum ada (tiket hanya teks + tautan TICKET_URL).

export interface Modul {
  id: string
  nama: string
  urutan: number
}

export interface Project {
  id: string
  nama: string
  modul: Modul[]
}

export const PROJECTS: Project[] = [
  {
    id: 'fleetify-v2',
    nama: 'Fleetify v2',
    modul: [
      { id: 'wo', nama: 'Work Order', urutan: 1 },
      { id: 'material', nama: 'Material & Gudang', urutan: 2 },
      { id: 'approval', nama: 'Approval', urutan: 3 },
      { id: 'pb', nama: 'Perawatan Berkala', urutan: 4 },
      { id: 'akses', nama: 'Hak Akses', urutan: 5 },
      { id: 'lingkungan', nama: 'Lingkungan', urutan: 6 },
    ],
  },
]

const judulFolder = (f: string) =>
  f.replaceAll(/[-_]+/g, ' ').replace(/^\p{L}/u, (c) => c.toUpperCase())

/** Modul project yang punya folder (dengan jumlah berkas), urut; folder tak terdaftar di belakang. */
export function modulProject(
  p: Project,
  jumlah: ReadonlyMap<string, number>,
): (Modul & { jumlah: number })[] {
  const out = p.modul
    .filter((m) => jumlah.has(m.id))
    .map((m) => ({ ...m, jumlah: jumlah.get(m.id) ?? 0 }))
  let urut = Math.max(0, ...p.modul.map((m) => m.urutan))
  for (const [id, n] of [...jumlah].sort(([a], [b]) => a.localeCompare(b)))
    if (!p.modul.some((m) => m.id === id))
      out.push({ id, nama: judulFolder(id), urutan: ++urut, jumlah: n })
  return out.sort((a, b) => a.urutan - b.urutan)
}

export type StatusSkenario = 'draf' | 'siap' | 'perlu_diperbarui' | 'ada_kegagalan'

/**
 * Status skenario: `ada_kegagalan` dihitung dari jalan terakhir yang gagal; `perlu_diperbarui` butuh
 * waktu ubah tiket sumber (sinkron Plane/Jira) sehingga belum pernah dihitung; selain itu status
 * tertulis di berkas (`draf`/`siap`, bawaan `siap`).
 */
export function statusSkenario(
  tertulis: 'draf' | 'siap' | undefined,
  jalanTerakhir: { status: string } | null,
): StatusSkenario {
  if (jalanTerakhir?.status === 'gagal') return 'ada_kegagalan'
  return tertulis ?? 'siap'
}

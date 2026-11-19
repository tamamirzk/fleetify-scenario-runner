// Kerja lokal tanpa tiket Plane (bug/permintaan dari chat): BUG-n untuk perbaikan, REQ-n untuk
// permintaan fitur. Dulu dibuat dengan menyalin kerja.json lain, sehingga ada kolom yang tertinggal
// (target null merusak `kerja lihat`) dan slot tak tercatat (panel menyebut slot "kosong" padahal
// dipakai). Di sini catatannya dibuat lengkap dan langsung ditempatkan di slot chat.
import { existsSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { antreanSlot } from './antrean.ts'
import { bacaKerja, daftarKerja, dirKerja, KERJA_DIR, type Kerja, simpanKerja } from './kerja.ts'
import { antrekanKerja, pemakaiSlot, tempatkanDiSlot } from './kerja-aksi.ts'
import { SLOT_CHAT } from './slot.ts'

export const AWALAN_LOKAL = ['BUG', 'REQ'] as const
export type AwalanLokal = (typeof AWALAN_LOKAL)[number]

/** Nomor berikutnya untuk awalan: BUG-1, BUG-2, … (melihat folder kerja yang sudah ada). */
export function kunciLokalBerikut(awalan: AwalanLokal, ada: readonly string[]): string {
  const pola = new RegExp(`^${awalan}-(\\d+)$`)
  const nomor = ada.map((d) => Number(pola.exec(d)?.[1] ?? 0))
  return `${awalan}-${Math.max(0, ...nomor) + 1}`
}

/** Catatan kerja lengkap untuk kerja lokal; tanpa efek samping (bisa dites). */
export function kerjaLokal(key: string, judul: string, sumber: string, kini: string): Kerja {
  return {
    key,
    judul,
    url: '',
    plane: { id: '', projectId: '', status: 'Tanpa Plane' },
    tahap: 'diambil',
    diambil_at: kini,
    diperbarui_at: kini,
    riwayat: [{ at: kini, tahap: 'diambil', catatan: `Kerja lokal tanpa tiket Plane: ${sumber}` }],
    verifikasi: [],
    branch: null,
    commit: [],
    target: { layar: [], db: [] },
    potret: {},
    skenario: [],
    keputusan: [],
    pertanyaan: [],
    mintaUbah: [],
    cekStaging: [],
    // Format 2: laporan lima kartu, tanpa catatan.md. Masalah awal = judul/sumber (AI memperjelas).
    format: 2,
    masalah: { ringkas: judul, diubah_at: kini },
    temuan: [],
    dilakukan: [],
  } as Kerja
}

/**
 * Buat kerja lokal lalu tempatkan di slot chat (branch baru dari development, DB slot chat
 * dipertahankan); bila slot chat terisi, masuk antreannya. `tempat: false` hanya membuat catatannya.
 */
export function buatKerjaLokal(
  awalan: AwalanLokal,
  judul: string,
  o: { sumber?: string; tempat?: boolean } = {},
): { kerja: Kerja; langkah: string[] } {
  const ada = existsSync(KERJA_DIR) ? readdirSync(KERJA_DIR) : []
  const key = kunciLokalBerikut(awalan, ada)
  const sumber = o.sumber ?? `chat ${new Date().toISOString().slice(0, 10)}`
  simpanKerja(kerjaLokal(key, judul, sumber, new Date().toISOString()))
  writeFileSync(
    path.join(dirKerja(key), 'tiket.md'),
    `# ${key} · ${judul}\n\nTanpa tiket Plane. Sumber: ${sumber}.\n`,
  )
  if (o.tempat === false) return { kerja: bacaKerja(key), langkah: [] }
  // Slot chat terisi: masuk antrean slot chat (bukan gagal); naik otomatis setelah pemakainya di-push.
  const pemakai = pemakaiSlot().get(SLOT_CHAT) ?? []
  if (pemakai.length) {
    const k = antrekanKerja(key, { slot: SLOT_CHAT })
    const urutan = antreanSlot(daftarKerja(), SLOT_CHAT).findIndex((x) => x.key === key) + 1
    return {
      kerja: k,
      langkah: [
        `slot ${SLOT_CHAT} (chat) dipakai ${pemakai.map((p) => p.key).join(', ')}: ${key} masuk antrean slot ${SLOT_CHAT} (urutan ${urutan}); naik otomatis setelah slot dilepas`,
      ],
    }
  }
  return tempatkanDiSlot(key, SLOT_CHAT)
}

// Pintasan keyboard runner sebagai fungsi murni: peristiwa tombol + keadaan → nama aksi.
// Tidak aktif saat mengetik (kecuali simpan temuan dan Esc di dalam isian). Hentikan TIDAK punya
// pintasan: selalu butuh klik, supaya tidak terpencet tanpa sengaja.

/** Isian tempat mengetik: input/textarea/select atau contenteditable. */
export const sedangMengetik = (t) =>
  !!t && (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tag) || t.editable === true)

/**
 * @param e { key, ctrl, meta, alt, shift, target: { tag, editable, id } }
 * @param k { halaman: 'jalan'|..., peta: boolean, fokus: boolean, sidebar?: boolean }
 * @returns 'jeda-lanjut' | 'satu-aksi' | 'fokus-temuan' | 'simpan-temuan' | 'fokus-layar' | 'peta'
 *   | 'tutup-peta' | 'keluar-fokus' | 'lepas-isian' | 'sidebar' | null
 */
export function aksiPintasan(e, k) {
  const t = e.target ?? {}
  if (sedangMengetik(t)) {
    if (t.id === 'temuan' && e.key === 'Enter' && (e.ctrl || e.meta)) return 'simpan-temuan'
    if (e.key === 'Escape') return 'lepas-isian'
    return null
  }
  // Ciut/buka sidebar di halaman bersidebar (bukan runner/laporan, jadi tidak bentrok dengan pintasan runner).
  if (k.sidebar && e.key === '\\' && !e.ctrl && !e.meta && !e.alt) return 'sidebar'
  if (k.halaman !== 'jalan') return null
  if (e.ctrl || e.meta || e.alt) return null
  // Spasi di tombol/tautan biarkan menekan tombol itu (aktivasi bawaan browser).
  if (e.key === ' ') return t.tag === 'BUTTON' || t.tag === 'A' ? null : 'jeda-lanjut'
  if (e.key === 'ArrowRight') return 'satu-aksi'
  if (e.key === 't' || e.key === 'T') return 'fokus-temuan'
  if (e.key === 'f' || e.key === 'F') return 'fokus-layar'
  if (e.key === '[') return 'peta'
  if (e.key === 'Escape') return k.peta ? 'tutup-peta' : k.fokus ? 'keluar-fokus' : null
  return null
}

/** Bentuk peristiwa DOM → masukan aksiPintasan. */
export const dariEvent = (ev) => ({
  key: ev.key,
  ctrl: ev.ctrlKey,
  meta: ev.metaKey,
  alt: ev.altKey,
  shift: ev.shiftKey,
  target: {
    tag: ev.target?.tagName ?? '',
    editable: !!ev.target?.isContentEditable,
    id: ev.target?.id ?? '',
  },
})

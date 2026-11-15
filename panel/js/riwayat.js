// Hapus riwayat di panel (fungsi murni, diuji Vitest): ringkasan pilihan, isi dialog konfirmasi dengan
// peringatan khusus untuk jalan bertemuan, dan pemilihan "lebih lama dari N hari".
import { esc } from './komponen.js'

export const teksByte = (n) =>
  n >= 1e9
    ? `${(n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 1 })} GB`
    : n >= 1e6
      ? `${(n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 })} MB`
      : `${Math.round((n ?? 0) / 1e3).toLocaleString('id-ID')} KB`

/**
 * Ringkasan jalan yang akan dihapus. `jenis` = 'jalan' (folder) atau 'trace' (trace.zip saja).
 * Jalan yang sedang berjalan tidak ikut (dilewati).
 */
export function ringkasHapus(items, jenis = 'jalan', aktif = new Set()) {
  const ikut = items.filter((j) => !aktif.has(j.run_id) && (jenis === 'jalan' || j.punya_trace))
  return {
    ikut,
    dilewati: items.filter((j) => aktif.has(j.run_id)),
    byte: ikut.reduce((a, j) => a + (jenis === 'jalan' ? j.ukuran : j.ukuran_trace), 0),
    bertemuan: ikut.filter((j) => j.temuan > 0),
  }
}

/** Isi dialog konfirmasi: jumlah + ukuran, daftar singkat, peringatan temuan, yang dilewati. */
export function isiKonfirmasi(items, jenis = 'jalan', aktif = new Set()) {
  const r = ringkasHapus(items, jenis, aktif)
  if (!r.ikut.length)
    return `<p>Tidak ada yang bisa dihapus${r.dilewati.length ? ': jalan terpilih sedang berjalan' : jenis === 'trace' ? ': jalan terpilih tidak punya trace' : ''}.</p>`
  const daftar = r.ikut
    .slice(0, 8)
    .map(
      (j) =>
        `<li>${esc(j.title)} <span class="dim">· ${esc(j.started_at ? new Date(j.started_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : j.run_id)} · ${teksByte(jenis === 'jalan' ? j.ukuran : j.ukuran_trace)}</span>${j.temuan ? ` <b class="warn-t">${j.temuan} temuan</b>` : ''}</li>`,
    )
    .join('')
  const lagi = r.ikut.length > 8 ? `<li class="dim">… ${r.ikut.length - 8} jalan lagi</li>` : ''
  const apa =
    jenis === 'jalan'
      ? `Hapus <b>${r.ikut.length} jalan</b> (${teksByte(r.byte)}): folder jalan beserta laporan, screenshot, dan trace.`
      : `Hapus <b>trace ${r.ikut.length} jalan</b> (${teksByte(r.byte)}). Laporan dan screenshot tetap; Buka trace jadi tidak tersedia.`
  const peringatan =
    r.bertemuan.length && jenis === 'jalan'
      ? `<div class="rw-peringatan" role="alert"><b>${r.bertemuan.length} jalan punya temuan tercatat.</b> Catatan temuan di docs/TEMUAN.md tetap ada, tetapi screenshot temuan dan bukti di folder jalan ikut terhapus.</div>`
      : ''
  const lewat = r.dilewati.length
    ? `<p class="dim">${r.dilewati.length} jalan dilewati karena sedang berjalan.</p>`
    : ''
  return `<p>${apa} Tidak bisa dibatalkan.</p><ul class="rw-daftar">${daftar}${lagi}</ul>${peringatan}${lewat}`
}

/** Jalan yang lebih lama dari `hari` hari (dari waktu mulai). */
export function lebihLama(items, hari, sekarang = Date.now()) {
  const batas = sekarang - Number(hari) * 86_400_000
  return items.filter((j) => j.started_at && Date.parse(j.started_at) < batas)
}

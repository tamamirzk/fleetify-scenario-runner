// Halaman "Tugas saya": isu Plane yang di-assign ke pemilik API key (GET /api/tugas), ditampilkan
// seperti Plane: Papan (satu kolom per status, urutan papan Plane) atau Daftar (dikelompokkan per
// status). Tiap tugas membawa skenario yang menautkan tiketnya. Fungsi murni → HTML.

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )

/** Warna dari Plane hanya dipakai bila berbentuk hex (mencegah CSS asing masuk lewat atribut style). */
const warnaAman = (w) => (/^#[0-9a-f]{3,8}$/i.test(String(w ?? '')) ? w : '')

export const LABEL_PRIORITAS = {
  urgent: 'Mendesak',
  high: 'Tinggi',
  medium: 'Sedang',
  low: 'Rendah',
  none: 'Tanpa prioritas',
}

export const SARING_SKENARIO = {
  semua: 'Semua',
  ada: 'Punya skenario',
  belum: 'Belum ada skenario',
}

const tgl = (iso) =>
  iso
    ? new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
    : ''

/** Ikon prioritas ala Plane: batang 1–3 (rendah–tinggi), kotak "!" (mendesak), garis putus (tanpa). */
export function ikonPrioritas(p) {
  const label = `Prioritas: ${LABEL_PRIORITAS[p] ?? p}`
  const isi =
    p === 'urgent'
      ? '<rect x="2" y="2" width="12" height="12" rx="3" fill="currentColor"/><path d="M8 5v3.5M8 10.6v.4" stroke="var(--sr-bg)" stroke-width="1.8" stroke-linecap="round"/>'
      : p === 'none'
        ? '<path d="M3 8h10" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2 2" stroke-linecap="round"/>'
        : [
            [3, 10, 4],
            [7, 7, 7],
            [11, 4, 10],
          ]
            .map(
              ([x, y, h], i) =>
                `<rect x="${x}" y="${y}" width="2.4" height="${h}" rx="1" fill="currentColor" opacity="${i < ({ high: 3, medium: 2, low: 1 }[p] ?? 0) ? 1 : 0.25}"/>`,
            )
            .join('')
  return `<span class="tg-pr pr-${esc(p)}" role="img" aria-label="${esc(label)}" title="${esc(label)}"><svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">${isi}</svg></span>`
}

/** Titik status ala Plane: warna status; bentuk menurut grup (garis putus, cincin, setengah, penuh, silang). */
export function ikonStatus(s) {
  const w = warnaAman(s.warna)
  const gaya = w ? ` style="color:${w}"` : ''
  const isi =
    s.grup === 'backlog'
      ? '<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="2.2 1.8"/>'
      : s.grup === 'unstarted' || s.grup === 'triage'
        ? '<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/>'
        : s.grup === 'started'
          ? '<circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 4a4 4 0 0 1 0 8z" fill="currentColor"/>'
          : s.grup === 'cancelled'
            ? '<circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8" stroke="var(--sr-bg)" stroke-width="1.6" stroke-linecap="round"/>'
            : '<circle cx="8" cy="8" r="7" fill="currentColor"/><path d="M5 8.2l2 2 4-4.2" fill="none" stroke="var(--sr-bg)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>'
  return `<span class="tg-st"${gaya} aria-hidden="true"><svg width="16" height="16" viewBox="0 0 16 16">${isi}</svg></span>`
}

const chipLabel = (l) => {
  const w = warnaAman(l.warna)
  return `<span class="tg-label"><span class="tg-label-titik"${w ? ` style="background:${w}"` : ''} aria-hidden="true"></span>${esc(l.nama)}</span>`
}

const chipSkenario = (t) =>
  t.skenario?.length
    ? t.skenario
        .map(
          (s) =>
            `<a class="tg-sk" href="#/ringkasan/${esc(s.slug)}" title="Skenario ${esc(s.slug)}">${s.alur?.jenis === 'lurus' ? '<span class="sk-alur lurus">Lurus</span> ' : ''}${esc(s.judul)}</a>`,
        )
        .join('')
    : '<span class="tg-kosong">Belum ada skenario</span>'

const kunci = (t) =>
  `<a class="tg-kunci" href="${esc(t.url)}" target="_blank" rel="noopener" title="Buka ${esc(t.key)} di Plane">${esc(t.key)}</a>`

const tenggat = (t) =>
  t.tenggat ? `<span class="tg-tenggat" title="Tenggat">${esc(tgl(t.tenggat))}</span>` : ''

/** Saring: skenario (semua | ada | belum) dan selesai (false = sembunyikan Done & Cancelled). */
export function saringTugas(tugas, { skenario = 'semua', selesai = false } = {}) {
  return tugas.filter((t) => {
    if (!selesai && t.selesai) return false
    const ada = !!t.skenario?.length
    return skenario === 'ada' ? ada : skenario === 'belum' ? !ada : true
  })
}

/**
 * Kolom/kelompok per status, urutan papan Plane (`status` dari server). Status yang selesai disembunyikan
 * bila `selesai` false; status yang ada di tugas tapi tidak ada di daftar tetap muncul di akhir.
 */
export function kolomStatus(status, tugas, { selesai = false } = {}) {
  const daftar = [...(status ?? [])]
  for (const t of tugas)
    if (!daftar.some((s) => s.nama === t.status))
      daftar.push({ id: t.statusId, nama: t.status, grup: t.grup, warna: '', selesai: t.selesai })
  return daftar
    .filter((s) => selesai || !s.selesai)
    .map((s) => ({ status: s, tugas: tugas.filter((t) => t.status === s.nama) }))
}

const LABEL_TAHAP = {
  diambil: 'Diambil',
  dipelajari: 'Dipelajari',
  dikerjakan: 'Dikerjakan (AI)',
  diverifikasi: 'Diverifikasi',
  didokumentasikan: 'Didokumentasikan',
  selesai: 'Selesai',
}

/** Aksi Kerja: chip tahap (menaut ke halaman Kerja) bila sudah diambil, selain itu tombol Ambil. */
export function aksiKerja(t) {
  return t.kerja
    ? `<a class="tg-tahap tahap-${esc(t.kerja.tahap)}" href="#/kerja/${esc(t.key)}" title="Buka kerja ${esc(t.key)}">${esc(LABEL_TAHAP[t.kerja.tahap] ?? t.kerja.tahap)}</a>`
    : `<button type="button" class="btn tb tg-ambil" data-tg-ambil="${esc(t.key)}" title="Mulai monitoring: salin tiket dari Plane ke kerja/${esc(t.key)}/">Ambil</button>`
}

/**
 * Atribut kartu/baris yang bisa diklik seluruhnya: bisa difokus (Enter membuka). Tiket yang sudah
 * diambil membuka halaman Kerja; yang belum membuka laci pratinjau. Elemen interaktif di dalamnya
 * (kunci, chip, tombol) menjalankan aksinya sendiri — pemanggil mengabaikan klik yang berasal dari sana.
 */
export const atributBuka = (t) =>
  `tabindex="0" data-tg-buka="${esc(t.key)}" data-tg-ke="${t.kerja ? 'kerja' : 'laci'}" aria-label="${esc(`${t.key}: ${t.judul} — ${t.kerja ? 'buka kerja' : 'lihat pratinjau'}`)}"`

/**
 * Kotak centang "pilih untuk diambil" — hanya untuk tiket terbuka yang belum diambil. Beberapa
 * tiket diambil sekaligus lalu ditempatkan lewat Rencana slot di Workspace.
 */
export const centangPilih = (t, dipilih = new Set()) =>
  t.kerja || t.selesai
    ? ''
    : `<label class="tg-pilih" title="Pilih ${esc(t.key)} untuk diambil bersama"><input type="checkbox" data-tg-pilih="${esc(t.key)}"${dipilih.has(t.key) ? ' checked' : ''} aria-label="Pilih ${esc(t.key)}"></label>`

/** Bilah pilihan: muncul bila ada tiket dicentang. */
export function bilahPilih(n) {
  if (!n) return ''
  return `<div class="tg-bilah-pilih" role="region" aria-label="Tiket terpilih"><b>${n} dipilih</b><span class="dim">diambil tanpa slot, lalu ditempatkan lewat Rencana slot di Workspace</span><button type="button" class="btn tb utama-tb" id="tg-ambil-pilih">Ambil terpilih</button><button type="button" class="btn tb" id="tg-batal-pilih">Batal</button></div>`
}

/** Kartu papan: kunci + prioritas, judul, label, tenggat, skenario tertaut, aksi kerja. */
export function kartuTugas(t, dipilih = new Set()) {
  const label = t.label?.length
    ? `<div class="tg-labels">${t.label.map(chipLabel).join('')}</div>`
    : ''
  return `<article class="tg-kartu tg-buka${t.skenario?.length ? '' : ' tg-belum'}" ${atributBuka(t)}>
    <div class="tg-kartu-hd">${centangPilih(t, dipilih)}${kunci(t)}${ikonPrioritas(t.prioritas)}</div>
    <div class="tg-judul">${esc(t.judul)}</div>
    ${label}
    <div class="tg-kartu-kaki">${chipSkenario(t)}${tenggat(t)}</div>
    <div class="tg-kartu-aksi">${aksiKerja(t)}</div>
  </article>`
}

/** Baris daftar: prioritas, kunci, judul + label, tenggat, skenario tertaut. */
export function barisTugas(t, dipilih = new Set()) {
  return `<li class="tg-baris tg-buka" ${atributBuka(t)}>
    ${centangPilih(t, dipilih)}${ikonPrioritas(t.prioritas)}
    ${kunci(t)}
    <div class="tg-teks"><span class="tg-judul">${esc(t.judul)}</span>${t.label?.length ? `<span class="tg-labels">${t.label.map(chipLabel).join('')}</span>` : ''}</div>
    ${tenggat(t)}
    <div class="tg-skenario">${chipSkenario(t)}</div>
    <div class="tg-baris-aksi">${aksiKerja(t)}</div>
  </li>`
}

const LABEL_SLOT = (n) => (n ? `Slot ${n}` : '')

/** Kartu kerja lokal (tanpa tiket Plane): seluruh kartu menaut ke halaman Kerja. */
export function kartuLokal(k) {
  const slot = k.slot ? `<span class="tg-slot">${esc(LABEL_SLOT(k.slot))}</span>` : ''
  return `<article class="tg-kartu tg-buka tg-lokal-kartu" tabindex="0" data-tg-buka="${esc(k.key)}" data-tg-ke="kerja" aria-label="${esc(`${k.key}: ${k.judul} — buka kerja`)}">
    <div class="tg-kartu-hd"><a class="tg-kunci" href="#/kerja/${esc(k.key)}" title="Buka kerja ${esc(k.key)}">${esc(k.key)}</a>${slot}</div>
    <div class="tg-judul">${esc(k.judul)}</div>
    <div class="tg-kartu-aksi"><a class="tg-tahap tahap-${esc(k.tahap)}" href="#/kerja/${esc(k.key)}" title="Buka kerja ${esc(k.key)}">${esc(LABEL_TAHAP[k.tahap] ?? k.tahap)}</a></div>
  </article>`
}

/** Bagian "Kerja lokal" di atas papan/daftar: kerja tanpa tiket Plane yang belum selesai. */
export function bagianLokal(lokal) {
  if (!lokal?.length) return ''
  return `<section class="tg-lokal" aria-labelledby="tg-lokal-h"><div class="tg-lokal-hd"><h2 id="tg-lokal-h">Kerja lokal</h2><span class="tg-kol-n">${lokal.length}</span><span class="dim">tanpa tiket Plane (bug/permintaan dari chat)</span></div><div class="tg-lokal-isi">${lokal.map(kartuLokal).join('')}</div></section>`
}

/**
 * Laci pratinjau tiket yang belum diambil. `pratinjau` = { memuat?, galat?, data? } dari
 * GET /api/tugas/<KEY>/pratinjau; bagian lain datang dari data tugas yang sudah dimuat.
 */
export function laciPratinjau(t, status, pratinjau = {}) {
  const st = (status ?? []).find((s) => s.nama === t.status) ?? { nama: t.status, grup: t.grup }
  const label = t.label?.length
    ? `<div class="tg-labels">${t.label.map(chipLabel).join('')}</div>`
    : ''
  const d = pratinjau.data
  const desk = pratinjau.memuat
    ? '<div class="tg-laci-muat" role="status"><span class="putar kecil" aria-hidden="true"></span>Memuat deskripsi dari Plane…</div>'
    : pratinjau.galat
      ? `<div class="errbox" role="alert"><b>Deskripsi gagal dimuat</b><div class="mono">${esc(pratinjau.galat)}</div></div><button type="button" class="btn tb" data-tg-laci-ulang="${esc(t.key)}">Coba lagi</button>`
      : d?.deskripsi
        ? `<div class="tg-desk">${esc(d.deskripsi)}</div>${d.dipotong ? '<p class="dim">Deskripsi dipotong; selengkapnya di Plane.</p>' : ''}`
        : '<p class="dim">Tiket ini tanpa deskripsi.</p>'
  return `<div class="tg-laci-latar" data-tg-laci-tutup></div>
  <aside class="tg-laci" role="dialog" aria-modal="false" aria-labelledby="tg-laci-j" id="tg-laci">
    <div class="tg-laci-hd"><a class="tg-kunci" href="${esc(t.url)}" target="_blank" rel="noopener" title="Buka ${esc(t.key)} di Plane">${esc(t.key)}</a><button type="button" class="btn icon tg-laci-x" data-tg-laci-tutup aria-label="Tutup pratinjau" title="Tutup (Esc)">×</button></div>
    <h2 class="tg-laci-judul" id="tg-laci-j">${esc(t.judul)}</h2>
    <dl class="tg-laci-meta">
      <dt>Status</dt><dd>${ikonStatus(st)}<span>${esc(t.status)}</span></dd>
      <dt>Prioritas</dt><dd>${ikonPrioritas(t.prioritas)}<span>${esc(LABEL_PRIORITAS[t.prioritas] ?? t.prioritas)}</span></dd>
      <dt>Label</dt><dd>${label || '<span class="dim">–</span>'}</dd>
      <dt>Tenggat</dt><dd>${t.tenggat ? esc(tgl(t.tenggat)) : '<span class="dim">–</span>'}</dd>
      <dt>Skenario</dt><dd class="tg-skenario">${chipSkenario(t)}</dd>
    </dl>
    <h3 class="tg-laci-h3">Deskripsi</h3>
    ${desk}
    <div class="tg-laci-aksi">${aksiKerja(t)}<a class="btn tb" href="${esc(t.url)}" target="_blank" rel="noopener">Buka di Plane ↗</a></div>
  </aside>`
}

const kepalaKolom = (s, n) =>
  `${ikonStatus(s)}<span class="tg-kol-nama">${esc(s.nama)}</span><span class="tg-kol-n">${n}</span>`

/** Papan: satu kolom per status; kolom kosong diciutkan jadi lajur sempit berjudul tegak (seperti Plane). */
export function papanTugas(kolom, dipilih = new Set()) {
  if (!kolom.some((k) => k.tugas.length))
    return '<div class="empty">Tidak ada tugas yang cocok dengan saringan.</div>'
  return `<div class="tg-papan" role="list">${kolom
    .map(({ status: s, tugas }) =>
      tugas.length
        ? `<section class="tg-kolom" role="listitem" aria-label="${esc(s.nama)}, ${tugas.length} tugas"><div class="tg-kol-hd">${kepalaKolom(s, tugas.length)}</div><div class="tg-kol-isi">${tugas.map((t) => kartuTugas(t, dipilih)).join('')}</div></section>`
        : `<section class="tg-kolom tg-kolom-ciut" role="listitem" aria-label="${esc(s.nama)}, kosong" title="${esc(s.nama)} · kosong"><div class="tg-kol-hd">${kepalaKolom(s, 0)}</div></section>`,
    )
    .join('')}</div>`
}

export function daftarTugas(kolom, dipilih = new Set()) {
  const isi = kolom.filter((k) => k.tugas.length)
  if (!isi.length) return '<div class="empty">Tidak ada tugas yang cocok dengan saringan.</div>'
  return isi
    .map(
      ({ status: s, tugas }) =>
        `<section class="tg-grup" aria-label="${esc(s.nama)}"><div class="tg-grup-hd">${kepalaKolom(s, tugas.length)}</div><ul class="tg-list">${tugas.map((t) => barisTugas(t, dipilih)).join('')}</ul></section>`,
    )
    .join('')
}

const laciDari = (semua, status, laci) => {
  const t = laci ? semua.find((x) => x.key === laci.key) : null
  return t ? laciPratinjau(t, status, laci) : ''
}

/**
 * Isi halaman Tugas saya.
 * @param {{ dikonfigurasi: boolean, saya?: string, project?: string, status?: any[], tugas?: any[], lokal?: any[] } | null} data
 * @param {{ galat?: string | null, memuat?: boolean, tampilan?: 'papan' | 'daftar', saring?: { skenario?: string, selesai?: boolean }, laci?: { key: string, memuat?: boolean, galat?: string | null, data?: any } | null, dipilih?: Set<string> }} o
 */
export function halamanTugas(
  data,
  {
    galat = null,
    memuat = false,
    tampilan = 'papan',
    saring = {},
    laci = null,
    dipilih = new Set(),
  } = {},
) {
  const kepala = (ctx, extra = '') =>
    `<div class="titlerow"><div class="titlebox"><div class="ctx">${ctx}</div><h1>Tugas saya</h1></div>${extra}</div>`
  if (memuat && !data) return `${kepala('Plane')}<div class="empty">Memuat tugas dari Plane…</div>`
  if (galat)
    return `${kepala('Plane')}<div class="errbox" role="alert"><b>Tugas gagal dimuat</b><div class="mono">${esc(galat)}</div></div>
      <div class="tg-alat"><button type="button" class="btn tb" id="tg-segarkan">Coba lagi</button></div>`
  if (!data?.dikonfigurasi)
    return `${kepala('Plane belum tersambung')}<div class="empty tg-setel">
      <p>Tugas diambil dari Plane memakai API key pribadi. Tambahkan ke <code>.env</code> lalu nyalakan ulang panel:</p>
      <div class="kartu-mono">PLANE_API_KEY=&lt;kunci dari Plane → Profile settings → Personal Access Tokens&gt;</div>
      <p class="dim">Alamat Plane dan workspace diambil dari <code>TICKET_URL</code>; project bawaan <code>FMS</code> (ubah dengan <code>PLANE_PROJECT</code>).</p></div>`
  const semua = data.tugas ?? []
  const terbuka = semua.filter((t) => !t.selesai)
  const ada = terbuka.filter((t) => t.skenario?.length).length
  const sk = saring.skenario ?? 'semua'
  const selesai = !!saring.selesai
  const tampil = saringTugas(semua, { skenario: sk, selesai })
  const kolom = kolomStatus(data.status, tampil, { selesai })
  const stat = (n, l) =>
    `<div class="stat"><div class="n">${n}</div><div class="l">${l}</div></div>`
  const tombolSaring = Object.entries(SARING_SKENARIO)
    .map(
      ([k, l]) =>
        `<button type="button" data-tg-saring="${k}" aria-pressed="${sk === k}">${l}</button>`,
    )
    .join('')
  return `${kepala(
    `Plane · ${esc(data.project ?? '')}${data.saya ? ` · ${esc(data.saya)}` : ''}`,
    `${stat(terbuka.length, 'Tugas terbuka')}${stat(ada, 'Punya skenario')}${stat(terbuka.length - ada, 'Belum ada skenario')}`,
  )}
    <div class="tg-alat">
      <div class="pill" role="group" aria-label="Tampilan">
        <button type="button" data-tg-tampilan="papan" aria-pressed="${tampilan === 'papan'}">Papan</button>
        <button type="button" data-tg-tampilan="daftar" aria-pressed="${tampilan === 'daftar'}">Daftar</button>
      </div>
      <div class="pill" role="group" aria-label="Saring skenario">${tombolSaring}</div>
      <label class="chk"><input type="checkbox" id="tg-selesai" ${selesai ? 'checked' : ''}>Tampilkan Done &amp; Cancelled</label>
      <span class="tg-jumlah dim">${tampil.length} tugas</span>
      <button type="button" class="btn tb" id="tg-segarkan">Segarkan</button>
    </div>
    ${bilahPilih(dipilih.size)}
    ${bagianLokal(data.lokal)}
    ${tampilan === 'daftar' ? daftarTugas(kolom, dipilih) : papanTugas(kolom, dipilih)}${laciDari(semua, data.status, laci)}`
}

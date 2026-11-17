// Layar Manajemen skenario v2 sebagai fungsi murni: sidebar Project › Modul, bar filter chip,
// daftar berkelompok per modul, papan per status, rencana uji. Data dari GET /api/scenarios + /api/project.
// "Tugas saya", "Impor dari tugas", "Tugas terkait", dan sumber tugas MCP belum tersedia. Sasaran tetap
// server v2 lokal (diatur di .env).
import { chipTiketDaftar, esc } from './komponen.js'
import { idGrup, terbuka } from './sidebar-ciut.js'

export const LABEL_STATUS = {
  siap: 'Siap',
  draf: 'Draf',
  ada_kegagalan: 'Ada kegagalan',
  perlu_diperbarui: 'Perlu diperbarui',
  tidak_valid: 'Skema tidak valid',
}
const NADA_STATUS = {
  siap: 'ok-t',
  draf: 'dim',
  ada_kegagalan: 'bad-t',
  perlu_diperbarui: 'warn-t',
  tidak_valid: 'bad-t',
}

/** Status jalan terakhir untuk filter: lulus | gagal | dihentikan | belum. */
export function statusJalan(f) {
  const s = f?.last?.status
  if (s === 'selesai') return 'lulus'
  if (s === 'gagal') return 'gagal'
  if (s === 'dihentikan') return 'dihentikan'
  return 'belum'
}
export const LABEL_JALAN = {
  lulus: 'Lulus',
  gagal: 'Gagal',
  dihentikan: 'Dihentikan',
  belum: 'Belum',
}
export const LABEL_TIKET = { plane: 'Plane', jira: 'Jira', tanpa: 'Tanpa tiket' }

export const statusFile = (f) => (f.valid ? (f.status ?? 'siap') : 'tidak_valid')

/** Nilai yang tersedia per jenis filter. */
export function nilaiFilter(jenis, files = []) {
  if (jenis === 'jalan') return Object.keys(LABEL_JALAN)
  if (jenis === 'tiket') return Object.keys(LABEL_TIKET)
  if (jenis === 'status') return Object.keys(LABEL_STATUS)
  if (jenis === 'pemilik')
    return [...new Set(files.map((f) => f.pemilik ?? '(belum diisi)'))].sort()
  return []
}
export const LABEL_FILTER = {
  jalan: 'Status jalan',
  tiket: 'Sumber tiket',
  pemilik: 'Pemilik',
  status: 'Status skenario',
}
export const labelNilai = (jenis, v) =>
  ({ jalan: LABEL_JALAN, tiket: LABEL_TIKET, status: LABEL_STATUS })[jenis]?.[v] ?? v

/**
 * Saring daftar skenario. `filter` = { jenis: string[] } (kosong/tidak ada = semua), `modul` = id folder
 * atau null, `q` = cari slug/judul/tiket.
 */
export function saringSkenario(files, { filter = {}, modul = null, q = '' } = {}) {
  const cari = q.trim().toLowerCase()
  return files.filter((f) => {
    if (modul && f.task !== modul) return false
    const ada = (j, v) => !filter[j]?.length || filter[j].includes(v)
    if (!ada('jalan', statusJalan(f))) return false
    if (!ada('status', statusFile(f))) return false
    if (!ada('pemilik', f.pemilik ?? '(belum diisi)')) return false
    if (filter.tiket?.length) {
      const src = (f.tiket ?? []).map((t) => t.sumber)
      if (!filter.tiket.some((v) => (v === 'tanpa' ? !src.length : src.includes(v)))) return false
    }
    if (!cari) return true
    return [f.slug, f.title, ...(f.tiket ?? []).map((t) => t.key)].some((x) =>
      String(x ?? '')
        .toLowerCase()
        .includes(cari),
    )
  })
}

/** Kunci urut dalam grup: alur lurus, belok menurut langkah beloknya, lalu skenario lepas. */
const kunciAlur = (f) =>
  f.alur?.jenis === 'lurus' ? [0, 0] : f.alur?.jenis === 'belok' ? [1, f.alur.langkah] : [2, 0]

/** Urutkan skenario satu grup (sama dengan urutAlur di server, dipakai Putar semua). */
export function urutAlur(files) {
  return [...files].sort((x, y) => {
    const [a1, a2] = kunciAlur(x)
    const [b1, b2] = kunciAlur(y)
    return a1 - b1 || a2 - b2 || String(x.slug).localeCompare(String(y.slug))
  })
}

/** Penanda kedudukan di grup: "Alur lurus" atau "Belok di langkah n · judul langkah". */
export function chipAlur(f) {
  const a = f.alur
  if (!a) return ''
  if (a.jenis === 'lurus') return '<span class="sk-alur lurus">Alur lurus</span>'
  const judul = a.judul ? ` · ${esc(a.judul)}` : ''
  return `<span class="sk-alur belok" title="Menyimpang dari ${esc(a.dari)} sesudah langkah ${a.langkah}">↳ Belok di langkah ${a.langkah}${judul}</span>`
}

/** Kelompokkan per modul sesuai urutan project; di dalam grup urut menurut alur. */
export function kelompokModul(files, modul) {
  const out = []
  for (const m of modul) {
    const fs = urutAlur(files.filter((f) => f.task === m.id))
    if (fs.length) out.push({ modul: m, files: fs })
  }
  return out
}

const tglJam = (iso) =>
  iso
    ? new Date(iso).toLocaleString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''

/** Ikon hasil jalan terakhir (dengan teks untuk pembaca layar). */
export function ikonHasil(f) {
  const s = statusJalan(f)
  const ik = {
    lulus: ['ok', '✓', 'lulus'],
    gagal: ['bad', '×', 'gagal'],
    dihentikan: ['warn', '■', 'dihentikan'],
    belum: ['', '', 'belum dijalankan'],
  }[s]
  return `<span class="sk-ikon ${ik[0]}" role="img" aria-label="Jalan terakhir ${ik[2]}">${ik[1]}</span>`
}

/** Baris meta: waktu jalan terakhir · langkah · perkiraan; gagal: di langkah n · lihat laporan. */
export function metaSkenario(f) {
  if (!f.valid)
    return `<span class="bad-t">Tidak bisa diputar: ${esc(f.masalah?.[0]?.path ? `${f.masalah[0].path}: ` : '')}${esc(f.masalah?.[0]?.message ?? '')}</span>`
  const l = f.last
  const est = f.estimasi ? ` · ±${esc(String(f.estimasi).replace(' menit', ' mnt'))}` : ''
  const lk = `${f.langkah} langkah`
  if (!l) return `Belum pernah dijalankan · ${lk}${est}`
  const lap = l.started_at ? ` · <a href="#/laporan/${esc(l.run_id)}">lihat laporan</a>` : ''
  if (l.status === 'gagal')
    return `Gagal ${esc(tglJam(l.ended_at || l.started_at))}${l.failed_step ? ` di langkah ${l.failed_step}` : ' saat menyiapkan'}${lap} · ${lk}${est}`
  if (l.status === 'dihentikan')
    return `Dihentikan ${esc(tglJam(l.ended_at || l.started_at))}${lap} · ${lk}${est}`
  return `Terakhir ${esc(tglJam(l.ended_at || l.started_at))}${lap} · ${lk}${est}`
}

/** Satu baris skenario: ikon hasil, slug + judul, meta, chip tiket, status, aksi Putar/Sunting/Lainnya. */
export function barisSkenario(f) {
  const st = statusFile(f)
  // Hanya tiket nyata yang jadi chip; tanpa tiket tidak ditulis apa pun.
  const tiket = f.tiket?.length ? chipTiketDaftar(f.tiket) : ''
  return `<li class="sk-baris${f.alur?.jenis === 'belok' ? ' sk-belok' : ''}" data-slug="${esc(f.slug)}">
    ${ikonHasil(f)}
    <div class="sk-teks"><div class="sk-judul">${esc(f.title ?? f.slug)}</div>${chipAlur(f) ? `<div class="sk-alur-baris">${chipAlur(f)}</div>` : ''}<div class="sk-meta">${metaSkenario(f)} · <span class="sk-slug" title="Nama berkas skenario">${esc(f.slug)}</span></div></div>
    <div class="sk-chips">${tiket}</div>
    <span class="sk-status ${NADA_STATUS[st]}">${esc(LABEL_STATUS[st])}</span>
    <div class="sk-aksi">
      ${f.valid ? `<a class="btn icon sk-btn" href="#/ringkasan/${esc(f.slug)}" aria-label="Putar ${esc(f.slug)}" title="Putar (ringkasan sebelum putar)"><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4l13 8-13 8z"/></svg></a>` : '<span class="btn icon sk-btn" aria-disabled="true" title="Skema tidak valid"></span>'}
      <button type="button" class="btn icon sk-btn" data-sunting="${esc(f.slug)}" aria-label="Sunting ${esc(f.slug)} di editor" title="Sunting di editor"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4"/></svg></button>
      <button type="button" class="btn icon sk-btn" data-lainnya="${esc(f.slug)}" aria-label="Lainnya untuk ${esc(f.slug)}" aria-haspopup="menu" title="Lainnya">···</button>
    </div>
  </li>`
}

/** Daftar berkelompok per modul (kelompok bisa dilipat). */
export function daftarSkenario(kelompok, { lipat = new Set(), aktif = false } = {}) {
  if (!kelompok.length)
    return '<div class="empty">Tidak ada skenario yang cocok dengan saringan.</div>'
  const semuaTutup = kelompok.every(({ modul }) => lipat.has(modul.id))
  const alat =
    kelompok.length > 1
      ? `<div class="sk-lipat-semua"><button type="button" class="btn tb" data-lipat-semua="${semuaTutup ? 'buka' : 'tutup'}">${semuaTutup ? 'Buka semua' : 'Ciutkan semua'}</button></div>`
      : ''
  return (
    alat +
    kelompok
      .map(({ modul, files }) => {
        const tutup = lipat.has(modul.id)
        return `<section class="sk-grup" aria-label="Modul ${esc(modul.nama)}">
        <div class="sk-grup-hd"><button type="button" class="sk-lipat" data-lipat="${esc(modul.id)}" aria-expanded="${!tutup}"><span aria-hidden="true">${tutup ? '›' : '⌄'}</span>${esc(modul.nama.toUpperCase())} · ${files.length}</button>
          <button type="button" class="btn tb sk-semua" data-putar-semua="${esc(modul.id)}" ${aktif || !files.some((f) => f.valid) ? 'disabled' : ''} title="Putar semua skenario valid di modul ini berurutan">Putar semua</button></div>
        ${tutup ? '' : `<ul class="sk-list">${files.map(barisSkenario).join('')}</ul>`}
      </section>`
      })
      .join('')
  )
}

/** Papan: kolom per status skenario. */
export function papanSkenario(files) {
  // "Perlu diperbarui" butuh sinkron tiket (belum ada): kolomnya hanya tampil bila ada isinya.
  const kolom = ['siap', 'draf', 'ada_kegagalan', 'perlu_diperbarui', 'tidak_valid'].filter(
    (k) => k !== 'perlu_diperbarui' || files.some((f) => statusFile(f) === k),
  )
  return `<div class="sk-papan">${kolom
    .map((k) => {
      const fs = files.filter((f) => statusFile(f) === k)
      return `<section class="sk-kolom" aria-label="${esc(LABEL_STATUS[k])}"><div class="sk-kolom-hd"><span class="${NADA_STATUS[k]}">${esc(LABEL_STATUS[k])}</span><span class="dim">${fs.length}</span></div>${fs.map((f) => `<a class="sk-kartu" href="#/ringkasan/${esc(f.slug)}">${ikonHasil(f)}<span><b>${esc(f.title ?? f.slug)}</b><span class="dim">${esc(f.task)} · <span class="sk-slug">${esc(f.slug)}</span></span></span></a>`).join('') || '<div class="dim sk-kosong">—</div>'}</section>`
    })
    .join('')}</div>`
}

/** Chip filter: Nama · operator · nilai · ×. */
export function chipFilter(jenis, nilai) {
  const op = jenis === 'pemilik' && nilai.length === 1 ? 'adalah' : 'salah satu'
  return `<span class="sk-fchip"><button type="button" class="sk-fbuka" data-fbuka="${jenis}" aria-haspopup="dialog"><b>${esc(LABEL_FILTER[jenis])}</b> <span class="dim">${op}</span> ${esc(nilai.map((v) => labelNilai(jenis, v)).join(', '))}</button><button type="button" class="sk-fhapus" data-fhapus="${jenis}" aria-label="Hapus filter ${esc(LABEL_FILTER[jenis])}">×</button></span>`
}

/** Tombol judul grup yang bisa dibuka-tutup (aria-expanded, panah ⌄/›, jumlah tetap terlihat saat tertutup). */
function tombolGrup(k, buka, isi, kelas, label) {
  return `<button type="button" class="sb-grup ${kelas}" data-grup="${esc(k)}" aria-expanded="${buka}" aria-controls="${idGrup(k)}" aria-label="${esc(label)}${buka ? '' : ' (tertutup)'}"><span class="sb-panah" aria-hidden="true">⌄</span>${isi}</button>`
}

/**
 * Sidebar: tombol ciut/buka, navigasi, lalu project dengan kelompok "Uji per modul" (modul = folder
 * scenarios/<modul>/). Tiap grup bisa dibuka-tutup (`tutup`, lihat sidebar-ciut.js); `ciut` = sidebar
 * menjadi rel ikon (tooltip nama butir).
 * @param {{ halaman: string, project: any, modulAktif: string | null, jumlahSemua: number, jalanAktif: boolean, tutup?: Set<string>, ciut?: boolean }} o
 */
export function sidebar({
  halaman,
  project,
  modulAktif,
  jumlahSemua,
  jalanAktif,
  tutup = new Set(),
  ciut = false,
}) {
  const tip = (label) => (ciut ? ` title="${esc(label)}"` : '')
  const nav = (k, href, label, ikon, extra = '') =>
    `<a class="sb-item${halaman === k ? ' aktif' : ''}" href="${href}"${halaman === k ? ' aria-current="page"' : ''}${tip(label)}>${ikon}<span>${label}</span>${extra}</a>`
  const ik = (d) =>
    `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`
  const p = project
  const buka = (k) => terbuka(tutup, k)
  const isiGrup = (k, html) =>
    `<div class="sb-isi" id="${idGrup(k)}" data-isi="${esc(k)}"${buka(k) ? '' : ' hidden'}>${html}</div>`
  const diModul = halaman === 'skenario'
  const butir = (aktif, href, label, n, kelas = '') =>
    `<a class="sb-mod${kelas}${aktif ? ' aktif' : ''}" href="${href}"${aktif ? ' aria-current="true"' : ''}><span>${label}</span><span class="n">${n}</span></a>`
  const uji = p
    ? `<div class="sb-kel" role="group" aria-label="Uji per modul">${tombolGrup('uji', buka('uji'), `<span>Uji per modul</span><span class="n">${jumlahSemua}</span>`, 'sb-kel-hd', 'Uji per modul')}
      ${isiGrup(
        'uji',
        `${butir(diModul && !modulAktif, '#/', 'Semua modul', jumlahSemua)}
      ${p.modul.map((m) => butir(diModul && modulAktif === m.id, `#/modul/${esc(m.id)}`, esc(m.nama), m.jumlah)).join('')}
      <button type="button" class="sb-mod sb-tambah" id="sb-tambah-modul">+ Tambah modul</button>`,
      )}</div>`
    : ''
  const totalProject = jumlahSemua
  const kepala = `<div class="sb-kepala"><a class="sb-merek" href="#/dasbor" aria-label="Scenario Runner — Dashboard"><img src="/aset/logo.svg" alt="" width="30" height="30"><span><span class="tipis">Scenario</span> <b>Runner</b></span></a><button type="button" class="btn icon sb-ciut-btn" id="sb-ciut" aria-expanded="${!ciut}" aria-label="${ciut ? 'Buka sidebar' : 'Ciutkan sidebar'}" title="${ciut ? 'Buka sidebar' : 'Ciutkan sidebar'} (tombol \\)">${ik(ciut ? 'M4 4h16v16H4zM9 4v16M13 9l3 3-3 3' : 'M4 4h16v16H4zM9 4v16M16 9l-3 3 3 3')}</button></div>`
  return `${kepala}<nav class="sb-nav" aria-label="Navigasi">
      ${nav('dasbor', '#/dasbor', 'Dashboard', ik('M4 13h6v7H4zM14 4h6v16h-6zM4 4h6v5H4z'))}
      ${nav('tugas', '#/tugas', 'Tugas saya', ik('M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 20a8 8 0 0 1 16 0'))}
      ${nav('workspace', '#/workspace', 'Workspace', ik('M3 5h18v10H3zM8 19h8M12 15v4'))}
      ${nav('skenario', '#/', 'Skenario', ik('M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z'))}
      ${nav('jalan', '#/jalan', 'Sedang berjalan', ik('M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM10 8.5v7l5.5-3.5z'), jalanAktif ? '<span class="sb-dot" aria-label="ada jalan aktif"></span>' : '')}
      ${nav('riwayat', '#/riwayat', 'Riwayat & laporan', ik('M12 3a9 9 0 1 0 0 18a9 9 0 0 0 0-18zM12 7v5l3 2'))}
    </nav>
    <div class="sb-label">Project</div>
    ${
      p
        ? `<div class="sb-proj">${tombolGrup('proj', buka('proj'), `<span class="sb-avatar" aria-hidden="true"${tip(p.nama)}>${esc(p.nama[0])}</span><b>${esc(p.nama)}</b><span class="n">${totalProject}</span>`, 'sb-proj-hd', p.nama)}
      ${isiGrup('proj', uji)}</div>`
        : ''
    }`
}

/** Sumber tugas: satu baris redup; dibuka → rincian singkat. */
function bagSumberTugas(tutup, plane = null) {
  const buka = terbuka(tutup, 'mcp')
  const judul = plane
    ? `<span class="sb-titik ok" aria-hidden="true"></span><span>Sumber tugas Plane · ${esc(plane.workspace)}/${esc(plane.project)}</span>`
    : '<span class="sb-titik" aria-hidden="true"></span><span>Sumber tugas Plane · belum tersambung</span>'
  const isi = plane
    ? `"Tugas saya" membaca isu ${esc(plane.project)} yang di-assign ke Anda di ${esc(hostDari(plane.url))} (hanya baca). Tiket tertaut tampil sebagai chip dari field "tiket".`
    : 'Isi PLANE_API_KEY di .env lalu nyalakan ulang panel untuk menampilkan "Tugas saya". Tiket tertaut tetap tampil sebagai chip dari field "tiket".'
  return `<section class="sb-bag sb-mcp">${tombolGrup('mcp', buka, judul, 'sb-mcp-hd', 'Sumber tugas Plane')}
      <div class="sb-isi sb-status dim" data-isi="mcp" id="${idGrup('mcp')}"${buka ? '' : ' hidden'}>${isi}</div></section>`
}

/** Origin tanpa skema untuk tampilan ringkas, mis. "localhost:5173". */
const hostDari = (u) => String(u ?? '').replace(/^https?:\/\//, '')

/**
 * Bagian bawah sidebar: Sasaran (server v2 lokal + tenant persona, tidak bisa diganti dari panel — alat ini
 * hanya menerima localhost), status lapisan Pemeriksaan, Sumber tugas (redup). Satu kisi rata kiri.
 * @param {{ web?: string, tenant?: string, db?: boolean, ui?: boolean } | null} info
 */
export function sidebarBawah(info = null, tutup = new Set()) {
  const buka = terbuka(tutup, 'sasaran')
  const lapis = (ok, nama, ket) =>
    `<li class="${ok ? 'ok-t' : 'dim'}" title="${esc(ket)}"><span aria-hidden="true">${ok ? '✓' : '○'}</span> ${nama}${ok ? '' : ' · tidak dikonfigurasi'}</li>`
  const isi = info
    ? `<div class="sb-baris sb-sasaran"><span class="sb-sasaran-host" title="${esc(info.web ?? '')}">${esc(hostDari(info.web))}</span><span class="chip">tenant ${esc(info.tenant ?? '?')}</span></div>
      <ul class="plain sb-lapis">${lapis(!!info.db, 'Pemeriksaan DB', 'V2_DATABASE_URL / V2_BACKEND_DIR di .env')}${lapis(!!info.ui, 'Pemeriksaan UI', 'V2_DIR di .env (check:design)')}</ul>
      <div class="sb-status dim">Hanya server v2 lokal; diatur di .env.</div>`
    : '<div class="sb-status dim">Memuat…</div>'
  return `<div class="sb-bawah" id="sb-bawah-modul">
    <section class="sb-bag" aria-labelledby="sb-h-sasaran">${tombolGrup('sasaran', buka, '<span class="sb-judul" id="sb-h-sasaran">Sasaran</span>', 'sb-bag-hd', 'Sasaran')}
      <div class="sb-isi sb-isi-bag" data-isi="sasaran" id="${idGrup('sasaran')}"${buka ? '' : ' hidden'}>${isi}</div></section>
    ${bagSumberTugas(tutup, info?.plane ?? null)}
  </div>`
}

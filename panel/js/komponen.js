// Komponen dasar panel v2 sebagai fungsi murni yang mengembalikan HTML (tanpa DOM), supaya bisa
// diuji Vitest dan dipakai ulang di semua layar. Gaya: panel/panel.css, token: panel/tokens.css.

/** Escape HTML untuk teks dan atribut. */
export const esc = (v) =>
  String(v ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )

/** Nada chip status: hanya untuk status (warna aktif lain abu/putih). */
export const NADA = ['ok', 'warn', 'bad', 'info', 'run', 'idle']

/** Chip status: teks 11 px di latar status 20 %. Teks selalu ada (status tidak dibedakan warna saja). */
export function chipStatus(teks, nada = 'idle') {
  const n = NADA.includes(nada) ? nada : 'idle'
  return `<span class="st-chip ${n}">${esc(teks)}</span>`
}

const SUMBER_TIKET = { plane: 'Plane', jira: 'Jira' }

/**
 * Chip tiket "Plane · FMS-63" (tanpa logo merek, lebar mengikuti isi). `ringkas` = tanpa nama sumber
 * (untuk tiket kedua dan seterusnya dari sumber yang sama). Tautan bila tiket punya url http(s).
 */
export function chipTiket(t, { ringkas = false } = {}) {
  const src = SUMBER_TIKET[t?.sumber] ?? ''
  const isi = `${!ringkas && src ? `<span class="src">${esc(src)} ·</span> ` : ''}${esc(t?.key ?? '')}`
  const judul = esc(`${src ? `${src} ` : ''}${t?.key ?? ''}`)
  return /^https?:\/\//.test(t?.url ?? '')
    ? `<a class="ticket" href="${esc(t.url)}" target="_blank" rel="noopener" title="${judul}">${isi}</a>`
    : `<span class="ticket" title="${judul}">${isi}</span>`
}

/** Deretan chip tiket: sumber ditulis sekali per kelompok sumber berurutan. */
export function chipTiketDaftar(tiket = []) {
  return tiket
    .map((t, i) => chipTiket(t, { ringkas: i > 0 && tiket[i - 1]?.sumber === t.sumber }))
    .join('')
}

// ── Format ─────────────────────────────────────────────────────────────────
export const dtk = (ms) =>
  `${(ms / 1000).toLocaleString('id-ID', { maximumFractionDigits: ms < 10_000 ? 1 : 0 })} dtk`
export const durasi = (ms) => {
  if (ms == null) return ''
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}
/** "4 mnt 12 dtk" untuk ringkasan. */
export const durasiPanjang = (ms) => {
  if (ms == null) return ''
  const s = Math.round(ms / 1000)
  const m = Math.floor(s / 60)
  return m ? `${m} mnt ${s % 60} dtk` : `${s} dtk`
}
export const kecil = (t) => (t ? t.charAt(0).toLowerCase() + t.slice(1) : '')
/** Jam:menit:detik gaya Indonesia (09.21.42). */
export const jamDetik = (iso) =>
  iso
    ? new Date(iso).toLocaleTimeString('id-ID', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    : ''

// ── Langkah ────────────────────────────────────────────────────────────────
/** Status tampilan langkah dari status runner + jeda. */
export function statusLangkah(s, { jeda = false } = {}) {
  switch (s?.status) {
    case 'lulus':
      // Lulus dengan cek lunak yang tidak terpenuhi: oranye seperti di laporan.
      return (s.cek ?? []).some((c) => c.lulus === false) ? 'peringatan' : 'lulus'
    case 'berjalan':
      return jeda ? 'aktif-jeda' : 'aktif-jalan'
    case 'gagal':
      return 'gagal'
    case 'dihentikan':
      return 'dihentikan'
    case 'dilompati':
      return 'dilewati'
    default:
      return 'menunggu'
  }
}
export const LABEL_LANGKAH = {
  lulus: 'lulus',
  'aktif-jalan': 'berjalan',
  'aktif-jeda': 'dijeda',
  gagal: 'gagal',
  dihentikan: 'dihentikan',
  dilewati: 'dilewati',
  menunggu: 'menunggu',
  peringatan: 'peringatan (cek lunak gagal)',
  'tidak-diperiksa': 'lulus, tanpa cek otomatis',
}

/** Opasitas langkah menunggu: makin pudar ke bawah (0,85 → 0,58). */
export function pudar(i, n) {
  if (n <= 1) return 0.85
  return Math.round((0.85 - (0.27 * i) / (n - 1)) * 100) / 100
}

/**
 * Rel langkah: lingkaran nomor vertikal. `pilih` = nomor langkah yang disorot (laporan); `hasil`
 * = fungsi opsional langkah → status tampilan (laporan memakai hasil cek, bukan status jalan).
 */
/** @param {any[]} steps @param {{ jeda?: boolean, pilih?: number | null, hasil?: ((s: any) => string) | null }} [o] */
export function relLangkah(steps = [], { jeda = false, pilih = null, hasil = null } = {}) {
  const st = steps.map((s) => (hasil ? hasil(s) : statusLangkah(s, { jeda })))
  const tunggu = st.filter((x) => x === 'menunggu').length
  let k = 0
  return `<ol class="rel" aria-label="Langkah">${steps
    .map((s, i) => {
      const x = st[i]
      const op = x === 'menunggu' ? ` style="opacity:${pudar(k++, tunggu)}"` : ''
      const aktif = x === 'aktif-jalan' || x === 'aktif-jeda'
      const label = `Langkah ${s.n}, ${LABEL_LANGKAH[x]}`
      return `<li><button type="button" class="rel-no s-${x}${pilih === s.n ? ' pilih' : ''}" data-n="${s.n}" aria-label="${esc(label)}" title="${esc(`${s.n}. ${s.title} — ${LABEL_LANGKAH[x]}`)}"${aktif || pilih === s.n ? ' aria-current="step"' : ''}${op}>${s.n}</button></li>`
    })
    .join('')}</ol>`
}

/** Teks status satu langkah di peta langkah. */
/** @param {any} s @param {string} x @param {{ aksi?: { teks: string } | null }} [o] */
export function subLangkah(s, x, { aksi = null } = {}) {
  if (x === 'lulus') return `Lulus${s.ms != null ? ` · ${dtk(s.ms)}` : ''}`
  if (x === 'aktif-jeda')
    return aksi ? `Dijeda · sebelum ${kecil(teksPengguna(aksi.teks))}` : 'Dijeda'
  if (x === 'aktif-jalan') {
    const j = s.aksi?.findIndex((a) => a.status === 'berjalan') ?? -1
    return s.aksi?.length
      ? `Berjalan · aksi ${j < 0 ? 1 : j + 1} dari ${s.aksi.length}`
      : 'Berjalan'
  }
  if (x === 'gagal') return `Gagal${s.error ? ` · ${s.error.slice(0, 80)}` : ''}`
  if (x === 'dihentikan') return 'Dihentikan'
  if (x === 'dilewati') return 'Dilewati (mulai dari langkah lain)'
  return ''
}

const TANDA_AKSI = { selesai: '✓', gagal: '×', berjalan: '•', dihentikan: '■', menunggu: '' }

/** Peta langkah melayang: rel + judul + status, garis penghubung. Langkah aktif memuat daftar aksinya. */
/** @param {any[]} steps @param {{ jeda?: boolean, aksi?: { teks: string } | null }} [o] */
export function petaLangkah(steps = [], { jeda = false, aksi = null } = {}) {
  return `<div class="peta-hd"><b>Peta langkah</b><span>Tertutup lagi saat Lanjut</span></div><ol class="peta">${steps
    .map((s) => {
      const x = statusLangkah(s, { jeda })
      const sub = subLangkah(s, x, { aksi })
      const aktif = x === 'aktif-jalan' || x === 'aktif-jeda'
      const daftar =
        aktif && s.aksi?.length
          ? `<ol class="peta-aksi">${s.aksi.map((a) => `<li class="a-${esc(a.status)}"><span aria-hidden="true">${TANDA_AKSI[a.status] ?? ''}</span>${esc(teksPengguna(a.teks))}</li>`).join('')}</ol>`
          : ''
      return `<li class="s-${x}"${aktif ? ' aria-current="step"' : ''}><span class="peta-no rel-no s-${x}" aria-hidden="true">${s.n}</span><div class="peta-tx"><div class="peta-t">${esc(s.title)}${s.belakang ? ' <span class="tag">API</span>' : ''}</div>${sub ? `<div class="peta-s">${esc(sub)}</div>` : ''}${daftar}</div></li>`
    })
    .join('')}</ol>`
}

// ── Kartu deskripsi langkah ────────────────────────────────────────────────
/** Langkah yang diceritakan kartu: aktif, gagal/dihentikan, terakhir lulus, atau langkah awal. */
export function langkahKini(r) {
  if (!r) return null
  if (r.current_step != null) return r.steps[r.current_step] ?? null
  return (
    r.steps.find((s) => s.status === 'gagal' || s.status === 'dihentikan') ??
    (r.status === 'selesai' ? r.steps.at(-1) : null) ??
    [...r.steps].reverse().find((s) => s.status === 'lulus') ??
    r.steps[r.from_step ?? 0] ??
    null
  )
}

export function aksiKini(r) {
  const s = r?.current_step != null ? r.steps[r.current_step] : null
  return s && r.current_aksi != null ? (s.aksi[r.current_aksi] ?? null) : null
}

/** Cek lunak yang tidak terpenuhi di jalan ini (tidak menggagalkan langkah, tetapi perlu dicatat). */
export const lunakGagal = (r) =>
  (r?.steps ?? []).flatMap((s) => s.cek ?? []).filter((c) => c.lulus === false && c.lunak).length

const PERAN_ARIA = {
  radiogroup: 'pilihan',
  radio: 'pilihan',
  tablist: 'deret tab',
  tab: 'tab',
  textbox: 'isian',
  searchbox: 'isian cari',
  spinbutton: 'isian angka',
  button: 'tombol',
  link: 'tautan',
  checkbox: 'kotak centang',
  switch: 'sakelar',
  combobox: 'pilihan',
  listbox: 'daftar pilihan',
  option: 'opsi',
  heading: 'judul',
  region: 'bagian',
  dialog: 'laci',
  row: 'baris',
  cell: 'sel',
  listitem: 'butir',
  menuitem: 'menu',
  img: 'gambar',
}
const UUID_RUTE = /\/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|\/[0-9a-f]{8}…/gi

/**
 * Teks aksi/cek untuk pengguna panel: placeholder yang belum terisi, id elemen (#…), peran ARIA, dan rute
 * diterjemahkan. Uraian mentah tetap dipakai di log/CLI dan pesan galat untuk penulis skenario.
 */
export function teksPengguna(t) {
  return String(t ?? '')
    .replace(/\{([A-Za-z_][\w.]*)\}/g, (_, k) => `‹${k.replace(/[._]+/g, ' ')}›`)
    .replace(/(^|[\s(])#([A-Za-z][\w-]*)/g, (_, a, id) => `${a}elemen “${id.replace(/-/g, ' ')}”`)
    .replace(/\b([a-z]+)(?= “)/g, (m) => PERAN_ARIA[m] ?? m)
    .replace(/^Buka (\/[^\s(]*)/, (_, r) => {
      const h = r.replace(UUID_RUTE, '').replace(/^\//, '').replace(/[-/]+/g, ' ').trim()
      return `Buka halaman ${h || 'awal'}`
    })
}

/** Aksi nyata berikutnya untuk kartu: lewati keterangan (banner) yang tidak bermakna sebagai aksi. */
export function aksiBerikutnya(s, j) {
  const daftar = s?.aksi ?? []
  for (let i = j ?? 0; i < daftar.length; i++)
    if (!daftar[i]?.teks?.startsWith('Keterangan ')) return daftar[i]
  return null
}

/** Chip status jalan untuk kartu (teks + nada). */
/** @param {any} r @param {{ satuAksi?: boolean }} [o] */
export function chipJalan(r, { satuAksi = false } = {}) {
  switch (r?.status) {
    case 'menyiapkan':
      return { t: 'Menyiapkan', n: 'run' }
    case 'siap':
      return { t: 'Data siap', n: 'idle' }
    case 'berjalan':
      return satuAksi ? { t: 'Satu aksi', n: 'info' } : { t: 'Berjalan', n: 'run' }
    case 'jeda':
      return satuAksi ? { t: 'Satu aksi', n: 'info' } : { t: 'Dijeda', n: 'warn' }
    case 'gagal':
      return { t: 'Gagal', n: 'bad' }
    case 'selesai':
      return lunakGagal(r) ? { t: 'Selesai dengan catatan', n: 'warn' } : { t: 'Selesai', n: 'ok' }
    case 'dihentikan':
      return { t: 'Dihentikan', n: 'idle' }
    default:
      return { t: r?.status ?? 'Tidak ada jalan', n: 'idle' }
  }
}

/**
 * Kolom kanan runner: kartu deskripsi langkah + kartu kecil "Berikutnya". Isi mengikuti keadaan jalan
 * (menyiapkan, siap, berjalan, dijeda, satu aksi, gagal, selesai, dihentikan).
 * opsi: satuAksi, logTerakhir, hrefLaporan, antrean (judul skenario berikutnya).
 */
/** @param {any} r @param {{ satuAksi?: boolean, logTerakhir?: string, hrefLaporan?: string | null, antrean?: string | null }} [o] */
export function kartuLangkah(r, o = {}) {
  if (!r) return ''
  const s = langkahKini(r)
  const ak = aksiKini(r)
  const c = chipJalan(r, o)
  const mulai = !!r.started_at
  const kepala = `<div class="kartu-hd">${chipStatus(c.t, c.n)}<span>${s && mulai ? `Langkah ${s.n}${s.who_name ? ` · ${esc(s.who_name)}` : ''}` : esc(r.title)}</span></div>`
  let isi = ''
  if (r.status === 'menyiapkan') {
    isi = `<h1>${esc(r.title)}</h1><p>Menyiapkan data lewat API…</p>${o.logTerakhir ? `<div class="kartu-mono">${esc(o.logTerakhir)}</div>` : ''}`
  } else if (r.status === 'siap' && !mulai) {
    isi = `<h1>${esc(r.title)}</h1><p>Data siap. Tekan Putar.</p>`
  } else if (s) {
    const harus = `<div class="kartu-box"><div class="k">Harus terlihat</div><div class="v">${esc(s.expect)}</div></div>`
    const desk = s.deskripsi ? `<p>${esc(s.deskripsi)}</p>` : ''
    // Keterangan aksi banner (tidak digambar di halaman aplikasi, tampil di sini).
    const aktif = r.status === 'berjalan' || r.status === 'jeda'
    const ket =
      aktif && r.keterangan ? `<div class="kartu-ket" role="status">${esc(r.keterangan)}</div>` : ''
    const aksiKet = ak?.teks?.startsWith('Keterangan ')
    const nyata = aksiBerikutnya(s, r.current_aksi)
    let bawah = ''
    if (r.status === 'jeda' && ak)
      bawah = `<div class="kartu-aksi"><span>Aksi berikutnya: ${esc(nyata ? kecil(teksPengguna(nyata.teks)) : 'lanjut ke langkah berikutnya')}</span><kbd>Spasi</kbd></div>`
    else if (r.status === 'berjalan' && ak && !aksiKet)
      bawah = `<div class="kartu-aksi"><span>Sedang: ${esc(kecil(teksPengguna(ak.teks)))}</span></div>`
    let akhir = ''
    if (r.status === 'gagal') {
      const ga = s.aksi?.find((a) => a.status === 'gagal')
      akhir = `<div class="kartu-err" role="alert"><b>${s.status === 'gagal' ? `Gagal di langkah ${s.n}` : 'Siapkan data gagal'}</b>${ga ? `<div class="dim">Aksi: ${esc(ga.teks)}</div>` : ''}<div class="kartu-mono">${esc(s.error ?? r.error ?? '')}</div><div class="dim">Screenshot di kiri diambil saat gagal.</div></div>`
    } else if (r.status === 'selesai') {
      const lulus = r.steps.filter((x) => x.status === 'lulus').length
      const lunak = lunakGagal(r)
      akhir = `<div class="kartu-ok"><b>Lulus ${lulus}/${r.steps.length - (r.from_step ?? 0)} langkah</b> dalam ${esc(durasiPanjang(r.duration_ms))}${r.findings?.length ? ` · ${r.findings.length} temuan` : ''}${lunak ? `<div class="warn-t">Dengan catatan: ${lunak} cek lunak tidak terpenuhi — lihat laporan.</div>` : ''}${r.cleanup_error ? `<div class="warn-t">Pembersihan: ${esc(r.cleanup_error)}</div>` : ''}</div>`
    } else if (r.status === 'dihentikan') {
      akhir = `<div class="kartu-ok"><b>Dihentikan di langkah ${s.n}.</b> Bisa diulang dari langkah ini.</div>`
    }
    const tautan =
      o.hrefLaporan && ['gagal', 'selesai', 'dihentikan'].includes(r.status)
        ? `<a class="kartu-link" href="${esc(o.hrefLaporan)}">Lihat laporan →</a>`
        : ''
    isi = `<h1>${esc(s.title)}</h1>${desk}${harus}${ket}${bawah}${akhir}${tautan}`
  } else if (r.status === 'gagal') {
    isi = `<h1>${esc(r.title)}</h1><div class="kartu-err" role="alert"><b>Siapkan data gagal</b><div class="kartu-mono">${esc(r.error ?? '')}</div></div>`
  }
  const kartu = `<div class="kartu glass" aria-live="polite">${kepala}${isi}</div>`
  // Kartu kecil: langkah berikutnya (selama jalan), atau skenario berikutnya di antrean.
  let next = ''
  const aktif = ['menyiapkan', 'siap', 'berjalan', 'jeda'].includes(r.status)
  const nx = aktif && s ? r.steps[s.n] : null
  if (nx)
    next = `<div class="kartu-next glass"><span class="rel-no s-menunggu" aria-hidden="true">${nx.n}</span><span class="t">Berikutnya: ${esc(nx.title)}</span><span class="tag">${nx.belakang ? 'API' : ''}</span></div>`
  else if (!aktif && o.antrean)
    next = `<div class="kartu-next glass"><span class="t">Berikutnya di antrean: ${esc(o.antrean)}</span></div>`
  return kartu + next
}

/** Cincin target di atas screenshot (posisi % dari bbox relatif 0–1). Hanya saat dijeda. */
/** @param {any} target */
export function cincinTarget(target) {
  const b = target?.bbox
  if (!b || !(b.w > 0) || !(b.h > 0)) return null
  const pct = (v) => `${Math.round(v * 10_000) / 100}%`
  const pil = target.viewport ? b.h * target.viewport.h < 64 : true
  return {
    left: pct(b.x),
    top: pct(b.y),
    width: pct(b.w),
    height: pct(b.h),
    radius: pil ? '999px' : '12px',
  }
}

// ── Kerangka runner ────────────────────────────────────────────────────────
const JENIS_TEMUAN = { bug: 'Bug aplikasi', skenario: 'Skenario salah', catatan: 'Catatan' }

/** Kerangka DOM layar runner (diisi bagian demi bagian oleh panel; dipakai juga uji tata letak). */
export function kerangkaRunner() {
  return `<div class="rn" id="rn">
    <div class="rn-stage">
      <div class="rn-area" id="rn-area">
        <div class="rn-shot" id="rn-shot">
          <img id="live-img" alt="Layar aplikasi dari jendela skenario" hidden>
          <div class="rn-wait" id="rn-wait"></div>
          <div class="rn-ring" id="rn-ring" hidden aria-hidden="true"></div>
          <div class="rn-pill glass" id="rn-pill" hidden></div>
        </div>
        <div class="rn-note" id="rn-note">
          <label for="temuan">Catat temuan · T</label>
          <input id="temuan" class="field" type="text" autocomplete="off" placeholder="Apa yang terlihat dan apa yang seharusnya…  (screenshot ikut tersimpan)">
          <select id="temuan-jenis" aria-label="Jenis temuan">${Object.entries(JENIS_TEMUAN)
            .map(([k, l]) => `<option value="${k}">${l}</option>`)
            .join('')}</select>
          <span class="info" id="temuan-info"></span>
        </div>
      </div>
    </div>
    <aside class="rn-rel glass" id="rn-rel" aria-label="Rel langkah"></aside>
    <aside class="rn-peta glass" id="rn-peta" aria-label="Peta langkah" hidden></aside>
    <section class="rn-side" id="rn-side" aria-label="Deskripsi langkah"></section>
  </div>`
}

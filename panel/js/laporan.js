// Layar Laporan v2 sebagai fungsi murni yang mengembalikan HTML. Data dari
// GET /api/runs/<id> (result.json + laporan_data dari src/core/laporan-data.ts). Diuji Vitest.
import { chipStatus, durasiPanjang, esc, jamDetik, relLangkah, teksPengguna } from './komponen.js'

/** Status hasil langkah (laporan-data) → kelas rel langkah. */
export const REL_HASIL = {
  lulus: 'lulus',
  gagal: 'gagal',
  peringatan: 'peringatan',
  tidak_diperiksa: 'tidak-diperiksa',
  menunggu: 'menunggu',
  dilewati: 'dilewati',
  dihentikan: 'dihentikan',
}

const hasilLangkah = (ld, n) => ld?.langkah?.find((l) => l.n === n)

/** @param {any} r @param {any} ld @param {number | null} pilih */
export function relHasil(r, ld, pilih) {
  return relLangkah(r.steps, {
    pilih,
    hasil: (s) => REL_HASIL[hasilLangkah(ld, s.n)?.status] ?? 'menunggu',
  })
}

/** Langkah awal yang dipilih: gagal pertama, lalu peringatan, lalu yang punya cek. */
export function langkahAwal(ld) {
  const l = ld?.langkah ?? []
  return (
    l.find((x) => x.status === 'gagal') ??
    l.find((x) => x.status === 'peringatan') ??
    l.find((x) => x.total > 0) ??
    l[0]
  )?.n
}

/** Cek terpilih di langkah n: id yang diminta, gagal pertama, atau yang pertama. */
/** @param {any} ld @param {number} n @param {string | null} [id] */
export function cekTerpilih(ld, n, id = null) {
  const cs = (ld?.cek ?? []).filter((c) => c.langkah === n)
  return (
    cs.find((c) => c.id === id) ??
    cs.find((c) => c.lulus === false && !c.lunak) ??
    cs.find((c) => c.lulus === false) ??
    cs[0] ??
    null
  )
}

/** Kotak merah di atas screenshot (persen dari bbox relatif 0–1). */
export function kotakMerah(bbox) {
  if (!bbox || !(bbox.w > 0) || !(bbox.h > 0)) return null
  const p = (v) => `${Math.round(v * 10_000) / 100}%`
  return { left: p(bbox.x), top: p(bbox.y), width: p(bbox.w), height: p(bbox.h) }
}

const TEKS_HASIL = {
  selesai: ['Lulus', 'ok'],
  gagal: ['Gagal', 'bad'],
  dihentikan: ['Dihentikan', 'idle'],
}

/** Kartu ringkasan: hasil + teks silang utama, lalu UI x/y, Database x/y, Temuan. */
export function kartuRingkasan(r, ld) {
  const rs = ld.ringkasan
  const catatan = r.status === 'selesai' && rs.ui.lunak > 0
  const [t, n] = catatan
    ? ['Lulus dengan catatan', 'warn']
    : (TEKS_HASIL[r.status] ?? [r.status, 'idle'])
  const kerasGagal = rs.ui.gagal - (rs.ui.lunak ?? 0)
  const ui = kerasGagal
    ? `${kerasGagal} cek UI gagal${rs.ui.lunak ? ` · ${rs.ui.lunak} cek lunak tidak terpenuhi` : ''}`
    : rs.ui.lunak
      ? `${rs.ui.lunak} cek lunak tidak terpenuhi`
      : 'Semua cek UI lulus'
  const sub = rs.silang
    ? `${rs.silang.teks} · langkah ${rs.silang.langkah}`
    : rs.ui.total
      ? ui
      : 'Belum ada cek UI otomatis'
  const db =
    ld.db.status !== 'tersedia'
      ? `<div class="angka-k">Database</div><div class="angka-v">–</div><div class="angka-s">${ld.db.status === 'dilewati' ? 'dilewati' : ld.db.status === 'galat' ? 'tidak dicatat' : 'tidak dikonfigurasi'}</div>`
      : `<div class="angka-k">Database</div><div class="angka-v">${rs.db.total ? `${rs.db.cocok}<small> / ${rs.db.total}</small>` : `${rs.db.transaksi}<small> transaksi</small>`}</div>${rs.db.total ? '' : '<div class="angka-s">tanpa pernyataan data</div>'}`
  return `<div class="kartu glass lp-ring"><div class="kartu-hd">${chipStatus(t, n)}<span>${esc(sub)}</span></div>
    <div class="angka"><div><div class="angka-k">UI</div><div class="angka-v">${rs.ui.lulus}<small> / ${rs.ui.total}</small></div></div><div>${db}</div><div><div class="angka-k">Temuan</div><div class="angka-v">${rs.temuan}</div></div></div></div>`
}

/** Kalimat penjelasan satu cek, disilangkan dengan data langkah yang sama. */
export function penjelasanCek(c, l, t) {
  if (!c) return ''
  if (c.lulus === null)
    return 'Tidak diperiksa otomatis: tambahkan `cek` atau `pastikanTerlihat` di langkah ini supaya hasilnya bisa dinilai.'
  const p = t?.pernyataan ?? { cocok: 0, total: 0 }
  const trx = t ? `transaksi #${t.no}` : null
  if (c.lulus) {
    if (l?.silang === 'tampilan_sesuai_data_salah')
      return `Layar sesuai harapan, tetapi pernyataan data langkah ini tidak cocok (${p.cocok}/${p.total}${trx ? `, ${trx}` : ''}).`
    return 'Cek lulus.'
  }
  if (l?.silang === 'data_benar_tampilan_salah')
    return `Database sudah mencatat yang dinyatakan (${p.cocok}/${p.total} pernyataan cocok, ${trx}), tetapi layar tidak menampilkan yang diharapkan.`
  if (l?.silang === 'data_dan_tampilan_salah')
    return `Layar dan data sama-sama tidak sesuai: pernyataan data ${p.cocok}/${p.total}${trx ? ` (${trx})` : ''}.`
  if (c.jenis === 'langkah') return `Langkah berhenti karena aksi gagal: ${c.terlihat ?? ''}`
  const data = t
    ? `Perubahan data langkah ini: ${trx}, ${t.baris} baris.`
    : 'Tidak ada perubahan data tercatat di langkah ini.'
  return `Layar tidak menampilkan yang diharapkan. ${data}${p.total ? '' : ' Belum ada pernyataan data di langkah ini, jadi kebenaran datanya tidak diklaim.'}`
}

const SELECTOR = /#[A-Za-z{][\w{}.-]*/
/**
 * Uraian cek untuk manusia. Cek bersasaran id/selector tidak menampilkan selector mentah sebagai judul
 * dan "Diharapkan": pakai uraian yang dicatat runner (`teknis` = selector asli), atau untuk jalan lama
 * pakai "Harus terlihat" langkah; selector mentahnya jadi rincian teknis.
 */
/** @param {any} c @param {string | null} [harusTerlihat] */
export function uraianCek(c, harusTerlihat = null) {
  const u = uraianCekMentah(c, harusTerlihat)
  return { judul: teksPengguna(u.judul), diharapkan: teksPengguna(u.diharapkan), teknis: u.teknis }
}

function uraianCekMentah(c, harusTerlihat) {
  if (c.teknis) return { judul: c.judul, diharapkan: c.diharapkan, teknis: c.teknis }
  if (c.jenis !== 'nilai' && SELECTOR.test(c.diharapkan ?? '') && harusTerlihat)
    return { judul: `Harus terlihat: ${harusTerlihat}`, diharapkan: harusTerlihat, teknis: c.judul }
  if (c.jenis === 'nilai' && SELECTOR.test(c.judul ?? ''))
    return { judul: c.judul.replace(SELECTOR, 'elemen'), diharapkan: c.diharapkan, teknis: c.judul }
  return { judul: c.judul, diharapkan: c.diharapkan, teknis: null }
}

const TANDA = (c) => (c.lulus === null ? '–' : c.lulus ? '✓' : '×')

/** Kartu detail cek terpilih: Diharapkan vs Terlihat, penjelasan, Buka trace, Lihat transaksi #n. */
/** @param {any} r @param {any} ld @param {any} c @param {{ trace?: boolean, traceDihapus?: boolean }} [o] */
export function kartuCek(r, ld, c, { trace = false, traceDihapus = false } = {}) {
  if (!c) return '<div class="kartu glass"><p>Langkah ini belum punya hasil cek.</p></div>'
  const s = r.steps.find((x) => x.n === c.langkah)
  const l = hasilLangkah(ld, c.langkah)
  const t = l?.transaksi ? ld.transaksi.find((x) => x.no === l.transaksi) : null
  const gagal = c.lulus === false
  const daftar = (ld.cek ?? []).filter((x) => x.langkah === c.langkah)
  const u = uraianCek(c, s?.expect)
  return `<div class="kartu glass"><div class="kartu-hd"><span>Langkah ${c.langkah} · cek ${esc(c.id)}${s?.who_name ? ` · ${esc(s.who_name)}` : ''}</span></div>
    <h1>${esc(s?.title ?? c.judul)}</h1>
    <div class="lp-judul-cek">${esc(u.judul)}</div>
    ${u.teknis ? `<div class="lp-teknis" title="Rincian teknis">${esc(u.teknis)}</div>` : ''}
    <div class="dvt"><div class="dvt-b"><div class="k">Diharapkan</div><div class="v">${esc(u.diharapkan)}</div></div><div class="dvt-b${gagal ? ' gagal' : ''}"><div class="k">Terlihat</div><div class="v">${esc(c.terlihat ?? 'tidak diperiksa otomatis')}</div></div></div>
    <p>${esc(penjelasanCek(c, l, t))}</p>
    <div class="lp-aksi">${trace ? '<button type="button" class="btn tb" id="lp-trace" title="Salin perintah membuka trace Playwright jalan ini">Buka trace</button>' : traceDihapus ? '<button type="button" class="btn tb" disabled title="Trace jalan ini sudah dihapus untuk menghemat disk; laporan dan screenshot tetap">Buka trace · dihapus</button>' : ''}${t ? `<a class="btn tb" href="#/laporan/${esc(r.run_id)}/db/${t.no}">Lihat transaksi #${t.no}</a>` : '<span class="dim">Tanpa transaksi di langkah ini</span>'}</div>
    ${daftar.length > 1 ? `<ol class="lp-ceks" aria-label="Cek di langkah ${c.langkah}">${daftar.map((x) => `<li><a href="#/laporan/${esc(r.run_id)}/ui/${esc(x.id)}" class="${x.id === c.id ? 'pilih' : ''} ${x.lulus === false ? 'bad-t' : ''}"${x.id === c.id ? ' aria-current="true"' : ''}><span aria-hidden="true">${TANDA(x)}</span><span>${esc(x.id)} ${esc(uraianCek(x, s?.expect).judul)}${uraianCek(x, s?.expect).teknis ? `<span class="lp-teknis">${esc(uraianCek(x, s?.expect).teknis)}</span>` : ''}</span></a></li>`).join('')}</ol>` : ''}
  </div>`
}

/** Deretan kartu per langkah: "5 · 1/2" + judul singkat; merah bila gagal. */
export function kartuLangkahHasil(r, ld, pilih) {
  return `<ol class="lp-steps">${ld.langkah
    .map((l) => {
      const st = { gagal: 'gagal', peringatan: 'warn', lulus: 'ok' }[l.status] ?? ''
      const angka = l.total ? `${l.lulus}/${l.total}` : l.status === 'tidak_diperiksa' ? '–' : ''
      return `<li><a href="#/laporan/${esc(r.run_id)}/ui/${l.n}" class="lp-step ${st}${pilih === l.n ? ' pilih' : ''}"${pilih === l.n ? ' aria-current="step"' : ''}><span class="h"><b>${l.n}</b><span>${angka}</span></span><span class="t">${esc(l.judul)}</span></a></li>`
    })
    .join('')}</ol>`
}

// ── Transaksi database ─────────────────────────────────────────────────────
export const LABEL_SUMBER = {
  layar: 'Layar',
  api: 'API',
  'layar+api': 'Layar + API',
  sistem: 'Sistem',
  tanpa: '—',
}

/** Filter sumber (semua | layar | api) dan cari nama tabel/kolom. */
export function saringTransaksi(list, filter = 'semua', q = '') {
  const cari = q.trim().toLowerCase()
  return list.filter((t) => {
    if (filter === 'layar' && !t.sumber.includes('layar')) return false
    if (filter === 'api' && !t.sumber.includes('api')) return false
    if (!cari) return true
    return t.perubahan.some(
      (p) =>
        p.tabel.toLowerCase().includes(cari) ||
        p.baris.some((b) => b.kolom.some((k) => k.kolom.toLowerCase().includes(cari))),
    )
  })
}

/** Daftar tabel ringkas untuk sel tabel: 3 pertama + "+n tabel". */
export function ringkasTabel(tabel, maks = 3) {
  if (!tabel.length) return '–'
  return tabel.length > maks
    ? `${tabel.slice(0, maks).join(', ')} +${tabel.length - maks} tabel`
    : tabel.join(', ')
}

/** Sel kolom Tabel: nama tabel satu per baris (tidak dipenggal di tengah kata), maks 3 + "+n tabel". */
export function selTabel(tabel, maks = 3) {
  if (!tabel.length) return '–'
  const lebih = tabel.length > maks ? tabel.length - maks : 0
  return `${tabel
    .slice(0, maks)
    .map((t) => `<span class="tb-n">${esc(t)}</span>`)
    .join('')}${lebih ? `<span class="tb-n dim">+${lebih} tabel</span>` : ''}`
}

export function tabelTransaksi(list, pilih) {
  if (!list.length)
    return '<div class="empty">Tidak ada transaksi yang cocok dengan saringan.</div>'
  const kelas = { '4xx': 'bad-t', '5xx': 'bad-t', '3xx': 'warn-t', '2xx': 'ok-t' }
  return `<div class="lp-tabel-wrap"><table class="lp-tabel"><thead><tr><th>#</th><th>Waktu</th><th>Langkah</th><th>Sumber</th><th>Tabel</th><th>Operasi</th><th class="kanan">Baris</th><th>Request</th><th>Pernyataan</th></tr></thead><tbody>${list
    .map(
      (t) =>
        `<tr class="${t.no === pilih ? 'pilih' : ''}" data-trx="${t.no}" tabindex="0"${t.no === pilih ? ' aria-selected="true"' : ''}><td class="dim">${t.no}</td><td>${esc(jamDetik(t.waktu))}</td><td>${esc(t.label)}</td><td>${LABEL_SUMBER[t.sumber] ?? t.sumber}</td><td class="mono tb-sel" title="${esc(t.tabel.join(', '))}">${selTabel(t.tabel)}</td><td>${t.operasi.join(', ') || '–'}</td><td class="kanan">${t.baris}</td><td class="${kelas[t.request.terburuk] ?? 'dim'}">${t.request.jumlah ? `${t.request.jumlah} · ${t.request.terburuk}` : '–'}</td><td class="${t.pernyataan.total && t.pernyataan.cocok < t.pernyataan.total ? 'bad-t' : ''}">${t.pernyataan.total ? `${t.pernyataan.cocok} / ${t.pernyataan.total}` : '—'}</td></tr>`,
    )
    .join('')}</tbody></table></div>`
}

export function chipTabel(tabel, q) {
  return `<div class="lp-chips">${tabel
    .map(
      (t) =>
        `<button type="button" class="lp-chip${q === t.tabel ? ' pilih' : ''}" data-tabel="${esc(t.tabel)}" aria-pressed="${q === t.tabel}"><span class="mono">${esc(t.tabel)}</span> <span class="dim">${t.baris}</span></button>`,
    )
    .join('')}</div>`
}

export function kartuRingkasanDb(ld) {
  const d = ld.ringkasan.db
  return `<div class="kartu glass lp-ring"><div class="angka"><div><div class="angka-k">Transaksi</div><div class="angka-v">${d.transaksi}</div></div><div><div class="angka-k">Baris</div><div class="angka-v">${d.baris}</div></div><div><div class="angka-k">Cocok</div><div class="angka-v">${d.total ? `${d.cocok}<small> / ${d.total}</small>` : '–'}</div>${d.total ? '' : '<div class="angka-s">tanpa pernyataan</div>'}</div></div></div>`
}

const NILAI_MAKS = 42
/** Nilai kolom untuk diff: null = ∅, objek = JSON, dipendekkan. */
export function nilaiPendek(v) {
  const t = v == null ? '∅' : typeof v === 'object' ? JSON.stringify(v) : String(v)
  return t.length > NILAI_MAKS ? `${t.slice(0, NILAI_MAKS - 1)}…` : t
}
const PENTING =
  /^(status|.*_status|number|.*number|.*_qty|qty|quantity.*|on_hand|.*_rupiah|name|nama|code|kode)$/
const DISEMBUNYIKAN = new Set(['updated_at', 'created_at'])
const pendekKunci = (k) => (/^[0-9a-f]{8}-/.test(k) ? `${k.slice(0, 8)}…` : nilaiPendek(k))

/**
 * Perubahan kolom per baris sebagai tabel dua kolom yang terbaca: Kolom | lama → baru (UPDATE), nilai
 * baru (INSERT) atau nilai lama (DELETE). UPDATE dulu; dibatasi `maks` baris; updated_at disembunyikan.
 */
export function diffHtml(perubahan, maks = 12) {
  const URUT = { UPDATE: 0, DELETE: 1, INSERT: 2 }
  const semua = perubahan
    .flatMap((p) => p.baris.map((b) => ({ p, b })))
    .sort((x, y) => URUT[x.b.operasi] - URUT[y.b.operasi])
  const tampil = semua.slice(0, maks)
  const blok = tampil.map(({ p, b }) => {
    // Kepala blok: chip operasi + nilai kunci. Baris ber-id: "id d9032c60…". Baris ringkasan tanpa
    // id (query hitungan di laporan Kerja): nilai kolom kuncinya + "kunci: <kolom>".
    const [opTeks, opNada] = {
      INSERT: ['+ baru', 'ok'],
      DELETE: ['− hapus', 'bad'],
      UPDATE: ['~ berubah', 'warn'],
    }[b.operasi]
    const kunci = b.kunci ? (p.kunciKolom ? b.kunci : `id ${pendekKunci(b.kunci)}`) : ''
    const op = `${opTeks}${kunci ? ` ${kunci}` : ''}`
    let baris = []
    let sembunyi = false
    if (b.operasi === 'UPDATE') {
      const k = b.kolom.filter((x) => !DISEMBUNYIKAN.has(x.kolom))
      sembunyi = k.length < b.kolom.length
      baris = k.map(
        (x) =>
          `<tr><th scope="row">${esc(x.kolom)}</th><td><span class="lama">${esc(nilaiPendek(x.dari))}</span> <span aria-hidden="true">→</span><span class="sr"> menjadi </span> <span class="baru">${esc(nilaiPendek(x.ke))}</span></td></tr>`,
      )
    } else {
      const penting = b.kolom.filter((x) => PENTING.test(x.kolom)).slice(0, 4)
      const k = penting.length ? penting : b.kolom.filter((x) => x.kolom !== 'id').slice(0, 3)
      baris = k.map(
        (x) =>
          `<tr><th scope="row">${esc(x.kolom)}</th><td><span class="${b.operasi === 'INSERT' ? 'baru' : 'lama'}">${esc(nilaiPendek(b.operasi === 'INSERT' ? x.ke : x.dari))}</span></td></tr>`,
      )
    }
    return `<div class="df-blok"><div class="df-kepala">${p.sembunyiTabel ? '' : `<span class="mono">${esc(p.tabel)}</span>`}${chipStatus(opTeks, opNada)}${kunci ? `<b class="mono">${esc(kunci)}</b>` : ''}${p.kunciKolom?.length ? `<span class="mono df-kunci">kunci: ${esc(p.kunciKolom.join(' · '))}</span>` : ''}</div><table class="df-t" aria-label="${esc(`${p.tabel} · ${op}`)}"><tbody>${baris.join('')}${sembunyi ? '<tr><th scope="row" class="dim">updated_at</th><td class="dim">ikut berubah</td></tr>' : ''}</tbody></table></div>`
  })
  const sisa = semua.length - tampil.length
  return (
    blok.join('') +
    (sisa ? `<div class="dim df-sisa">… ${sisa} baris lagi (laporan.md / result.json)</div>` : '')
  )
}

/** Kartu detail transaksi: perubahan kolom, pernyataan data, request, catatan silang ke cek UI. */
export function kartuTransaksi(r, ld, t) {
  if (!t) return ''
  const s = t.langkah ? r.steps.find((x) => x.n === t.langkah) : null
  const l = t.langkah ? hasilLangkah(ld, t.langkah) : null
  const judul =
    s?.title ??
    (t.label === 'Siapkan' ? 'Siapkan data lewat API' : 'Capai: data dibawa ke awal langkah')
  const cekGagal = (ld.cek ?? []).find(
    (c) => c.langkah === t.langkah && c.lulus === false && c.jenis !== 'langkah',
  )
  const silang =
    l?.silang === 'data_benar_tampilan_salah' && cekGagal
      ? `Data benar, tetapi layar langkah ${t.langkah} menampilkan “${esc(cekGagal.terlihat ?? '')}”. <a href="#/laporan/${esc(r.run_id)}/ui/${esc(cekGagal.id)}">Lihat cek UI ${esc(cekGagal.id)}</a>`
      : l?.silang === 'tampilan_sesuai_data_salah'
        ? `Tampilan sesuai, tetapi data salah: pernyataan ${t.pernyataan.cocok}/${t.pernyataan.total} cocok. <a href="#/laporan/${esc(r.run_id)}/ui/${t.langkah}">Lihat cek UI langkah ${t.langkah}</a>`
        : l?.silang === 'data_dan_tampilan_salah'
          ? `Data dan tampilan sama-sama salah. <a href="#/laporan/${esc(r.run_id)}/ui/${t.langkah}">Lihat cek UI langkah ${t.langkah}</a>`
          : cekGagal
            ? `Cek UI ${esc(cekGagal.id)} di langkah ini gagal. <a href="#/laporan/${esc(r.run_id)}/ui/${esc(cekGagal.id)}">Lihat cek UI</a>`
            : ''
  const req = t.requests.length
    ? `<div class="lp-req">${t.requests.map((q) => `<div><span class="m">${esc(q.method)}</span> <span title="${esc(q.pathAsli)}">${esc(q.path)}</span> <span class="${q.status >= 400 ? 'bad-t' : 'dim'}">→ ${q.status}</span>${q.sumber === 'api' ? ' <span class="dim">· API</span>' : ''}</div>`).join('')}</div>`
    : `<div class="dim lp-req">${t.baris ? 'Tanpa request tulis tercatat: baris diubah sistem.' : 'Tanpa request tulis dan tanpa baris berubah; hanya pernyataan data yang dinilai.'}</div>`
  const jumlahBaris = t.perubahan.reduce((n, p) => n + p.baris.length, 0)
  const bagian = (judul, isi, kelas = '') =>
    `<section class="kt-bag ${kelas}"><h2>${judul}</h2>${isi}</section>`
  return `<div class="kartu glass kartu-trx"><div class="kartu-hd"><span>Transaksi #${t.no} · ${t.langkah ? `langkah ${t.langkah}` : esc(t.label)}${t.sumber === 'tanpa' ? '' : ` · ${LABEL_SUMBER[t.sumber]}`}</span></div>
    <h1>${esc(judul)}</h1>
    ${bagian(`Perubahan data <span class="dim">· ${jumlahBaris} baris</span>`, t.perubahan.length ? `<div class="df">${diffHtml(t.perubahan)}</div>` : '<p class="dim">Tidak ada baris tenant yang berubah.</p>')}
    ${t.hasilPernyataan.length ? bagian(`Pernyataan data <span class="dim">· ${t.pernyataan.cocok}/${t.pernyataan.total} cocok</span>`, `<ul class="lp-pd">${t.hasilPernyataan.map((h) => `<li><span class="${h.lulus ? 'ok-t' : 'bad-t'}" aria-hidden="true">●</span><span><b class="${h.lulus ? 'ok-t' : 'bad-t'}">${h.lulus ? 'Cocok' : 'Tidak cocok'}</b> · ${esc(h.judul)}${h.lulus ? '' : `<span class="dim"> — diharapkan ${esc(h.diharapkan)}, terlihat ${esc(h.terlihat)}${h.galat ? `, galat ${esc(h.galat)}` : ''}</span>`}</span></li>`).join('')}</ul>`) : ''}
    ${bagian(`Request tulis <span class="dim">· ${t.requests.length}</span>`, req)}
    ${silang ? bagian('Catatan silang ke cek UI', `<div class="lp-silang">${silang}</div>`) : ''}
  </div>`
}

/** Baris kedua toolbar laporan. */
export function subJudul(r, ld, tab) {
  if (tab === 'db') {
    const d = ld.ringkasan.db
    if (ld.db.status !== 'tersedia') return ld.db.pesan ?? 'Transaksi database tidak tersedia'
    const kelas = ld.transaksi.map((t) => t.request.terburuk).filter(Boolean)
    const buruk = ['5xx', '4xx', '3xx', '2xx'].find((k) => kelas.includes(k))
    return `${d.transaksi} transaksi · ${d.baris} baris berubah${buruk ? ` · request terburuk ${buruk}` : ''}`
  }
  const tgl = r.started_at
    ? new Date(r.started_at).toLocaleString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : ''
  const akhir = r.ended_at
    ? new Date(r.ended_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    : ''
  return `Jalan ${tgl}${akhir ? ` · selesai ${akhir}` : ''}${r.duration_ms != null ? ` · ${durasiPanjang(r.duration_ms)}` : ''}`
}

/** Kerangka tab Pemeriksaan UI: rel, area konten (screenshot di tengah + kartu per langkah), panel kanan. */
export function kerangkaLaporanUi({ rel, shot, langkah, side }) {
  return `<div class="lp ui" id="lp"><aside class="rn-rel glass" aria-label="Langkah">${rel}</aside><div class="lp-stage" id="lp-stage">${shot}${langkah}</div><section class="rn-side" id="lp-side" aria-label="Ringkasan dan detail cek">${side}</section></div>`
}

export const LEBAR_PANEL_DB = { min: 420, maks: 900 }

/**
 * Kerangka tab Transaksi database: panel kanan lebar (bawaan clamp 480–640 px mengikuti layar, bisa
 * diseret lewat pemisah; `lebar` = px tersimpan atau null).
 */
export function kerangkaLaporanDb({ rel, stage, side, lebar = null }) {
  const gaya = lebar
    ? ` style="--lp-side:${Math.round(Math.min(LEBAR_PANEL_DB.maks, Math.max(LEBAR_PANEL_DB.min, lebar)))}px"`
    : ''
  return `<div class="lp db" id="lp"${gaya}><aside class="rn-rel glass" aria-label="Langkah">${rel}</aside><div class="lp-stage" id="lp-stage">${stage}</div><section class="rn-side" id="lp-side" aria-label="Ringkasan dan detail transaksi"><div class="lp-pemisah" id="lp-pemisah" role="separator" aria-orientation="vertical" aria-label="Ubah lebar panel (seret atau panah kiri/kanan)" tabindex="0"></div>${side}</section></div>`
}

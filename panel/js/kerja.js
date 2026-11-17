// Laporan Kerja satu tugas Plane (GET /api/kerja/<KEY>), dengan kerangka dan komponen yang sama
// dengan laporan skenario: bar atas (judul, tab, aksi), rel bernomor, panggung, dan panel kartu kaca.
// Tab: Layar (screenshot sebelum/sesudah), Data (query DB + perubahan baris), Kode (commit + diff),
// Catatan (catatan.md, tiket, riwayat). Fungsi murni → HTML (diuji Vitest).
import { chipStatus, esc } from './komponen.js'
import { diffHtml } from './laporan.js'

export const TAHAP = [
  ['diambil', 'Diambil'],
  ['dipelajari', 'Dipelajari'],
  ['dikerjakan', 'Dikerjakan (AI)'],
  ['diverifikasi', 'Diverifikasi'],
  ['didokumentasikan', 'Didokumentasikan'],
  ['selesai', 'Selesai'],
]

const waktu = (iso) =>
  iso
    ? new Date(iso).toLocaleString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '–'

/** Penanda tahap 1–5; tahap kini disorot, sebelumnya dicentang. Tiap tahap bisa dipilih. */
export function langkahTahap(tahap) {
  const kini = TAHAP.findIndex(([k]) => k === tahap)
  return `<ol class="kj-tahap">${TAHAP.map(
    ([k, l], i) =>
      `<li class="${i < kini ? 'lewat' : i === kini ? 'kini' : ''}"><button type="button" data-kj-tahap="${k}" aria-current="${i === kini ? 'step' : 'false'}" title="Pindah ke tahap ${esc(l)}"><span class="kj-no">${i < kini ? '✓' : i + 1}</span><span>${esc(l)}</span></button></li>`,
  ).join('')}</ol>`
}

/** Teks satu baris markdown → HTML: `kode`, **tebal**, *miring*. */
const mdBaris = (t) => {
  // Isi `kode` disisihkan dulu, supaya * di dalamnya tidak dianggap tebal/miring.
  const kode = []
  return esc(t)
    .replace(/`([^`]+)`/g, (_m, x) => `\uE000${kode.push(x) - 1}\uE000`)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?![*\w])/g, '$1<i>$2</i>')
    .replace(/\uE000(\d+)\uE000/g, (_m, i) => `<code>${kode[Number(i)]}</code>`)
}

const selTabel = (baris) =>
  baris
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((x) => x.trim())

/**
 * Markdown sederhana → HTML (judul, butir dua tingkat, tabel, kode, paragraf); cukup untuk
 * catatan.md dan tiket.md.
 */
export function mdRingan(md) {
  if (!md) return ''
  const out = []
  const baris = md.split('\n')
  let tingkat = 0 // butir terbuka: 0 = tidak ada, 1 = daftar, 2 = daftar di dalam butir
  const tutupDaftar = () => {
    if (tingkat === 2) out.push('</li></ul>')
    if (tingkat >= 1) out.push('</li></ul>')
    tingkat = 0
  }
  for (let n = 0; n < baris.length; n++) {
    const b = baris[n]
    if (b.startsWith('```')) {
      tutupDaftar()
      const isi = []
      while (++n < baris.length && !baris[n].startsWith('```')) isi.push(esc(baris[n]))
      out.push(`<pre class="kj-kode"><code>${isi.join('\n')}</code></pre>`)
      continue
    }
    // Tabel: baris kepala, baris pemisah |---|, lalu baris isi.
    if (/^\s*\|.*\|\s*$/.test(b) && /^\s*\|[\s:|-]+\|\s*$/.test(baris[n + 1] ?? '')) {
      tutupDaftar()
      const kepala = selTabel(b)
      const isi = []
      n += 2
      while (n < baris.length && /^\s*\|.*\|\s*$/.test(baris[n])) isi.push(selTabel(baris[n++]))
      n--
      out.push(
        `<div class="kj-md-tabel"><table><thead><tr>${kepala.map((x) => `<th>${mdBaris(x)}</th>`).join('')}</tr></thead><tbody>${isi
          .map((r) => `<tr>${r.map((x) => `<td>${mdBaris(x)}</td>`).join('')}</tr>`)
          .join('')}</tbody></table></div>`,
      )
      continue
    }
    const li = b.match(/^(\s*)[-*]\s+(.*)$/)
    if (li) {
      const mau = li[1].length >= 2 && tingkat >= 1 ? 2 : 1
      if (tingkat === 0 || mau > tingkat) out.push('<ul><li>')
      else if (mau === tingkat) out.push('</li><li>')
      else out.push('</li></ul></li><li>')
      tingkat = mau
      out.push(mdBaris(li[2]))
      continue
    }
    // Baris lanjutan yang menjorok di dalam butir ikut butir itu.
    if (tingkat && /^\s{2,}\S/.test(b)) {
      out.push(` ${mdBaris(b.trim())}`)
      continue
    }
    if (tingkat && !b.trim() && /^\s*([-*]\s|\s{2,}\S)/.test(baris[n + 1] ?? '')) continue
    tutupDaftar()
    const h = b.match(/^(#{1,4})\s+(.*)$/)
    if (h) {
      const t = Math.min(4, h[1].length + 2)
      out.push(`<h${t}>${mdBaris(h[2])}</h${t}>`)
    } else if (b.trim()) out.push(`<p>${mdBaris(b)}</p>`)
  }
  tutupDaftar()
  return out.join('')
}

const PONSEL = new Set(['mbl.driver', 'mbl.mechanic'])
const TANDA_CEK = { lulus: ['✓', 'ok-t'], gagal: ['×', 'bad-t'], belum: ['○', 'dim'] }

/** Hasil verifikasi per kriteria tiket: tanda + teks, bukan warna saja. */
export function daftarVerifikasi(k) {
  const v = k.verifikasi ?? []
  if (!v.length)
    return `<div class="dim">Belum ada kriteria yang dicek. Catat per kriteria tiket dengan <code>bun run kerja cek ${esc(k.key)} lulus|gagal|belum "kriteria" "bukti"</code>.</div>`
  const n = (h) => v.filter((c) => c.hasil === h).length
  return `<p class="kj-cek-ringkas"><span class="ok-t">✓ ${n('lulus')} lulus</span> · <span class="${n('gagal') ? 'bad-t' : ''}">× ${n('gagal')} gagal</span> · <span class="dim">○ ${n('belum')} belum</span></p><ul class="kj-cek">${v
    .map((c) => {
      const [t, kelas] = TANDA_CEK[c.hasil] ?? TANDA_CEK.belum
      return `<li><span class="${kelas}" aria-label="${esc(c.hasil)}">${t}</span><span><b>${esc(c.kriteria)}</b>${c.bukti ? `<span class="dim kj-bukti">${esc(c.bukti)}</span>` : ''}</span></li>`
    })
    .join('')}</ul>`
}

/** Satu baris diff berkelas: tambah, hapus, hunk; baris kepala git (diff/index/---/+++) dilewati. */
export function barisDiff(diff) {
  const baris = diff.split('\n')
  const mulai = baris.findIndex((b) => b.startsWith('@@'))
  if (mulai < 0) return ''
  return baris
    .slice(mulai)
    .map((b) => {
      const k = b.startsWith('@@')
        ? 'hunk'
        : b.startsWith('+')
          ? 'tambah'
          : b.startsWith('-')
            ? 'hapus'
            : ''
      return `<span class="${k}">${esc(b) || ' '}</span>`
    })
    .join('')
}

const pendek = (sha) => String(sha ?? '').slice(0, 8)

/** Berkas satu commit: path, +/−, dan diff yang bisa dibuka-tutup. */
export function berkasCommit(c) {
  return c.berkas
    .map((b) => {
      const isi = b.diff
        ? `<pre class="kj-diff">${barisDiff(b.diff)}</pre>${b.terpotong ? '<p class="dim">Diff dipotong karena terlalu besar; lihat lengkapnya dengan git.</p>' : ''}`
        : '<p class="dim">Berkas biner atau tanpa perubahan isi.</p>'
      return `<details class="kj-berkas" data-k="${esc(`${c.sha}:${b.path}`)}"><summary class="kj-berkas-hd"><span class="mono kj-path">${esc(b.path)}</span><span class="kj-angka"><span class="ok-t">+${b.tambah ?? '–'}</span> <span class="bad-t">−${b.hapus ?? '–'}</span></span></summary>${isi}</details>`
    })
    .join('')
}

/**
 * Perubahan kode v2 yang dicatat untuk tiket (GET /api/kerja/<KEY>/kode): status push, commit,
 * berkas dengan jumlah baris, dan diff per berkas yang bisa dibuka.
 * @param {any} d
 * @param {{ galat?: string | null }} [o]
 */
export function perubahanKode(d, { galat = null } = {}) {
  if (galat) return `<div class="errbox" role="alert"><div class="mono">${esc(galat)}</div></div>`
  if (!d) return '<div class="dim">Memuat perubahan kode…</div>'
  if (d.galat)
    return `<div class="errbox" role="alert"><div class="mono">${esc(d.galat)}</div></div>`
  if (!d.commits.length)
    return '<div class="dim">Belum ada commit tercatat. Tiket yang fiturnya sudah ada di v2 memang tidak punya; untuk tiket yang dikerjakan AI, commit dicatat dengan <code>bun run kerja catat KEY --commit sha</code>.</div>'
  const semua = d.commits.flatMap((c) => c.berkas)
  const tambah = semua.reduce((a, b) => a + (b.tambah ?? 0), 0)
  const hapus = semua.reduce((a, b) => a + (b.hapus ?? 0), 0)
  const push =
    d.diRemote === null
      ? ''
      : d.diRemote
        ? d.belumDiPush
          ? `<span class="warn-t">! ${d.belumDiPush} commit belum di-push</span>`
          : '<span class="ok-t">✓ sudah di remote</span>'
        : '<span class="warn-t">! belum di-push (branch belum ada di remote)</span>'
  const ringkas = `<p class="kj-kode-ringkas">${d.branch ? `<code>${esc(d.branch)}</code> · ` : ''}${d.commits.length} commit · ${semua.length} berkas · <span class="ok-t">+${tambah}</span> <span class="bad-t">−${hapus}</span>${push ? ` · ${push}` : ''}</p>${
    d.belumDicatat
      ? `<p class="warn-t kj-kode-ringkas">! ${d.belumDicatat} commit lebih baru di branch belum dicatat di kerja ini.</p>`
      : ''
  }`
  const commits = d.commits
    .map((c) => {
      if (c.galat)
        return `<div class="kj-commit"><div class="kj-commit-hd"><code>${esc(pendek(c.sha))}</code></div><div class="errbox" role="alert">${esc(c.galat)}</div></div>`
      const berkas = berkasCommit(c)
      return `<div class="kj-commit"><div class="kj-commit-hd"><code>${esc(pendek(c.sha))}</code> <b>${esc(c.judul)}</b><span class="dim"> · ${esc(c.penulis)} · ${esc(waktu(c.tanggal))}</span></div>${c.isi ? `<pre class="kj-commit-isi">${esc(c.isi)}</pre>` : ''}${berkas}</div>`
    })
    .join('')
  return `${ringkas}${commits}`
}

// ── Laporan Kerja (kerangka laporan skenario) ─────────────────────────────────

export const TAB_KERJA = [
  ['layar', 'Layar'],
  ['data', 'Data'],
  ['kode', 'Kode'],
  ['catatan', 'Catatan'],
]
const LABEL_TAHAP = Object.fromEntries(TAHAP)
const jamPendek = (iso) =>
  iso
    ? new Date(iso).toLocaleString('id-ID', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '–'
const hitungCek = (k) => {
  const v = k.verifikasi ?? []
  return {
    total: v.length,
    lulus: v.filter((c) => c.hasil === 'lulus').length,
    gagal: v.filter((c) => c.hasil === 'gagal').length,
  }
}

const LABEL_REL = { lulus: 'bukti lengkap', gagal: 'gagal', menunggu: 'belum lengkap' }
/** Rel bernomor (pola rel laporan): butir {no, label, status, judul}; status = kelas s-*. */
export function relKerja(butir, pilih, atribut = 'data-kj-pilih') {
  if (!butir.length) return '<ol class="rel" aria-label="Kosong"></ol>'
  return `<ol class="rel" aria-label="Pilihan">${butir
    .map(
      (b) =>
        `<li><button type="button" class="rel-no s-${b.status}${b.status === 'menunggu' ? ' s-kosong' : ''}${pilih === b.no ? ' pilih' : ''}" ${atribut}="${b.no}" aria-label="${esc(`${b.judul}, ${LABEL_REL[b.status.split(' ')[0]] ?? b.status}`)}" title="${esc(b.judul)}"${pilih === b.no ? ' aria-current="true"' : ''}>${esc(b.label ?? b.no)}${b.status === 'gagal' ? '<span class="tanda" aria-hidden="true">×</span>' : b.status.startsWith('menunggu') && pilih === b.no ? '<span class="tanda" aria-hidden="true">○</span>' : ''}</button></li>`,
    )
    .join('')}</ol>`
}

/** Status satu target layar: lulus (sebelum+sesudah), gagal (galat), menunggu (sebagian/belum). */
function statusLayar(k, nama) {
  const a = k.potret.sebelum?.layar.find((x) => x.nama === nama)
  const b = k.potret.sesudah?.layar.find((x) => x.nama === nama)
  if (a?.galat || b?.galat) return 'gagal'
  if (a?.file && b?.file) return 'lulus'
  return a?.file || b?.file ? 'menunggu' : 'menunggu s-kosong'
}
function statusQuery(q) {
  if (q.galatSebelum || q.galatSesudah) return 'gagal'
  if (q.sebelum && q.sesudah) return 'lulus'
  return q.sebelum || q.sesudah ? 'menunggu' : 'menunggu s-kosong'
}

const JAM = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : ''

/**
 * Status Plane selalu dengan jam cek (§6.1). Belum segar: miring + "?" + jam cache, tidak pernah
 * tampil seperti fakta. `cek`: 'memeriksa' | 'gagal' | null. `chip` = bentuk chip (bilah tahap).
 */
export function statusPlane(d, cek = null, { chip = false } = {}) {
  const s = esc(d.kerja.plane.status)
  const jam = d.plane?.dicek ? JAM(d.plane.dicek) : ''
  if (d.plane?.segar)
    return chip
      ? `<span class="chip">Plane: ${s}</span>${jam ? `<span class="dim">dicek ${jam}</span>` : ''}`
      : `Plane: ${s}${jam ? ` · dicek ${jam}` : ''}`
  if (cek === 'gagal')
    return `<span class="chip warn">! Plane: ${s}? · gagal dicek</span><button type="button" class="btn tb kj-kecil" data-kj-cek-plane>Cek ulang</button>`
  const cache = jam ? `cache ${jam}` : 'salinan lokal'
  if (cek === 'memeriksa')
    return chip
      ? `<span class="chip basi" title="Nilai dari ${cache}, belum dicek ulang">Plane: ${s}?</span><span class="putar kecil" aria-hidden="true"></span><span class="dim">memeriksa…</span>`
      : `<span class="putar kecil" aria-hidden="true"></span><i>Plane: ${s}?</i> · ${cache}, memeriksa…`
  return chip
    ? `<span class="chip basi" title="Nilai dari cache, belum dicek ulang">Plane: ${s}?</span><span class="dim">${cache}</span>`
    : `<i>Plane: ${s}?</i> · ${cache}`
}

const tombolBar = (mati = false) => {
  const m = mati ? ' disabled' : ''
  return `<div class="bar-end kj-bar-aksi"><button type="button" class="btn tb" id="kj-komentar"${m}>Komentar Plane…</button><button type="button" class="btn tb" id="kj-status"${m}>Status Plane…</button><button type="button" class="btn tb utama-tb" id="kj-salin"${m}>Salin perintah AI</button></div>`
}

/** Bar atas: kembali, judul, sub-judul (Plane + jam cek · tahap · kriteria), aksi Plane. */
export function barKerja(d, { kembali = '‹', cekPlane = null } = {}) {
  const k = d.kerja
  const c = hitungCek(k)
  const kriteria = c.gagal
    ? `<b class="bad-t">× ${c.gagal} kriteria gagal · ${c.lulus}/${c.total} lulus</b>`
    : `<b class="${c.total && c.lulus === c.total ? 'ok-t' : ''}">${c.total && c.lulus === c.total ? '✓ ' : ''}kriteria ${c.lulus}/${c.total} lulus</b>`
  return `<a class="btn icon kj-kembali" href="#/tugas" aria-label="Kembali ke Tugas saya" title="Tugas saya">${kembali}</a>
    <div class="bar-title kj-bar-judul"><b><em class="kj-awal">Kerja</em> · <a href="${esc(k.url)}" target="_blank" rel="noopener">${esc(k.key)}</a> · ${esc(k.judul)}</b><span class="kj-sub" role="status">${statusPlane(d, cekPlane)} · ${esc(LABEL_TAHAP[k.tahap] ?? k.tahap)} · ${kriteria}</span></div>
    ${tombolBar()}`
}

/** Bar + kerangka (skeleton) saat data kerja belum datang. */
function kerjaMemuat(kunci, kembali) {
  const s = (w, h, r = 6) =>
    `<span class="skel" style="width:${w};height:${h}px;border-radius:${r}px"></span>`
  const langkah = [64, 72, 88, 76, 104, 52]
    .map((w) => `<span class="kj-skel-langkah">${s('26px', 26, 13)}${s(`${w}px`, 10)}</span>`)
    .join('')
  const baris = (n) =>
    Array.from(
      { length: n },
      (_, i) =>
        `<span class="kj-skel-baris">${s(`${40 + i * 6}%`, 12)}${s(`${62 + ((i * 7) % 14)}%`, 10)}</span>`,
    ).join('')
  return {
    bar: `<a class="btn icon kj-kembali" href="#/tugas" aria-label="Kembali ke Tugas saya" title="Tugas saya">${kembali}</a>
      <div class="bar-title kj-bar-judul"><b><em class="kj-awal">Kerja</em>${kunci ? ` · ${esc(kunci)}` : ''}</b><span class="kj-sub" role="status"><span class="putar kecil" aria-hidden="true"></span>Memuat kerja…</span></div>
      ${tombolBar(true)}`,
    view: `<div class="kj-halaman kj-memuat" aria-hidden="true">
      <div class="kj-ringkas">
        <div class="kartu glass kj-skel-bilah"><span class="kj-skel-atas">${s('80px', 10)}${s('150px', 20, 999)}</span><span class="kj-skel-langkah-baris">${langkah}</span></div>
        <div class="kj-ringkas-kolom"><div class="kartu glass kj-skel-kartu">${s('170px', 14)}${baris(3)}</div><div class="kartu glass kj-skel-kartu">${s('130px', 14)}${['90%', '80%', '86%', '74%'].map((w) => s(w, 12)).join('')}</div></div>
      </div>
      <section class="kj-laporan"><div class="kj-lap-hd"><h2>Laporan</h2><span class="kj-skel-tab">${[64, 56, 56, 76].map((w) => s(`${w}px`, 30, 999)).join('')}</span></div>
        <div class="kj-lap-isi"><div class="kj-rel kj-skel-rel">${s('30px', 30, 15)}${s('30px', 30, 15)}${s('30px', 30, 15)}</div>${s('100%', 220, 12)}<div class="kartu glass kj-skel-kartu">${s('100px', 10)}${s('90%', 18)}${s('70%', 18)}</div></div>
      </section></div>`,
  }
}

/** Kartu galat saat data kerja tak bisa dimuat: Coba lagi · Kembali · Salin galat. */
function kerjaGagal(kunci, galat, kembali) {
  return {
    bar: `<a class="btn icon kj-kembali" href="#/tugas" aria-label="Kembali ke Tugas saya" title="Tugas saya">${kembali}</a>
      <div class="bar-title kj-bar-judul"><b><em class="kj-awal">Kerja</em>${kunci ? ` · ${esc(kunci)}` : ''}</b><span class="kj-sub"><span class="bad-t">× Gagal dimuat</span></span></div>
      ${tombolBar(true)}`,
    view: `<div class="kj-gagal-wadah"><div class="glass kj-gagal" role="alert">
      <span class="kj-gagal-ikon" aria-hidden="true">×</span>
      <div class="kj-gagal-isi"><h2>Kerja ${esc(kunci ?? '')} tidak bisa dimuat</h2>
        <p class="dim">Ringkasan dan laporan butuh data kerja dari server lokal Scenario Runner. Datanya tidak berubah; muat ulang setelah masalahnya beres.</p>
        <div class="kartu-box mono kj-gagal-pesan"><div class="dim">GET /api/kerja/${esc(kunci ?? '')}</div><div class="bad-t">${esc(galat)}</div></div>
        <div class="kj-gagal-aksi"><button type="button" class="btn tb utama-tb" data-kj-ulang>Coba lagi</button><a class="btn tb" href="#/tugas">Kembali ke Tugas saya</a><button type="button" class="btn tb kj-ka" data-kj-salin="${esc(`GET /api/kerja/${kunci ?? ''}\n${galat}`)}" data-kj-salin-pesan="Galat disalin">Salin galat</button></div>
      </div></div></div>`,
  }
}

/** Kotak kosong bergaris putus: ikon, judul, penjelasan, perintah CLI + Salin. */
export function kotakKosong(judul, penjelasan, perintah, ikon = '○') {
  return `<div class="kj-kosong-kotak"><span class="kj-kosong-ikon" aria-hidden="true">${ikon}</span><b>${judul}</b><p class="dim">${penjelasan}</p>${
    perintah
      ? `<div class="kj-perintah"><code>${esc(perintah)}</code><button type="button" class="btn tb kj-kecil" data-kj-salin="${esc(perintah)}">Salin</button></div>`
      : ''
  }</div>`
}

const jumlahKode = (k, kode) => kode?.commits?.length ?? k.commit?.length ?? 0

/** Kepala Laporan: tab berjumlah butir; konteks + "↑ Ringkasan" tampil saat menempel. */
export function kepalaLaporanKerja(d, tab, kode = null) {
  const k = d.kerja
  const c = hitungCek(k)
  const galatDb = d.db.filter((q) => q.galatSebelum || q.galatSesudah).length
  const sub =
    tab === 'data'
      ? `${d.db.length} query · ${d.db.filter((q) => q.perubahan?.length).length} berubah${galatDb ? ` · ${galatDb} gagal` : ''}`
      : tab === 'kode'
        ? kode?.commits?.length
          ? `${kode.commits.length} commit${kode.branch ? ` · ${kode.branch}` : ''}`
          : !kode && (k.commit?.length || k.branch)
            ? 'Memuat perubahan kode…'
            : 'Belum ada commit tercatat'
        : tab === 'catatan'
          ? 'Catatan kerja dan riwayat lengkap'
          : `${k.target.layar.length} halaman · sebelum ${jamPendek(k.potret.sebelum?.at)} · sesudah ${jamPendek(k.potret.sesudah?.at)}`
  const n = { layar: k.target.layar.length, data: d.db.length, kode: jumlahKode(k, kode) }
  const pil = TAB_KERJA.map(
    ([id, l]) =>
      `<a role="tab" href="#/kerja/${esc(k.key)}/${id}" aria-selected="${tab === id}">${l}${n[id] !== undefined ? ` <span class="n">${n[id]}</span>` : ''}${id === 'data' && galatDb ? ` <span class="badge" aria-label="${galatDb} query gagal">${galatDb}</span>` : ''}</a>`,
  ).join('')
  return `<div class="kj-lap-hd" id="kj-lap-hd"><h2>Laporan</h2><div class="pill" role="tablist" aria-label="Bagian laporan kerja">${pil}</div><span class="dim kj-lap-ket">${esc(sub)}</span>
    <span class="kj-lap-konteks"><span class="mono">${esc(k.key)}</span> · ${esc(LABEL_TAHAP[k.tahap] ?? k.tahap)} · <span class="${c.gagal ? 'bad-t' : 'ok-t'}">${c.gagal ? `× ${c.gagal}` : '✓'} ${c.lulus}/${c.total}</span><button type="button" class="btn tb kj-kecil" data-kj-atas>↑ Ringkasan</button></span></div>`
}

/** Kerangka isi laporan: rel 56 px · panggung · panel kanan 380 px (rel dan panel menempel). */
const kerangka = (_jenis, { rel, stage, side }) =>
  `<div class="kj-lap-isi"><nav class="kj-rel" aria-label="Pilihan">${rel}</nav><div class="kj-panggung" id="lp-stage">${stage}</div><aside class="kj-sisi" aria-label="Detail">${side}</aside></div>`

/** Tombol potret: nonaktif saat memotret atau belum ada target; yang berjalan berlabel + pemutar. */
const tombolPotret = (k, sibuk) => {
  const kosong = !k.target.layar.length && !k.target.db.length
  const satu = (f) => {
    const jalan = sibuk === `Memotret ${f}`
    const label = jalan
      ? `<span class="putar kecil" aria-hidden="true"></span>Memotret ${f}…`
      : `${k.potret[f] ? 'Potret ulang' : 'Potret'} ${f}`
    return `<button type="button" class="btn tb" id="kj-potret-${f}"${sibuk || kosong ? ' disabled' : ''}${kosong ? ' title="Belum ada target untuk dipotret"' : ''}>${label}</button>`
  }
  return `<span class="kj-alat-aksi">${satu('sebelum')}${satu('sesudah')}</span>`
}

/** Potret satu halaman pada satu fase: { file, galat, at }. */
function potretHalaman(k, fase, nama) {
  const x = k.potret[fase]?.layar.find((y) => y.nama === nama)
  return { file: x?.file ?? null, galat: x?.galat ?? null, at: k.potret[fase]?.at ?? null }
}

/** Bingkai screenshot: gulir di dalam, peta mini di kanan, tombol layar penuh, label pil. */
function bingkaiLayar(k, t, no, fase, { label = true, peta = true } = {}) {
  const p = potretHalaman(k, fase, t.nama)
  const url = p.file ? `/kerja/${esc(k.key)}/${fase}/${esc(p.file)}` : ''
  const isi = p.file
    ? `<img src="${url}" alt="${esc(`${t.nama} ${fase}`)}">${'' /* akhir halaman ditandai saat berdampingan */}`
    : p.galat
      ? `<div class="kj-kosong-layar"><span class="kj-kosong-ikon bad-t" aria-hidden="true">×</span><h3>Gagal dipotret ${fase}</h3><p class="mono bad-t">${esc(p.galat)}</p></div>`
      : `<div class="kj-kosong-layar"><span class="kj-kosong-ikon" aria-hidden="true">○</span><h3>Belum dipotret ${fase}</h3><p class="dim">Tekan <b>Potret ${fase}</b>; screenshot muncul di sini begitu selesai.</p></div>`
  const st = statusLayar(k, t.nama)
  return `<div class="kj-bingkai${PONSEL.has(t.sebagai) ? ' ponsel' : ''}" data-kj-bingkai="${fase}">
    <div class="kj-gulir" data-kj-gulir="${fase}">${isi}</div>
    ${p.file && peta ? `<div class="kj-alat-bingkai"><button type="button" class="btn icon kj-kecil" data-kj-penuh="${url}" aria-label="Buka layar penuh" title="Layar penuh">⤢</button></div><div class="kj-peta" data-kj-peta="${fase}" aria-label="Peta mini halaman penuh"><div class="isi"><img src="${url}" alt=""><div class="kotak"></div></div></div>` : ''}
    ${label ? `<div class="lp-label glass"><span class="rel-no s-${st}" aria-hidden="true">${no}</span><span>${fase === 'sebelum' ? 'Sebelum' : 'Sesudah'} · ${esc(jamPendek(p.at))} · <span class="mono">${esc(t.sebagai)} ${esc(t.rute)}</span></span></div>` : ''}
  </div>`
}

/** Tab Layar: Sesudah | Sebelum | Berdampingan (gulir bersama), peta mini, kartu per halaman. */
export function tabLayar(d, { pilih = 1, mode = 'sesudah', sibuk = null, sinkron = true } = {}) {
  const k = d.kerja
  const targets = k.target.layar
  const butir = targets.map((t, i) => ({
    no: i + 1,
    status: statusLayar(k, t.nama),
    judul: `${i + 1}. ${t.keterangan ?? t.nama}`,
  }))
  const t = targets[pilih - 1]
  const pil = `<div class="pill" role="group" aria-label="Tampilan screenshot">${[
    ['sesudah', 'Sesudah'],
    ['sebelum', 'Sebelum'],
    ['dua', 'Berdampingan'],
  ]
    .map(
      ([m, l]) =>
        `<button type="button" data-kj-mode="${m}" aria-pressed="${mode === m}">${l}</button>`,
    )
    .join('')}</div>`
  const tombolSinkron =
    mode === 'dua'
      ? `<button type="button" class="btn tb kj-sinkron" data-kj-sinkron aria-pressed="${sinkron}">⛓ Gulir bersama: ${sinkron ? 'aktif' : 'mati'}</button>`
      : ''
  const alat = `<div class="lp-tools">${pil}${tombolSinkron}${tombolPotret(k, sibuk)}</div>`
  if (!t)
    return kerangka('ui', {
      rel: relKerja(butir, pilih),
      stage: `${alat}${kotakKosong('Belum ada halaman untuk dipotret', 'Daftarkan halaman dan query yang membuktikan isi tiket, lalu potret sebelum dan sesudah.', `bun run kerja target ${k.key} target.json`)}`,
      side: '',
    })
  const panggung =
    mode === 'dua'
      ? `<div class="kj-dua" data-kj-dua>${['sebelum', 'sesudah']
          .map((f) => {
            const p = potretHalaman(k, f, t.nama)
            return `<div class="kj-dua-kol"><div class="kj-dua-hd"><span class="rel-no s-${statusLayar(k, t.nama)}" aria-hidden="true">${pilih}</span><b>${f === 'sebelum' ? 'Sebelum' : 'Sesudah'}</b><span class="dim">· ${esc(jamPendek(p.at))} · <span class="mono">${esc(t.sebagai)}</span></span></div>${bingkaiLayar(k, t, pilih, f, { label: false, peta: false })}</div>`
          })
          .join('')}<div class="kj-dua-peta"><div class="dim kj-dua-hd">Peta</div>${
          potretHalaman(k, 'sesudah', t.nama).file
            ? `<div class="kj-peta statis" data-kj-peta="dua"><div class="isi"><img src="/kerja/${esc(k.key)}/sesudah/${esc(potretHalaman(k, 'sesudah', t.nama).file)}" alt=""><span class="kj-akhir" hidden title="Akhir halaman sebelum"></span><div class="kotak"></div></div></div>`
            : ''
        }</div></div><p class="dim kj-catatan-kecil">Gulir bersama mengikuti posisi piksel. Sisi yang lebih pendek berhenti di akhir halamannya; garis di peta menandai akhir halaman sebelum.</p>`
      : bingkaiLayar(k, t, pilih, mode === 'sebelum' ? 'sebelum' : 'sesudah')
  const tanda = (f) => {
    const p = potretHalaman(k, f, t.nama)
    return p.galat
      ? '<span class="bad-t">×</span>'
      : p.file
        ? '<span class="ok-t">✓</span>'
        : '<span class="dim">○</span>'
  }
  const kartu = `<div class="kj-hal-baris">${targets
    .map((x, i) => {
      const a = potretHalaman(k, 'sebelum', x.nama)
      const b = potretHalaman(k, 'sesudah', x.nama)
      const st = (p) =>
        p.galat
          ? '<span class="bad-t">×</span>'
          : p.file
            ? '<span class="ok-t">✓</span>'
            : '<span class="dim">○</span>'
      return `<button type="button" class="kj-hal${pilih === i + 1 ? ' pilih' : ''}" data-kj-pilih="${i + 1}"${pilih === i + 1 ? ' aria-current="true"' : ''}><span class="kj-hal-hd"><b>${i + 1}</b><span class="mono dim">${esc(x.sebagai.replace(/^mbl\./, ''))}</span><span class="kj-hal-st" aria-label="sebelum dan sesudah">${st(a)} ${st(b)}</span></span><span class="t">${esc(x.keterangan ?? x.nama)}</span></button>`
    })
    .join('')}</div>`
  const kotak = (f) => {
    const p = potretHalaman(k, f, t.nama)
    return `<div class="kartu-box${p.file ? '' : ' putus'}"><div class="db-eyebrow">${f === 'sebelum' ? 'Sebelum' : 'Sesudah'}</div><div>${p.galat ? `<span class="bad-t">× gagal</span>` : p.file ? `${tanda(f)} ${esc(jamPendek(p.at))}` : '<span class="dim">○ belum</span>'}</div></div>`
  }
  const detail = `<div class="kartu glass kartu-trx"><div class="kartu-hd"><span>Halaman #${pilih} · <span class="mono">${esc(t.sebagai)}</span></span></div><h1>${esc(t.keterangan ?? t.nama)}</h1>
    <section class="kt-bag"><h2>Rute</h2><p class="mono">${esc(t.rute)}</p></section>
    <section class="kt-bag"><h2>Potret</h2><div class="kj-kotak-dua">${kotak('sebelum')}${kotak('sesudah')}</div></section>
    <section class="kt-bag"><h2>Nama target</h2><p class="mono">${esc(t.nama)}</p></section></div>`
  return kerangka('ui', {
    rel: relKerja(butir, pilih),
    stage: `${alat}${panggung}${kartu}`,
    side: detail,
  })
}

/** SQL satu baris → beberapa baris di depan kata kunci utama, untuk dibaca. */
export function rapikanSql(sql) {
  return String(sql ?? '')
    .replace(/\s+/g, ' ')
    .replace(
      /\s+(FROM|JOIN|LEFT JOIN|WHERE|GROUP BY|ORDER BY|HAVING|LIMIT|UNION ALL|UNION)\b/gi,
      '\n$1',
    )
    .replace(/\s+AND\b/gi, '\n  AND')
    .trim()
}

/** Chip Beda berteks (tidak hanya warna). */
function chipBeda(q) {
  if (!q.beda) return '<span class="dim">–</span>'
  const b = q.beda
  const chip = [
    b.ditambah
      ? `<span class="st-chip ok" title="${b.ditambah} baris baru">+${b.ditambah} baru</span>`
      : '',
    b.berubah
      ? `<span class="st-chip warn" title="${b.berubah} baris berubah">~${b.berubah} berubah</span>`
      : '',
    b.dihapus
      ? `<span class="st-chip bad" title="${b.dihapus} baris hilang">−${b.dihapus} hapus</span>`
      : '',
  ].join('')
  return chip || '<span class="st-chip idle">= sama</span>'
}

/** Tab Data: tabel query + detail (Perubahan data, SQL rapi + Salin) di panel kanan. */
export function tabData(d, { pilih = 1, sibuk = null } = {}) {
  const k = d.kerja
  const butir = d.db.map((q, i) => ({
    no: i + 1,
    status: statusQuery(q),
    judul: `${i + 1}. ${q.nama}`,
  }))
  const baris = (rows, galat) =>
    galat ? '<span class="bad-t">× gagal</span>' : rows ? rows.length : '–'
  const atas = `<div class="lp-tools"><span class="dim kj-catatan-kecil">Snapshot baca-saja dari DB lokal · maks. 500 baris per query</span>${tombolPotret(k, sibuk)}</div>`
  const tabel = d.db.length
    ? `<div class="lp-tabel-wrap"><table class="lp-tabel kj-tabel-data"><thead><tr><th>#</th><th>Query</th><th>Keterangan</th><th class="kanan">Sebelum</th><th class="kanan">Sesudah</th><th>Beda</th></tr></thead><tbody>${d.db
        .map(
          (q, i) =>
            `<tr class="${pilih === i + 1 ? 'pilih' : ''}" data-kj-pilih="${i + 1}" tabindex="0"${pilih === i + 1 ? ' aria-selected="true"' : ''}><td class="dim">${i + 1}</td><td class="mono kj-nowrap">${esc(q.nama)}</td><td class="dim">${esc(q.keterangan ?? '')}</td><td class="kanan">${baris(q.sebelum, q.galatSebelum)}</td><td class="kanan">${baris(q.sesudah, q.galatSesudah)}</td><td>${chipBeda(q)}</td></tr>`,
        )
        .join(
          '',
        )}</tbody></table></div><p class="dim kj-catatan-kecil">Baris dikenali lewat kolom <span class="mono">id</span> bila ada. Tanpa kolom <span class="mono">id</span>, kunci baris adalah kolom yang bukan angka, dan namanya tampil di kepala setiap perubahan.</p>`
    : kotakKosong(
        'Belum ada query untuk dipotret',
        'Daftarkan query yang memperlihatkan data yang berubah (hanya SELECT, <span class="mono">$1</span> = company_id).',
        `bun run kerja target ${k.key} target.json`,
        '▤',
      )
  const q = d.db[pilih - 1]
  const jumlah = (q?.perubahan ?? []).reduce((n, p) => n + p.baris.length, 0)
  const bagian = (judul, isi, aksi = '') =>
    `<section class="kt-bag"><div class="kj-bag-hd"><h2>${judul}</h2>${aksi}</div>${isi}</section>`
  const galatQ = q && (q.galatSesudah || q.galatSebelum)
  const detail = q
    ? `<div class="kartu glass kartu-trx"><div class="kartu-hd"><span>Query #${pilih}</span><span class="kj-ka">${chipBeda(q)}</span></div><h1 class="mono">${esc(q.nama)}</h1>${q.keterangan ? `<p class="dim">${esc(q.keterangan)}</p>` : ''}
      ${galatQ ? bagian('Galat', `<div class="kj-galat-kotak"><b>${q.galatSesudah ? 'Sesudah' : 'Sebelum'}</b> · ${esc(jamPendek(k.potret[q.galatSesudah ? 'sesudah' : 'sebelum']?.at))}<div class="mono">${esc(galatQ)}</div></div>`) : ''}
      ${bagian(
        `Perubahan data <span class="dim">· ${jumlah ? `${jumlah} baris` : 'tidak ada'}</span>`,
        !q.sebelum || !q.sesudah
          ? '<p class="dim">Perubahan tampil setelah sebelum dan sesudah berhasil dipotret.</p>'
          : jumlah
            ? `<div class="df">${diffHtml(q.perubahan)}</div>`
            : `<p class="dim">= Tidak ada baris yang berubah. ${q.sesudah.length} baris sama persis antara sebelum dan sesudah.</p>`,
      )}
      ${bagian('SQL', `<pre class="kj-sql">${esc(rapikanSql(q.sql))}</pre>`, `<button type="button" class="btn tb kj-kecil" data-kj-salin-sql="${esc(q.sql)}">Salin</button>`)}</div>`
    : ''
  const galat = d.db.filter((x) => x.galatSebelum || x.galatSesudah).length
  const ringkas = `<div class="kartu glass lp-ring"><div class="angka"><div><div class="angka-k">Query</div><div class="angka-v">${d.db.length}</div></div><div><div class="angka-k">Berubah</div><div class="angka-v">${d.db.filter((x) => x.perubahan?.length).length}</div></div><div><div class="angka-k">Gagal</div><div class="angka-v${galat ? ' bad-t' : ''}">${galat}</div></div></div></div>`
  return kerangka('db', {
    rel: relKerja(butir, pilih),
    stage: `${atas}${tabel}`,
    side: `${ringkas}${detail}`,
  })
}

const ribu = (n) => Number(n ?? 0).toLocaleString('id-ID')

/** Batang diffstat 5 kotak: hijau sebanding tambahan, merah sebanding hapusan. */
export function batangDiff(tambah, hapus) {
  const total = (tambah ?? 0) + (hapus ?? 0)
  const hijau = total ? Math.round((5 * (tambah ?? 0)) / total) : 0
  const merah = total ? 5 - hijau : 0
  return `<span class="kj-batang" aria-hidden="true">${'<i class="k t"></i>'.repeat(hijau)}${'<i class="k h"></i>'.repeat(merah)}${'<i class="k"></i>'.repeat(5 - hijau - merah)}</span>`
}

/** Pesan commit → markdown: baris yang dibungkus git digabung ke butirnya. */
export function pesanCommitMd(isi) {
  const out = []
  for (const b of String(isi ?? '').split('\n')) {
    if (/^(Co-Authored-By|Signed-off-by):/i.test(b.trim())) continue
    // Baris lanjutan (bukan butir baru, bukan baris kosong) digabung ke baris berisi sebelumnya.
    const lanjutan = b.trim() && !/^\s*-\s+/.test(b) && out.length && out.at(-1).trim()
    if (lanjutan) out[out.length - 1] = `${out.at(-1)} ${b.trim()}`
    else out.push(b)
  }
  return out.join('\n').trim()
}

/** Tab Kode: berkas per folder teratas, path abu + nama terang, batang diffstat; panel: push + pesan. */
export function tabKode(_d, kode, { pilih = 1, galat = null } = {}) {
  const k = _d.kerja
  const tanpaKode = !k.commit?.length && !k.branch
  if (tanpaKode || (!galat && kode && !kode.galat && !kode.commits?.length))
    return kerangka('ui', {
      rel: relKerja([], pilih),
      stage: kotakKosong(
        'Belum ada commit untuk tiket ini',
        'Tiket yang sudah Ready in Staging biasanya tidak punya kode di sini: fiturnya sudah ada di v2. Untuk tiket yang dikerjakan AI, catat commit-nya:',
        `bun run kerja catat ${k.key} --commit <sha>`,
      ),
      side: `<div class="kartu glass lp-ring"><div class="kartu-hd">${chipStatus('Tanpa kode', 'idle')}</div><p class="dim kj-catatan-kecil">Status push muncul setelah ada commit tercatat.</p></div>`,
    })
  if (!galat && !kode) {
    // Kode dibaca dari repo v2 terpisah: kerangka daftar berkas dan panel sementara git dibaca.
    const s = (w, h, r = 6) =>
      `<span class="skel" style="width:${w};height:${h}px;border-radius:${r}px"></span>`
    return kerangka('ui', {
      rel: `<div class="kj-skel-rel" aria-hidden="true">${s('30px', 30, 15)}</div>`,
      stage: `<div class="kj-kode-hd" role="status"><span class="putar kecil" aria-hidden="true"></span><span class="dim">Memuat perubahan kode…</span></div><div class="kj-skel-daftar" aria-hidden="true">${[62, 48, 70, 55, 66].map((w) => `<span class="kj-skel-berkas">${s(`${w}%`, 12)}${s('60px', 10)}</span>`).join('')}</div>`,
      side: `<div class="kartu glass kj-skel-kartu" aria-hidden="true">${s('120px', 20, 999)}${s('90%', 18)}${s('70%', 18)}</div>`,
    })
  }
  if (galat || kode.galat)
    return kerangka('ui', {
      rel: relKerja([], pilih),
      stage: `<div class="kj-galat-kotak" role="alert"><b>× Perubahan kode tidak bisa dibaca</b><div class="mono">${esc(galat ?? kode.galat)}</div></div>`,
      side: '',
    })
  const butir = kode.commits.map((c, i) => ({
    no: i + 1,
    status: c.galat ? 'gagal' : 'lulus',
    judul: `${i + 1}. ${pendek(c.sha)} ${c.judul}`,
  }))
  const c = kode.commits[pilih - 1] ?? kode.commits[0]
  const semua = kode.commits.flatMap((x) => x.berkas)
  const tambah = semua.reduce((a, b) => a + (b.tambah ?? 0), 0)
  const hapus = semua.reduce((a, b) => a + (b.hapus ?? 0), 0)
  const push =
    kode.diRemote === null
      ? chipStatus('Status push tak diketahui', 'idle')
      : kode.diRemote
        ? kode.belumDiPush
          ? chipStatus(`! ${kode.belumDiPush} commit belum di-push`, 'warn')
          : chipStatus('✓ Sudah di remote', 'ok')
        : chipStatus('! Belum di-push · branch belum ada di remote', 'warn')
  const ringkas = `<div class="kartu glass lp-ring"><div class="kartu-hd">${push}<span class="mono">${esc(kode.branch ?? '')}</span></div>
    <div class="angka"><div><div class="angka-k">Commit</div><div class="angka-v">${kode.commits.length}</div></div><div><div class="angka-k">Berkas</div><div class="angka-v">${semua.length}</div></div><div><div class="angka-k">Baris</div><div class="angka-v"><span class="ok-t">+${ribu(tambah)}</span> <small class="bad-t">−${ribu(hapus)}</small></div></div></div>
    ${kode.belumDicatat ? `<p class="warn-t">! ${kode.belumDicatat} commit lebih baru di branch belum dicatat.</p>` : ''}</div>`
  if (c.galat)
    return kerangka('ui', {
      rel: relKerja(butir, pilih),
      stage: `<div class="errbox" role="alert">${esc(c.galat)}</div>`,
      side: ringkas,
    })
  const pesan = `<div class="kartu glass kartu-trx"><div class="kartu-hd"><span>Commit <span class="mono">${esc(pendek(c.sha))}</span> · ${esc(c.penulis)} · ${esc(jamPendek(c.tanggal))}</span></div><h1>${esc(c.judul)}</h1>${c.isi ? `<div class="kj-md kj-pesan">${mdRingan(pesanCommitMd(c.isi))}</div>` : ''}</div>`
  const tb = c.berkas.reduce((a, b) => a + (b.tambah ?? 0), 0)
  const hb = c.berkas.reduce((a, b) => a + (b.hapus ?? 0), 0)
  const grup = new Map()
  for (const b of c.berkas) {
    const atas = b.path.includes('/') ? b.path.split('/')[0] : '(akar)'
    grup.set(atas, [...(grup.get(atas) ?? []), b])
  }
  const berkas = [...grup]
    .map(
      ([atas, daftar]) =>
        `<div class="db-eyebrow kj-grup-berkas">${esc(atas)} · ${daftar.length} berkas</div><div class="kj-berkas-daftar">${daftar
          .map((b) => {
            const i = b.path.lastIndexOf('/')
            const dir = i >= 0 ? b.path.slice(0, i + 1) : ''
            const nama = i >= 0 ? b.path.slice(i + 1) : b.path
            const isi = b.diff
              ? `<pre class="kj-diff">${barisDiff(b.diff)}</pre>${b.terpotong ? '<p class="dim kj-catatan-kecil">Diff dipotong karena terlalu besar; lihat lengkapnya dengan git.</p>' : ''}`
              : '<p class="dim kj-catatan-kecil">Berkas biner atau tanpa perubahan isi.</p>'
            return `<details class="kj-berkas" data-k="${esc(`${c.sha}:${b.path}`)}"><summary class="kj-berkas-hd"><span class="kj-chev" aria-hidden="true">›</span><span class="mono kj-path"><span class="dim">${esc(dir)}</span>${esc(nama)}</span><span class="kj-angka"><span class="ok-t">+${b.tambah ?? '–'}</span> <span class="bad-t">−${b.hapus ?? '–'}</span></span>${batangDiff(b.tambah, b.hapus)}</summary>${isi}</details>`
          })
          .join('')}</div>`,
    )
    .join('')
  return kerangka('ui', {
    rel: relKerja(butir, pilih),
    stage: `<div class="kj-kode-hd"><span class="mono">${esc(pendek(c.sha))}</span><span>${esc(c.judul)}</span><span class="dim kj-ka">${c.berkas.length} berkas · <span class="ok-t">+${ribu(tb)}</span> <span class="bad-t">−${ribu(hb)}</span></span><button type="button" class="btn tb kj-kecil" data-kj-buka-semua>Buka semua</button></div>${berkas}`,
    side: `${ringkas}${pesan}`,
  })
}

/** Tab Catatan: catatan kerja versi penuh; riwayat lengkap per tahap di panel kanan. */
export function tabCatatan(d) {
  const k = d.kerja
  const grup = []
  for (const r of [...k.riwayat].reverse()) {
    if (grup.at(-1)?.tahap === r.tahap) grup.at(-1).isi.push(r)
    else grup.push({ tahap: r.tahap, isi: [r] })
  }
  const riwayat = `<div class="kartu glass" id="kj-riwayat"><div class="kj-ring-hd"><h2>Riwayat</h2><span class="dim kj-ring-meta">${k.riwayat.length} butir · terbaru di atas</span></div>${grup
    .map(
      (g) =>
        `<div class="kj-rw-grup"><div class="kj-rw-grup-hd"><span class="st-chip ${g.tahap === k.tahap ? 'info' : 'idle'}">${esc(LABEL_TAHAP[g.tahap] ?? g.tahap)}</span><span class="kj-garis"></span></div><ul class="kj-riwayat">${g.isi
          .map(
            (r) =>
              `<li><span class="kj-rw-penuh">${esc(r.catatan)}</span><span class="dim kj-rw-w">${esc(jamPendek(r.at))}</span></li>`,
          )
          .join('')}</ul></div>`,
    )
    .join('')}</div>`
  return kerangka('ui', {
    rel: relKerja(
      [
        {
          no: 1,
          label: 'C',
          status: d.catatan ? 'lulus' : 'menunggu s-kosong',
          judul: 'Catatan kerja',
        },
        { no: 2, label: 'R', status: 'lulus', judul: 'Riwayat' },
      ],
      null,
      'data-kj-loncat',
    ),
    stage: `<article class="kartu glass kj-dok" id="kj-catatan"><div class="kj-ring-hd"><span class="db-eyebrow">Catatan</span><span class="mono dim kj-ring-ket">kerja/${esc(k.key)}/catatan.md</span></div>${d.catatan ? `<div class="kj-md">${mdRingan(d.catatan)}</div>` : `<p class="dim">Belum ada catatan. Tulis di <code>kerja/${esc(k.key)}/catatan.md</code>: apa yang diminta, di mana fiturnya di v2, dan kriteria yang dicek.</p>`}</article>`,
    side: riwayat,
  })
}

// ── Ringkasan (di atas laporan) ─────────────────────────────────────────────

/** Tiket tanpa baris judul (# KEY · judul) dan baris status Plane — itu sudah di bar atas. */
export function tiketTanpaKepala(md) {
  return (md ?? '')
    .split('\n')
    .filter((b, i) => !(i < 4 && (/^#\s/.test(b) || /^Status Plane:/.test(b))))
    .join('\n')
    .trim()
}

/** Keterangan kecil di kepala Tugas: modul pertama dari "Scope / Modules Affected" + Ref Request. */
export function refTiket(md) {
  const baris = (md ?? '').split('\n')
  const i = baris.findIndex((b) => /Scope\s*\/\s*Modules Affected/i.test(b))
  const modul = i >= 0 ? baris.slice(i + 1).find((b) => /^\s*-\s+/.test(b)) : null
  const req = (md ?? '').match(/Ref Request:\s*([A-Z]+-[\d-]+)/)?.[1]
  return [
    modul
      ?.replace(/^\s*-\s+/, '')
      .split(/[:(]/)[0]
      .trim(),
    req,
  ]
    .filter(Boolean)
    .join(' · ')
}

/** Poin pekerjaan dari pesan commit: butir "- " (baris lanjutan digabung), tanpa trailer. */
export function poinCommit(kode) {
  const poin = []
  for (const c of kode?.commits ?? []) {
    if (c.galat) continue
    let kini = null
    for (const b of String(c.isi ?? '').split('\n')) {
      if (/^(Co-Authored-By|Signed-off-by):/i.test(b.trim())) break
      if (/^\s*-\s+/.test(b)) {
        kini = b.replace(/^\s*-\s+/, '').trim()
        poin.push(kini)
      } else if (kini !== null && b.trim()) {
        poin[poin.length - 1] = `${poin[poin.length - 1]} ${b.trim()}`
      } else kini = null
    }
  }
  return poin
}

/** Teks bukti tanpa rujukan berkas lokal, plus berkas gambarnya (relatif ke kerja/<KEY>/). */
export function pisahBukti(bukti) {
  const berkas = []
  const teks = String(bukti ?? '')
    .replace(/\s*\(([^()]*\.(?:png|jpe?g|webp))\)/gi, (_m, f) => {
      berkas.push(...f.split(/\s*,\s*/).filter((x) => /\.(png|jpe?g|webp)$/i.test(x)))
      return ''
    })
    .trim()
  return { teks, berkas }
}

const lipat = (id, judul, isi, tinggi, buka) =>
  `<div class="kj-lipat${buka ? ' buka' : ''}" data-kj-lipat="${id}" style="--kj-lipat-h:${tinggi}px"><div class="kj-lipat-isi kj-md">${isi}</div></div><button type="button" class="btn tb kj-kecil kj-lipat-tombol" data-kj-buka="${id}" aria-expanded="${buka}">${buka ? `Ringkas ${judul} ↑` : `Tampilkan ${judul} lengkap ↓`}</button>`

/** Bilah tahap kerja satu baris: langkah (bisa diklik) + ringkasan Plane · Kriteria · Kode. */
export function bilahTahap(d, kode = null, cekPlane = null) {
  const k = d.kerja
  const c = hitungCek(k)
  const kini = TAHAP.findIndex(([x]) => x === k.tahap)
  const langkah = TAHAP.map(([id, l], i) => {
    const kelas = i < kini ? 'lewat' : i === kini ? 'kini' : 'belum'
    const tanda = i < kini ? '<span class="ok-t">✓</span>' : `<span class="no">${i + 1}</span>`
    return `<li class="${kelas}"><button type="button" data-kj-tahap="${id}" title="Pindah ke tahap ${esc(l)}"${i === kini ? ' aria-current="step"' : ''}>${tanda}${esc(l)}</button></li>`
  }).join('<li class="kj-pemisah" aria-hidden="true">›</li>')
  const nKode = jumlahKode(k, kode)
  const kodeTeks = !nKode
    ? '<span class="dim">tanpa kode</span>'
    : kode?.diRemote === false || kode?.belumDiPush
      ? '<span class="warn-t">! belum di-push</span>'
      : kode?.diRemote
        ? '<span class="ok-t">✓ di remote</span>'
        : `${nKode} commit`
  return `<div class="kartu glass kj-bilah"><span class="db-eyebrow">Tahap kerja</span><ol class="kj-langkah" aria-label="Tahap kerja">${langkah}</ol>
    <span class="kj-bilah-ringkas"><span class="kj-bilah-plane">${statusPlane(d, cekPlane, { chip: true })}</span><span><span class="dim">Kriteria</span> <span class="${c.gagal ? 'bad-t' : c.total && c.lulus === c.total ? 'ok-t' : ''}">${c.gagal ? '×' : c.total && c.lulus === c.total ? '✓' : ''} ${c.lulus}/${c.total}</span></span><span><span class="dim">Kode</span> ${kodeTeks}</span></span></div>`
}

/** Kartu Tugas di Plane: deskripsi tiket apa adanya, dipotong 170 px dengan buka/tutup. */
function kartuTugas(d, buka) {
  const k = d.kerja
  const ref = refTiket(d.tiket)
  const isi = tiketTanpaKepala(d.tiket)
  return `<article class="kartu glass kj-ring-kartu"><div class="kj-ring-hd"><h2>Tugas di Plane</h2>${ref ? `<span class="dim kj-ring-ket">${esc(ref)}</span>` : ''}<a class="btn tb kj-kecil" href="${esc(k.url)}" target="_blank" rel="noopener">Buka di Plane ↗</a></div>
    ${isi ? lipat('tiket', 'tiket', mdRingan(isi), 170, buka.has('tiket')) : '<p class="dim">Deskripsi tiket belum disalin. Jalankan <code>bun run kerja ambil</code> untuk menyalin ulang.</p>'}</article>`
}

/** Kartu Yang dilakukan: poin dari commit (atau riwayat), keputusan terbuka, lalu catatan kerja. */
function kartuDilakukan(d, kode, buka) {
  const k = d.kerja
  const poin = poinCommit(kode)
  const riwayat = k.riwayat
    .filter((r) => r.tahap === 'dikerjakan' && r.catatan)
    .map((r) => r.catatan)
  const daftar = (poin.length ? poin : riwayat).slice(0, 5)
  const terbuka = (k.verifikasi ?? []).filter((c) => c.hasil !== 'lulus')
  const pernahAI = k.riwayat.some((r) => r.tahap === 'dikerjakan') || k.commit?.length
  const commits = (kode?.commits ?? []).filter((c) => !c.galat)
  const berkas = commits.flatMap((c) => c.berkas)
  const tambah = berkas.reduce((a, b) => a + (b.tambah ?? 0), 0)
  const hapus = berkas.reduce((a, b) => a + (b.hapus ?? 0), 0)
  const meta = commits.length
    ? `${commits.length === 1 ? `commit <span class="mono">${esc(pendek(commits[0].sha))}</span>` : `${commits.length} commit`} · ${berkas.length} berkas · <span class="ok-t">+${tambah}</span> <span class="bad-t">−${hapus}</span> · ${esc(jamPendek(commits.at(-1).tanggal))}`
    : k.commit?.length
      ? `${k.commit.length} commit · memuat…`
      : ''
  const butir = [
    ...daftar.map(
      (t) =>
        `<li><span class="ok-t" aria-label="selesai">✓</span><span>${esc(t).replace(/`([^`]+)`/g, '<code>$1</code>')}</span></li>`,
    ),
    ...terbuka.map(
      (c) =>
        `<li><span class="${c.hasil === 'gagal' ? 'bad-t' : 'warn-t'}" aria-label="${c.hasil === 'gagal' ? 'gagal' : 'terbuka'}">${c.hasil === 'gagal' ? '×' : '!'}</span><span>${c.hasil === 'gagal' ? 'Gagal' : 'Belum diputuskan'}: ${esc(c.kriteria)}</span></li>`,
    ),
  ].join('')
  const catatan = d.catatan
    ? lipat('catatan', 'catatan', mdRingan(d.catatan), 180, buka.has('catatan'))
    : `<p class="dim">Belum ada catatan. Tulis di <code>kerja/${esc(k.key)}/catatan.md</code>.</p>`
  return `<article class="kartu glass kj-ring-kartu"><div class="kj-ring-hd"><h2>Yang dilakukan</h2><span class="chip">${pernahAI ? 'Dikerjakan (AI)' : 'Verifikasi saja'}</span>${meta ? `<span class="dim kj-ring-meta">${meta}</span>` : ''}</div>
    ${butir ? `<ul class="kj-poin">${butir}</ul>` : '<p class="dim">Belum ada pekerjaan tercatat.</p>'}
    <div class="kj-catatan-kerja"><div class="kj-ring-hd"><span class="db-eyebrow">Catatan kerja</span><span class="mono dim kj-ring-ket">kerja/${esc(k.key)}/catatan.md</span></div>${catatan}</div></article>`
}

/** Kartu Bukti: Kriteria (buka di tempat), Layar, Data, Kode (tautan ke tab laporan). */
function kartuBukti(d, kode, buka) {
  const k = d.kerja
  const c = hitungCek(k)
  const ringkasCek = c.gagal
    ? `<span class="bad-t">× ${c.gagal} gagal</span>`
    : c.total && c.lulus === c.total
      ? '<span class="ok-t">✓ semua lulus</span>'
      : `<span class="dim">○ ${c.total - c.lulus} belum</span>`
  const potret = (f) =>
    k.potret[f]
      ? `<span class="ok-t">✓</span> ${esc(JAM(k.potret[f].at))}`
      : '<span class="dim">○</span>'
  const galatDb = d.db.filter((q) => q.galatSebelum || q.galatSesudah).length
  const nKode = jumlahKode(k, kode)
  const push = !nKode
    ? 'tanpa kode'
    : kode?.diRemote
      ? kode.belumDiPush
        ? `<span class="warn-t">! ${kode.belumDiPush} belum di-push</span>`
        : '<span class="ok-t">✓ di remote</span>'
      : kode?.diRemote === false
        ? '<span class="warn-t">! belum di-push</span>'
        : 'commit'
  const kriteria = (k.verifikasi ?? [])
    .map((x) => {
      const [t, kelas] = TANDA_CEK[x.hasil] ?? TANDA_CEK.belum
      const { teks, berkas } = pisahBukti(x.bukti)
      const mini = berkas
        .map(
          (f) =>
            `<a class="kj-mini" href="/kerja/${esc(k.key)}/${esc(f)}" target="_blank" rel="noopener" title="${esc(f)}" aria-label="Buka bukti ${esc(f)}"><img src="/kerja/${esc(k.key)}/${esc(f)}" alt="" loading="lazy"><span class="perbesar" aria-hidden="true">⤢</span></a>`,
        )
        .join('')
      return `<li><span class="${kelas}" aria-label="${esc(x.hasil)}">${t}</span><div><div class="t">${esc(x.kriteria)}</div>${teks ? `<div class="b">${esc(teks)}</div>` : ''}${mini ? `<div class="kj-mini-baris">${mini}</div>` : ''}</div></li>`
    })
    .join('')
  const baris = (id, label, isi) =>
    `<a class="kj-bukti-baris" href="#/kerja/${esc(k.key)}/${id}" data-kj-ke="${id}"><span class="db-eyebrow">${label}</span>${isi}<span class="dim kj-panah" aria-hidden="true">›</span></a>`
  return `<div class="kartu glass kj-ring-kartu"><h2>Bukti</h2>
    <button type="button" class="kj-bukti-baris" data-kj-buka="kriteria" aria-expanded="${buka.has('kriteria')}"><span class="db-eyebrow">Kriteria</span><b>${c.lulus}/${c.total}</b><span class="kj-bukti-s">${ringkasCek}</span><span class="dim kj-panah" aria-hidden="true">${buka.has('kriteria') ? '▴' : '▾'}</span></button>
    <div class="kj-lipat-kriteria"${buka.has('kriteria') ? '' : ' hidden'} data-kj-lipat="kriteria">${kriteria ? `<ul class="kj-cek">${kriteria}</ul>` : '<p class="dim">Belum ada kriteria yang dicek.</p>'}</div>
    ${baris('layar', 'Layar', `<b>${k.target.layar.length}</b><span class="kj-bukti-s dim">halaman · ${potret('sebelum')} · ${potret('sesudah')}</span>`)}
    ${baris('data', 'Data', `<b>${d.db.length}</b><span class="kj-bukti-s dim">query · ${d.db.filter((q) => q.perubahan?.length).length} berubah · <span class="${galatDb ? 'bad-t' : ''}">${galatDb} gagal</span></span>`)}
    ${baris('kode', 'Kode', `<b>${nKode}</b><span class="kj-bukti-s dim">commit · ${push}</span>`)}</div>`
}

/** Riwayat terbaru: 5 butir, label tahap abu, teks dua baris. */
function riwayatTerbaru(k, n = 5) {
  return `<div class="kartu glass kj-ring-kartu"><div class="kj-ring-hd"><h2>Riwayat terbaru</h2><a class="btn tb kj-kecil" href="#/kerja/${esc(k.key)}/catatan" data-kj-ke="catatan">Semua ›</a></div><ul class="kj-riwayat">${[
    ...k.riwayat,
  ]
    .reverse()
    .slice(0, n)
    .map(
      (r) =>
        `<li><span class="kj-rw"><span class="dim">${esc(LABEL_TAHAP[r.tahap] ?? r.tahap)} · </span>${esc(r.catatan)}</span><span class="dim kj-rw-w">${esc(jamPendek(r.at))}</span></li>`,
    )
    .join('')}</ul></div>`
}

/** Ringkasan: bilah tahap, lalu dua kolom (Tugas + Yang dilakukan | Bukti + Riwayat). */
export function ringkasanKerja(d, kode = null, buka = new Set(), cekPlane = null) {
  return `<section class="kj-ringkas" aria-label="Ringkasan">${bilahTahap(d, kode, cekPlane)}
    <div class="kj-ringkas-kolom"><div class="kj-ringkas-kiri">${kartuTugas(d, buka)}${kartuDilakukan(d, kode, buka)}</div>
    <div class="kj-ringkas-kanan">${kartuBukti(d, kode, buka)}${riwayatTerbaru(d.kerja)}</div></div></section>`
}

/**
 * Laporan Kerja lengkap: { bar, view }. Ringkasan di atas, lalu laporan bertab (layar | data |
 * kode | catatan) di bawahnya. `pilih` = nomor di rel; `mode` = tampilan layar; `buka` = bagian
 * ringkasan yang dibuka (tiket, catatan, kriteria).
 * @param {any} d hasil /api/kerja/<KEY>
 * `kunci` = kunci dari rute (bar saat memuat/gagal); `cekPlane` = 'memeriksa' | 'gagal' | null;
 * `kabar` = HTML pil kabar sesudah aksi (mis. komentar terkirim).
 * @param {{ tab?: string, pilih?: number, mode?: string, galat?: string | null, sibuk?: string | null, kode?: any, kodeGalat?: string | null, kembali?: string, buka?: Set<string>, sinkron?: boolean, kunci?: string, cekPlane?: string | null, kabar?: string | null }} [o]
 */
export function laporanKerja(d, o = {}) {
  const tab = TAB_KERJA.some(([id]) => id === o.tab) ? o.tab : 'layar'
  if (!d)
    return o.galat
      ? kerjaGagal(o.kunci, o.galat, o.kembali ?? '‹')
      : kerjaMemuat(o.kunci, o.kembali ?? '‹')
  const pilih = Math.max(1, Number(o.pilih) || 1)
  const sibuk = o.sibuk
    ? `<div class="kj-sibuk glass" role="status"><span class="putar" aria-hidden="true"></span>${esc(o.sibuk)}…</div>`
    : o.kabar
      ? `<div class="kj-sibuk glass" role="status">${o.kabar}</div>`
      : ''
  const galat = o.galat
    ? `<div class="errbox kj-galat-atas" role="alert"><div class="mono">${esc(o.galat)}</div></div>`
    : ''
  const isi =
    tab === 'data'
      ? tabData(d, { pilih, sibuk: o.sibuk })
      : tab === 'kode'
        ? tabKode(d, o.kode, { pilih, galat: o.kodeGalat })
        : tab === 'catatan'
          ? tabCatatan(d)
          : tabLayar(d, {
              pilih,
              mode: o.mode ?? 'sesudah',
              sibuk: o.sibuk,
              sinkron: o.sinkron ?? true,
            })
  return {
    bar: barKerja(d, { kembali: o.kembali, cekPlane: o.cekPlane }),
    view: `<div class="kj-halaman">${galat}${sibuk}${ringkasanKerja(d, o.kode, o.buka ?? new Set(), o.cekPlane)}<section class="kj-laporan" id="kj-laporan"><div class="kj-sentinel" id="kj-sentinel" aria-hidden="true"></div>${kepalaLaporanKerja(d, tab, o.kode)}${isi}</section></div>`,
  }
}

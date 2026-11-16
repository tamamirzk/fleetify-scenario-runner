// Halaman Kerja satu tiket (GET /api/kerja/<KEY>): tahap, aksi (potret, tulis ke Plane, perintah AI),
// tiket dan rencana, perbandingan layar sebelum/sesudah, beda data DB, riwayat. Fungsi murni → HTML.

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )

export const TAHAP = [
  ['diambil', 'Diambil'],
  ['rencana', 'Rencana & sebelum'],
  ['dikerjakan', 'Dikerjakan'],
  ['dokumentasi', 'Sesudah & skenario'],
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

/** Markdown sederhana → HTML (judul, butir, kode, paragraf); cukup untuk rencana.md dan tiket.md. */
export function mdRingan(md) {
  if (!md) return ''
  const out = []
  let daftar = false
  let kode = false
  for (const baris of md.split('\n')) {
    if (baris.startsWith('```')) {
      if (daftar) {
        out.push('</ul>')
        daftar = false
      }
      out.push(kode ? '</code></pre>' : '<pre class="kj-kode"><code>')
      kode = !kode
      continue
    }
    if (kode) {
      out.push(`${esc(baris)}\n`)
      continue
    }
    const isi = esc(baris)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    const h = baris.match(/^(#{1,4})\s+(.*)$/)
    const li = baris.match(/^\s*[-*]\s+(.*)$/)
    if (li) {
      if (!daftar) {
        out.push('<ul>')
        daftar = true
      }
      out.push(`<li>${isi.replace(/^\s*[-*]\s+/, '')}</li>`)
      continue
    }
    if (daftar) {
      out.push('</ul>')
      daftar = false
    }
    if (h)
      out.push(
        `<h${Math.min(4, h[1].length + 2)}>${isi.replace(/^#+\s+/, '')}</h${Math.min(4, h[1].length + 2)}>`,
      )
    else if (baris.trim()) out.push(`<p>${isi}</p>`)
  }
  if (daftar) out.push('</ul>')
  if (kode) out.push('</code></pre>')
  return out.join('')
}

const PONSEL = new Set(['mbl.driver', 'mbl.mechanic'])
const gambar = (key, fase, file, alt, sebagai) =>
  file
    ? `<a class="kj-gbr${PONSEL.has(sebagai) ? ' ponsel' : ''}" href="/kerja/${esc(key)}/${fase}/${esc(file)}" target="_blank" rel="noopener" title="Buka ukuran penuh"><img src="/kerja/${esc(key)}/${fase}/${esc(file)}" alt="${esc(alt)}" loading="lazy"><span class="kj-penuh">Ukuran penuh ↗</span></a>`
    : '<div class="kj-kosong">Belum dipotret</div>'

/** Perbandingan layar: tiap target berdampingan sebelum | sesudah. */
export function bandingLayar(k) {
  if (!k.target.layar.length) return '<div class="dim">Belum ada target layar.</div>'
  return k.target.layar
    .map((t) => {
      const a = k.potret.sebelum?.layar.find((x) => x.nama === t.nama)
      const b = k.potret.sesudah?.layar.find((x) => x.nama === t.nama)
      const galat = (x) => (x?.galat ? `<div class="bad-t kj-galat">${esc(x.galat)}</div>` : '')
      return `<article class="kj-banding"><header><b>${esc(t.nama)}</b><span class="dim">${esc(t.keterangan ?? '')}</span><code>${esc(t.rute)}</code><span class="chip">${esc(t.sebagai)}</span></header>
        <div class="kj-dua"><figure><figcaption>Sebelum</figcaption>${gambar(k.key, 'sebelum', a?.file, `${t.nama} sebelum`, t.sebagai)}${galat(a)}</figure><figure><figcaption>Sesudah</figcaption>${gambar(k.key, 'sesudah', b?.file, `${t.nama} sesudah`, t.sebagai)}${galat(b)}</figure></div></article>`
    })
    .join('')
}

const tabel = (baris, galat = null) => {
  if (galat) return `<div class="kj-kosong bad-t">Gagal: ${esc(galat)}</div>`
  if (!baris) return '<div class="kj-kosong">Belum dipotret</div>'
  if (!baris.length) return '<div class="dim">0 baris</div>'
  const kolom = Object.keys(baris[0])
  const sel = (v) => esc(typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '∅'))
  return `<div class="kj-tabel"><table><thead><tr>${kolom.map((c) => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${baris
    .slice(0, 20)
    .map((b) => `<tr>${kolom.map((c) => `<td>${sel(b[c])}</td>`).join('')}</tr>`)
    .join(
      '',
    )}</tbody></table>${baris.length > 20 ? `<div class="dim">… ${baris.length - 20} baris lagi</div>` : ''}</div>`
}

/** Data DB: per query, ringkasan beda lalu tabel sebelum | sesudah. */
export function bandingDb(db) {
  if (!db.length) return '<div class="dim">Belum ada target query DB.</div>'
  return db
    .map((q) => {
      const b = q.beda
      const ringkas = b
        ? `<span class="chip ${b.ditambah ? 'ok' : ''}">+${b.ditambah} baris</span><span class="chip ${b.dihapus ? 'bad' : ''}">−${b.dihapus} baris</span><span class="chip ${b.berubah ? 'warn' : ''}">${b.berubah} berubah${b.kolom.length ? `: ${esc(b.kolom.join(', '))}` : ''}</span>`
        : '<span class="dim">Beda tampil setelah sebelum dan sesudah dipotret</span>'
      return `<article class="kj-banding"><header><b>${esc(q.nama)}</b><span class="dim">${esc(q.keterangan ?? '')}</span></header>
        <div class="kj-beda">${ringkas}</div>
        <details class="kj-sql"><summary>SQL</summary><pre class="kj-kode"><code>${esc(q.sql)}</code></pre></details>
        <div class="kj-dua"><div><div class="kj-label">Sebelum</div>${tabel(q.sebelum, q.galatSebelum)}</div><div><div class="kj-label">Sesudah</div>${tabel(q.sesudah, q.galatSesudah)}</div></div></article>`
    })
    .join('')
}

/**
 * Isi halaman Kerja.
 * @param {any} d hasil /api/kerja/<KEY>
 */
export function halamanKerja(d, { galat = null, sibuk = null } = {}) {
  if (galat && !d)
    return `<div class="titlerow"><div class="titlebox"><div class="ctx"><a href="#/dasbor">Dashboard</a></div><h1>Kerja</h1></div></div><div class="errbox" role="alert"><b>Kerja gagal dimuat</b><div class="mono">${esc(galat)}</div></div>`
  if (!d) return '<div class="empty">Memuat…</div>'
  const k = d.kerja
  const tombol = (id, label, extra = '') =>
    `<button type="button" class="btn tb${extra}" id="${id}" ${sibuk ? 'disabled' : ''}>${esc(label)}</button>`
  const kosongTarget = !k.target.layar.length && !k.target.db.length
  return `<div class="titlerow"><div class="titlebox"><div class="ctx"><a href="#/dasbor">Dashboard</a> › <a href="${esc(k.url)}" target="_blank" rel="noopener">${esc(k.key)}</a> · Plane: ${esc(k.plane.status)}</div><h1 class="kj-h1">${esc(k.judul)}</h1></div></div>
    ${langkahTahap(k.tahap)}
    ${galat ? `<div class="errbox" role="alert"><div class="mono">${esc(galat)}</div></div>` : ''}
    ${sibuk ? `<div class="kj-sibuk" role="status">${esc(sibuk)}…</div>` : ''}
    <div class="kj-aksi">
      ${tombol('kj-salin', 'Salin perintah AI', ' utama-tb')}
      ${tombol('kj-potret-sebelum', k.potret.sebelum ? 'Potret ulang sebelum' : 'Potret sebelum')}
      ${tombol('kj-potret-sesudah', k.potret.sesudah ? 'Potret ulang sesudah' : 'Potret sesudah')}
      ${tombol('kj-komentar', 'Komentar ke Plane…')}
      ${tombol('kj-status', 'Pindah status Plane…')}
      ${tombol('kj-ambil', 'Segarkan dari Plane')}
    </div>
    ${kosongTarget ? '<div class="kj-catatan">Belum ada target potret. Di tahap Rencana, AI menulis halaman dan query yang perlu dipotret lewat <code>bun run kerja target</code>.</div>' : ''}
    <div class="kj-kisi">
      <section class="db-kartu"><h2>Ringkasan</h2><dl class="kj-dl">
        <dt>Branch v2</dt><dd>${k.branch ? `<code>${esc(k.branch)}</code>` : '–'}</dd>
        <dt>Commit</dt><dd>${k.commit.length ? k.commit.map((c) => `<code>${esc(c)}</code>`).join(' ') : '–'}</dd>
        <dt>Skenario</dt><dd>${k.skenario.length ? k.skenario.map((s) => `<a class="tg-sk" href="#/ringkasan/${esc(s)}">${esc(s)}</a>`).join(' ') : '–'}</dd>
        <dt>Sebelum</dt><dd>${waktu(k.potret.sebelum?.at)}</dd>
        <dt>Sesudah</dt><dd>${waktu(k.potret.sesudah?.at)}</dd>
        <dt>Komentar Plane</dt><dd>${waktu(k.plane.komentar_at)}</dd>
      </dl></section>
      <section class="db-kartu"><h2>Riwayat</h2><ol class="db-waktu">${[...k.riwayat]
        .reverse()
        .map(
          (r) =>
            `<li><span class="db-jenis kerja">${esc(TAHAP.find(([x]) => x === r.tahap)?.[1] ?? r.tahap)}</span><span></span><span class="db-teks" title="${esc(r.catatan)}">${esc(r.catatan)}</span><span class="dim">${esc(waktu(r.at))}</span></li>`,
        )
        .join('')}</ol></section>
    </div>
    <section class="db-kartu"><h2>Rencana</h2>${d.rencana ? `<div class="kj-md">${mdRingan(d.rencana)}</div>` : `<div class="dim">Belum ada rencana. AI menulisnya di <code>kerja/${esc(k.key)}/rencana.md</code> pada tahap Rencana.</div>`}</section>
    <section class="db-kartu"><h2>Layar · sebelum dan sesudah</h2>${bandingLayar(k)}</section>
    <section class="db-kartu"><h2>Data · sebelum dan sesudah</h2>${bandingDb(d.db)}</section>
    <details class="db-kartu kj-tiket"><summary><h2>Tiket Plane</h2></summary><div class="kj-md">${mdRingan(d.tiket ?? '')}</div></details>`
}

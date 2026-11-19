// Halaman Dasbor operasional (GET /api/dasbor), sesuai docs/desain/dasbor/SPEK.md:
// Sedang dikerjakan, lima kotak angka, heatmap jalan 24 minggu, Produktivitas uji per minggu,
// radar Skenario per grup, Temuan dan Aktivitas terbaru. Fungsi murni → HTML (diuji Vitest).
// Warna hanya untuk arti (biru = tahap aktif, hijau = lulus, merah = gagal, oranye = perhatian),
// dan setiap status juga punya ikon atau teks.

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const HARI = ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min']
const HARI_PANJANG = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu']
const dua = (n) => String(n).padStart(2, '0')
const tgl = (s) => new Date(`${s}T00:00:00`)
const jam = (iso) => {
  const d = new Date(iso)
  return `${dua(d.getHours())}.${dua(d.getMinutes())}`
}
const tanggalJam = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getDate()} ${BULAN[d.getMonth()]}, ${jam(iso)}`
}
/** Waktu ringkas daftar: jam saja bila hari ini, selain itu "16 Nov 10.08". */
const waktuRingkas = (iso, now = new Date()) => {
  if (!iso) return ''
  const d = new Date(iso.replace(' ', 'T'))
  if (Number.isNaN(d.getTime())) return iso
  const hariIni = d.toDateString() === now.toDateString()
  return hariIni ? jam(d) : `${d.getDate()} ${BULAN[d.getMonth()]} ${jam(d)}`
}

const IKON = {
  putar: '<circle cx="12" cy="12" r="9"/><path d="M10 8.5l6 3.5-6 3.5z"/>',
  orang: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  kisi: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  centang: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  kutu: '<rect x="7" y="8" width="10" height="12" rx="5"/><path d="M12 8v12M7 13H3M21 13h-4M8 5l2 3M16 5l-2 3"/>',
  batang: '<path d="M5 20V11M10 20V5M15 20v-6M20 20V9"/>',
  panah: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  salin:
    '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 00-1-1H5a1 1 0 00-1 1v10a1 1 0 001 1h3"/>',
  kanan: '<path d="M9 6l6 6-6 6"/>',
  kiri: '<path d="M15 6l-6 6 6 6"/>',
  radar: '<path d="M12 3l8 6-3 10H7L4 9z"/>',
  bendera: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
  jam: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  bulat: '<circle cx="12" cy="12" r="7"/>',
}
const ikon = (n, ukuran = 16) =>
  `<svg class="db-ikon" width="${ukuran}" height="${ukuran}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">${IKON[n]}</svg>`
const ikonHeatmap =
  '<svg class="db-ikon" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="3" y="3" width="4.5" height="4.5" rx="1"/><rect x="9.75" y="3" width="4.5" height="4.5" rx="1"/><rect x="16.5" y="3" width="4.5" height="4.5" rx="1"/><rect x="3" y="9.75" width="4.5" height="4.5" rx="1"/><rect x="9.75" y="9.75" width="4.5" height="4.5" rx="1"/><rect x="16.5" y="9.75" width="4.5" height="4.5" rx="1"/><rect x="3" y="16.5" width="4.5" height="4.5" rx="1"/><rect x="9.75" y="16.5" width="4.5" height="4.5" rx="1"/><rect x="16.5" y="16.5" width="4.5" height="4.5" rx="1"/></svg>'

/** Kepala kartu: ikon, judul, label opsional, aksi di kanan. */
const kepalaKartu = (id, ik, judul, { label = '', aksi = '' } = {}) =>
  `<div class="db-kk">${ik}<h2 id="${id}">${esc(judul)}</h2>${label}${aksi ? `<span class="db-kk-aksi">${aksi}</span>` : ''}</div>`
const chip = (href, teks) => `<a class="db-chip" href="${href}">${teks} ${ikon('kanan', 12)}</a>`
const blokAngka = (label, angka, ket = '', sub = '') =>
  `<div class="db-blok"><span class="db-eyebrow">${esc(label)}</span><span>${angka}${ket ? ` ${ket}` : ''}</span>${sub ? `<span class="db-ket dim">${sub}</span>` : ''}</div>`
const kosong = '<span class="db-big redup">–</span>'

// ——— 3.1 Sedang dikerjakan ———

export const TAHAP = [
  ['diambil', 'Diambil'],
  ['dipelajari', 'Dipelajari'],
  ['dikerjakan', 'Dikerjakan (AI)'],
  ['diverifikasi', 'Diverifikasi'],
  ['didokumentasikan', 'Didokumentasikan'],
  ['selesai', 'Selesai'],
]
export const LANGKAH_BERIKUT = {
  diambil:
    'Pelajari tiket: tulis catatan (apa yang diminta, di mana fiturnya di v2, kriteria), lalu potret sebelum.',
  dipelajari:
    'AI mengimplementasikan di v2 bila fiturnya belum ada; bila sudah ada, langsung cek tiap kriteria.',
  dikerjakan: 'AI menyelesaikan kode di branch tiket, lalu tiap kriteria dicek dan dicatat (✓/×).',
  diverifikasi: 'Potret sesudah. Tulis atau tautkan skenario modul bila alurnya baru atau berubah.',
  didokumentasikan: 'Kirim komentar verifikasi ke Plane dan pindah status (terlihat tim).',
  selesai: 'Tiket selesai. Ambil tiket berikutnya di Tugas saya.',
}

/** Penanda lima tahap: selesai (✓), sekarang (biru), berikutnya, belum. */
export function penandaTahap(no) {
  return `<ol class="db-tahap" aria-label="Tahap ${no} dari ${TAHAP.length}">${TAHAP.map(
    ([, nama], i) => {
      const n = i + 1
      const kelas = n < no ? 'lewat' : n === no ? 'kini' : n === no + 1 ? 'lanjut' : 'belum'
      const label =
        n === no ? `Tahap ${n} · sekarang` : n === no + 1 ? `Tahap ${n} · berikutnya` : `Tahap ${n}`
      return `<li class="${kelas}"${n === no ? ' aria-current="step"' : ''}><span class="db-tahap-bar"></span><span class="db-tahap-tk"><span class="db-eyebrow">${label}</span><span class="db-tahap-nama">${n < no ? '✓ ' : ''}${esc(nama)}</span></span></li>`
    },
  ).join('')}</ol>`
}

/** Gauge setengah lingkaran: 20 segmen, 4 per tahap. */
export function gauge(no, label) {
  const PER = 3
  const jumlah = TAHAP.length * PER
  const seg = Array.from({ length: jumlah }, (_, i) => {
    const sudut = (-90 + (i * 180) / (jumlah - 1)).toFixed(2)
    const t = Math.floor(i / PER) + 1
    const k = t < no ? 'on' : t === no ? 'kini' : 'off'
    return `<span class="db-gseg ${k}" style="transform:rotate(${sudut}deg) translateY(-102px)"></span>`
  }).join('')
  return `<div class="db-gauge" role="img" aria-label="Kemajuan: tahap ${no} dari ${TAHAP.length}, ${esc(label)}">${seg}<div class="db-gauge-isi"><span class="db-big db-gauge-n">${no}<span class="db-per"> / ${TAHAP.length}</span></span><span class="db-eyebrow">Tahap kerja</span></div></div>`
}

/** Hasil monitoring; yang belum pertama berstatus "Berikutnya". Skenario modul opsional, tidak dihitung. */
export function hasilKerja(k) {
  const v = k.verifikasi ?? { total: 0, belum: 0 }
  const item = [
    ['Catatan', k.catatan],
    ['Potret sebelum', k.sebelum],
    ...(k.pakaiKode ? [['Kode v2 (commit)', k.commit > 0]] : []),
    ['Verifikasi kriteria', v.total > 0 && v.belum === 0],
    ['Potret sesudah', k.sesudah],
    ['Komentar Plane', k.komentar],
  ]
  const n = item.filter(([, ok]) => ok).length
  const pertama = item.findIndex(([, ok]) => !ok)
  const baris = item
    .map(([nama, ok], i) => {
      const st = ok ? 'Ada' : i === pertama ? 'Berikutnya' : 'Belum'
      return `<li class="${ok ? 'ok' : i === pertama ? 'lanjut' : 'belum'}">${ok ? `<span class="ok-t">${ikon('centang', 14)}</span>` : `<span class="redup">${ikon('bulat', 14)}</span>`}<span>${esc(nama)}</span><span class="db-st">${st}</span></li>`
    })
    .join('')
  return `<div class="db-hasil"><div class="db-hasil-hd"><span class="db-eyebrow">Hasil kerja</span><span class="dim db-num">${n} / ${item.length}</span></div><div class="db-hasil-pita" style="grid-template-columns:repeat(${item.length},minmax(0,1fr))" aria-hidden="true">${item.map(([, ok]) => `<span class="${ok ? 'on' : ''}"></span>`).join('')}</div><ul>${baris}</ul></div>`
}

function teksBerikut(k) {
  if (k.memotret) return `Memotret ${esc(k.memotret)}…`
  const gagal = k.queryGagal.length
    ? ` <span class="bad-t">Query ${k.queryGagal.map((q) => `<code>${esc(q)}</code>`).join(', ')} masih gagal.</span>`
    : ''
  return `${esc(LANGKAH_BERIKUT[k.tahap] ?? '')}${gagal}`
}

/** Panel Sedang dikerjakan (tiket aktif terbaru) atau ajakan bila belum ada. */
export function panelAktif(aktif) {
  const kepalaKosong = kepalaKartu('db-aktif-h', ikon('putar'), 'Sedang dikerjakan')
  if (!aktif.length)
    return `<section class="db-panel db-aktif" aria-labelledby="db-aktif-h">${kepalaKosong}<div class="db-ajak"><p>Belum ada tiket yang diambil.</p><p class="dim">Ambil tiket di Tugas saya, atau di sesi Claude Code jalankan <code>/kerjakan FMS-xx</code>.</p><a class="btn db-pil" href="#/tugas">Buka Tugas saya</a></div></section>`
  const [k, ...lain] = aktif
  const n = aktif.length
  const label = lain.length
    ? `<details class="db-lain"><summary class="db-aktif-n db-lain-ringkas"><i class="db-titik"></i>${n} tiket aktif</summary><ul>${lain.map((x) => `<li><a class="db-lain-a" href="#/kerja/${esc(x.key)}"><span class="mono">${esc(x.key)}</span> <span class="dim">tahap ${x.tahapNo} · ${esc(x.label)}</span></a></li>`).join('')}</ul></details>`
    : `<span class="db-aktif-n"><i class="db-titik"></i>${n} tiket aktif</span>`
  const angka = [
    blokAngka(
      'Layar dipotret',
      k.layar ? `<span class="db-big">${k.layar}</span>` : kosong,
      k.layar
        ? k.sesudah
          ? '<span class="db-ket ok-t">✓ sesudah</span>'
          : k.sebelum
            ? '<span class="db-ket ok-t">✓ sebelum</span>'
            : '<span class="db-ket dim">belum dipotret</span>'
        : '<span class="db-ket dim">belum ada target</span>',
    ),
    blokAngka(
      'Query data',
      k.query ? `<span class="db-big">${k.query}</span>` : kosong,
      k.queryGagal.length
        ? `<span class="db-ket bad-t">× ${k.queryGagal.length} gagal</span>`
        : k.query
          ? k.sebelum || k.sesudah
            ? '<span class="db-ket ok-t">✓ terpotret</span>'
            : '<span class="db-ket dim">belum dipotret</span>'
          : '<span class="db-ket dim">belum ada target</span>',
    ),
    ...(k.pakaiKode
      ? [
          blokAngka(
            'Commit',
            k.commit ? `<span class="db-big">${k.commit}</span>` : kosong,
            k.branch
              ? `<span class="db-ket dim mono">${esc(k.branch)}</span>`
              : '<span class="db-ket dim">belum ada branch</span>',
          ),
        ]
      : []),
    blokAngka(
      'Verifikasi',
      k.verifikasi?.total
        ? `<span class="db-big">${k.verifikasi.lulus}<span class="db-per">/${k.verifikasi.total}</span></span>`
        : kosong,
      !k.verifikasi?.total
        ? '<span class="db-ket dim">belum ada kriteria</span>'
        : k.verifikasi.gagal
          ? `<span class="db-ket bad-t">× ${k.verifikasi.gagal} gagal</span>`
          : k.verifikasi.belum
            ? `<span class="db-ket dim">○ ${k.verifikasi.belum} belum</span>`
            : '<span class="db-ket ok-t">✓ semua lulus</span>',
    ),
    blokAngka(
      'Skenario',
      k.skenario ? `<span class="db-big">${k.skenario}</span>` : kosong,
      k.skenario
        ? '<span class="db-ket ok-t">✓ tertaut</span>'
        : '<span class="db-ket dim">opsional</span>',
    ),
  ].join('<span class="db-pisah" aria-hidden="true"></span>')
  const kiri = `<div class="db-aktif-kiri">
    <div class="db-tiket"><div class="db-tiket-meta"><a class="db-chip mono db-kunci" href="#/kerja/${esc(k.key)}">${esc(k.key)}</a><span class="dim">Plane: ${esc(k.statusPlane)} · diambil ${esc(tanggalJam(k.diambil_at))}</span></div><h3>${esc(k.judul)}</h3></div>
    ${penandaTahap(k.tahapNo)}
    <div class="db-angka">${angka}</div>
    <div class="db-berikut"><span class="db-berikut-ik">${ikon('panah')}</span><div class="db-berikut-tk"><span class="db-eyebrow">Langkah berikut</span><span>${teksBerikut(k)}</span></div><button type="button" class="btn db-pil primer" data-db-salin="/kerjakan ${esc(k.key)}">${ikon('salin', 14)}Salin perintah AI</button></div>
  </div>`
  const kanan = `<div class="db-aktif-kanan">${gauge(k.tahapNo, k.label)}<span class="db-tip-statis"><span class="info-t">${esc(k.label)}</span><span class="dim">· sejak ${esc(jam(k.sejak))}</span></span>${hasilKerja(k)}</div>`
  return `<section class="db-panel db-aktif" aria-labelledby="db-aktif-h">${kepalaKartu('db-aktif-h', ikon('putar'), 'Sedang dikerjakan', { label, aksi: chip(`#/kerja/${esc(k.key)}`, 'Buka kerja') })}<div class="db-aktif-isi">${kiri}${kanan}</div></section>`
}

// ——— 3.2 Lima kotak angka ———

const tag = (teks, nada) => `<span class="db-tag ${nada}">${esc(teks)}</span>`
const kotak = (ik, label, angka, visual, ket, status = '') =>
  `<div class="db-panel db-kotak"><div class="db-kotak-hd">${ikon(ik, 15)}<span class="db-eyebrow">${esc(label)}</span>${status}</div><span class="db-big db-xl">${angka}</span>${visual}<div class="db-kotak-ket">${ket}</div></div>`
/** Deret kotak mini (≤ 20) atau satu batang bertumpuk (> 20); kelas: lulus | gagal | lain | bug | catatan. */
export function deretMini(kelas, ariaLabel) {
  if (!kelas.length) return '<div class="db-mini kosong" aria-hidden="true"></div>'
  if (kelas.length > 20) {
    const urut = [...new Set(kelas)]
    return `<div class="db-mini tumpuk" role="img" aria-label="${esc(ariaLabel)}">${urut.map((k) => `<span class="${k}" style="flex:${kelas.filter((x) => x === k).length}"></span>`).join('')}</div>`
  }
  return `<div class="db-mini" style="grid-template-columns:repeat(${kelas.length},minmax(0,1fr))" role="img" aria-label="${esc(ariaLabel)}">${kelas.map((k) => `<span class="${k}"></span>`).join('')}</div>`
}

export function kotakAngka(d) {
  const t = d.tugas
  const plane = d.tugasGalat ?? 'Plane belum tersambung'
  const belumPlane = `<span title="${esc(plane)}">Isi <code>PLANE_API_KEY</code> di <code>.env</code></span>`
  let dominan = ''
  if (t?.perStatus.length) {
    const top = [...t.perStatus].sort((a, b) => b.n - a.n)[0]
    dominan =
      t.perStatus.length === 1 ? `Semua di ${top.status}` : `Terbanyak ${top.status} · ${top.n}`
  }
  const tugas = kotak(
    'orang',
    'Tugas terbuka',
    t ? t.terbuka : '–',
    t?.perStatus.length
      ? `<div class="db-mini tumpuk" role="img" aria-label="${esc(t.perStatus.map((s) => `${s.status} ${s.n}`).join(', '))}">${t.perStatus.map((s) => `<span class="${s.status === [...t.perStatus].sort((a, b) => b.n - a.n)[0].status ? 'utama' : ''}" style="flex:${s.n}" title="${esc(`${s.status}: ${s.n}`)}"></span>`).join('')}</div>`
      : '<div class="db-mini kosong" aria-hidden="true"></div>',
    t
      ? `<span class="db-elip">${esc(dominan || 'Tidak ada tugas terbuka')}</span><a class="db-chip kecil" href="#/tugas">Plane ›</a>`
      : belumPlane,
  )
  const belum = t ? t.terbuka - t.punyaSkenario : 0
  const persen = t?.terbuka ? Math.round((t.punyaSkenario / t.terbuka) * 100) : 0
  const skenario = kotak(
    'kisi',
    'Belum ada skenario',
    t ? belum : '–',
    `<div class="db-mini trek" role="img" aria-label="Cakupan ${persen}%"><span style="width:${persen}%"></span></div>`,
    t ? `${t.punyaSkenario} sudah punya · cakupan ${persen}%` : belumPlane,
    t && belum > 0 ? tag('! Perhatian', 'warn') : '',
  )
  const top = d.kerja.aktif[0]
  const kerja = kotak(
    'putar',
    'Kerja aktif',
    d.kerja.aktif.length,
    `<div class="db-mini" style="grid-template-columns:repeat(${TAHAP.length},minmax(0,1fr))" aria-hidden="true">${TAHAP.map(
      (_, i) => i + 1,
    )
      .map(
        (n) =>
          `<span class="${top ? (n < top.tahapNo ? 'lewat' : n === top.tahapNo ? 'kini' : '') : ''}"></span>`,
      )
      .join('')}</div>`,
    top
      ? `<span><span class="mono">${esc(top.key)}</span> · tahap ${top.tahapNo} dari ${TAHAP.length}</span>`
      : 'Tidak ada tiket aktif',
  )
  const j = d.jalan.tujuhHari
  const jalan = kotak(
    'centang',
    'Lulus · 7 hari',
    `${j.lulus}<span class="db-per">/${j.total}</span>`,
    deretMini(j.urut, `${j.lulus} lulus, ${j.gagal} gagal, ${j.lain} dihentikan`),
    j.total
      ? `<span><span class="ok-t">✓ ${j.lulus}</span> · <span class="${j.gagal ? 'bad-t' : ''}">× ${j.gagal}</span> · ■ ${j.lain} dihentikan</span>`
      : 'Belum ada jalan 7 hari ini',
    j.gagal ? tag(`× ${j.gagal} gagal`, 'bad') : '',
  )
  const tm = d.temuan
  const temuan = kotak(
    'kutu',
    'Temuan bug',
    tm.bug,
    deretMini(
      [...Array(tm.bug).fill('bug'), ...Array(tm.total - tm.bug).fill('catatan')],
      `${tm.bug} bug aplikasi dari ${tm.total} temuan`,
    ),
    `dari ${tm.total} temuan tercatat`,
    tm.bug ? tag('! Perhatian', 'warn') : '',
  )
  return `<section class="db-kotak-baris" aria-label="Ringkasan angka">${tugas}${skenario}${kerja}${jalan}${temuan}</section>`
}

// ——— 3.3 Heatmap ———

const tingkat = (n) => (n === 0 ? 0 : n <= 2 ? 1 : n <= 4 ? 2 : n <= 6 ? 3 : 4)
const labelHari = (h) => {
  const d = tgl(h.tanggal)
  return `${HARI[(d.getDay() + 6) % 7]}, ${d.getDate()} ${BULAN[d.getMonth()]}`
}

export function heatmap(harian, r) {
  const minggu = harian.length / 7
  const bulan = Array.from({ length: minggu }, (_, w) => {
    const m = tgl(harian[w * 7].tanggal).getMonth()
    const sebelum = w ? tgl(harian[(w - 1) * 7].tanggal).getMonth() : -1
    return `<span>${m !== sebelum ? BULAN[m] : ''}</span>`
  }).join('')
  const sel = harian
    .map((h) => {
      if (h.nanti) return '<span class="db-hm-sel nanti" aria-hidden="true"></span>'
      const tip = `${labelHari(h)} · ${h.n} jalan${h.gagal ? ` · ${h.gagal} gagal` : ''}`
      return `<span class="db-hm-sel t${tingkat(h.n)}${h.hariIni ? ' hari-ini' : ''}" title="${esc(tip)}">${h.gagal ? '<i class="db-hm-gagal"></i>' : ''}</span>`
    })
    .join('')
  const legenda = `<div class="db-hm-legenda"><span><i class="db-titik-gagal"></i>ada jalan gagal</span><span>Sedikit ${[0, 1, 2, 3, 4].map((t) => `<i class="db-hm-sel t${t}"></i>`).join('')} Banyak</span></div>`
  const angka = r.total
    ? `<div class="db-angka">${blokAngka(`Total jalan · ${minggu} minggu`, `<span class="db-big db-xl">${r.total}</span>`, `<span class="db-ket ok-t">✓ ${r.persenLulus}% lulus</span>`)}<span class="db-pisah" aria-hidden="true"></span>${blokAngka('Rentetan sekarang', `<span class="db-big db-md">${r.rentetan} hari</span>`, '', `Terpanjang ${r.terpanjang} hari`)}${r.tersibuk ? `<span class="db-pisah" aria-hidden="true"></span>${blokAngka('Hari tersibuk', `<span class="db-big db-md">${HARI_PANJANG[r.tersibuk.hari]}</span>`, '', `${r.tersibuk.n} jalan tercatat`)}` : ''}</div>`
    : '<div class="db-angka"><span class="dim">Belum ada jalan skenario dalam 24 minggu terakhir.</span></div>'
  return `<section class="db-panel db-hm" aria-labelledby="db-hm-h">${kepalaKartu('db-hm-h', ikonHeatmap, 'Aktivitas jalan skenario', { aksi: chip('#/riwayat', 'Lihat semua') })}
    <div class="db-hm-kisi"><span></span><div class="db-hm-bulan" style="grid-template-columns:repeat(${minggu},minmax(0,1fr))">${bulan}</div><div class="db-hm-hari"><span>Sen</span><span></span><span>Rab</span><span></span><span>Jum</span><span></span><span>Min</span></div><div class="db-hm-sels" style="grid-template-columns:repeat(${minggu},minmax(0,1fr))" role="img" aria-label="Heatmap jumlah jalan skenario per hari, ${minggu} minggu terakhir: ${r.total} jalan">${sel}</div></div>
    ${legenda}${angka}</section>`
}

// ——— 3.4 Produktivitas uji ———

/** Ringkasan satu minggu; `mundur` 0 = minggu berjalan, 1 = minggu lalu, dst. */
export function mingguProduktif(harian, mundur = 0) {
  const jml = harian.length / 7
  const w = Math.min(Math.max(jml - 1 - mundur, 0), jml - 1)
  const hari = harian.slice(w * 7, w * 7 + 7)
  const lalu = w > 0 ? harian.slice((w - 1) * 7, w * 7) : null
  const jumlah = (hs) => hs.reduce((a, h) => a + h.n, 0)
  const total = jumlah(hari)
  const lulus = hari.reduce((a, h) => a + h.lulus, 0)
  const lewat = hari.filter((h) => !h.nanti).length || 1
  const totalLalu = lalu ? jumlah(lalu) : null
  const maks = Math.max(0, ...hari.map((h) => h.n))
  const sumbu = Math.max(4, Math.ceil((maks * 1.5) / 4) * 4)
  const puncak = maks ? hari.findIndex((h) => h.n === maks) : -1
  return {
    mundur: jml - 1 - w,
    maksMundur: jml - 1,
    mulai: hari[0].tanggal,
    akhir: hari[6].tanggal,
    hari,
    total,
    lulus,
    persenLulus: total ? Math.round((lulus / total) * 100) : 0,
    rata: (total / lewat).toFixed(1).replace('.', ','),
    delta: totalLalu ? Math.round(((total - totalLalu) / totalLalu) * 100) : null,
    sumbu,
    puncak,
  }
}

export function produktivitas(harian, mundur = 0) {
  const m = mingguProduktif(harian, mundur)
  const tglPendek = (s) => `${tgl(s).getDate()} ${BULAN[tgl(s).getMonth()]}`
  const pemilih = `<span class="db-minggu"><button type="button" class="db-chip" data-db-minggu="${m.mundur + 1}" aria-label="Minggu sebelumnya"${m.mundur >= m.maksMundur ? ' disabled' : ''}>${ikon('kiri', 12)}</button><span class="db-chip statis">${tglPendek(m.mulai)} – ${tglPendek(m.akhir)}</span><button type="button" class="db-chip" data-db-minggu="${m.mundur - 1}" aria-label="Minggu berikutnya"${m.mundur <= 0 ? ' disabled' : ''}>${ikon('kanan', 12)}</button></span>`
  const delta =
    m.delta === null
      ? '<span class="db-ket dim">minggu lalu 0</span>'
      : `<span class="db-ket ${m.delta >= 0 ? 'ok-t' : 'bad-t'}">${m.delta >= 0 ? '+' : '−'}${Math.abs(m.delta)}%</span>`
  const TINGGI = 180
  const batang = m.hari
    .map((h, i) => {
      const d = tgl(h.tanggal)
      const tip = `${HARI_PANJANG[i]}, ${d.getDate()} ${BULAN[d.getMonth()]}`
      if (h.nanti)
        return `<div class="db-pb nanti"><div class="db-pb-isi"></div><span class="db-pb-hari">${HARI[i]}</span></div>`
      const tinggi = h.n ? Math.max(4, Math.round((h.n / m.sumbu) * TINGGI)) : 2
      return `<div class="db-pb${i === m.puncak ? ' puncak' : ''}" tabindex="0" aria-label="${esc(`${tip}: ${h.n} jalan, ${h.lulus} lulus, ${h.gagal} gagal`)}"><div class="db-pb-isi"><div class="db-tip" style="bottom:${tinggi + 10}px"><span class="dim">${esc(tip)}</span><br><b>${h.n}</b> jalan<br><span class="ok-t">✓ ${h.lulus}</span> · <span class="${h.gagal ? 'bad-t' : ''}">× ${h.gagal}</span></div><div class="db-pb-bar${h.n ? '' : ' nol'}" style="height:${tinggi}px"></div></div><span class="db-pb-hari">${HARI[i]}</span></div>`
    })
    .join('')
  return `<section class="db-panel db-prod" aria-labelledby="db-prod-h">${kepalaKartu('db-prod-h', ikon('batang'), 'Produktivitas uji', { aksi: pemilih })}
    <div class="db-prod-angka">${blokAngka('Jalan selesai', `<span class="db-big">${m.total}</span>`, delta)}${blokAngka('Lulus', `<span class="db-big">${m.lulus}</span>`, `<span class="db-ket ok-t">✓ ${m.persenLulus}%</span>`)}${blokAngka('Rata-rata harian', `<span class="db-big">${m.rata}</span>`, '<span class="db-ket dim">jalan</span>')}</div>
    <div class="db-pg"><div class="db-pg-sumbu"><span style="top:-7px">${m.sumbu}</span><span style="top:${TINGGI / 2 - 7}px">${m.sumbu / 2}</span><span style="bottom:-7px">0</span></div><div class="db-pg-area"><span class="db-pg-garis atas"></span><span class="db-pg-garis tengah"></span><span class="db-pg-garis dasar"></span><div class="db-pg-batang">${batang}</div></div></div></section>`
}

// ——— 3.5 Radar skenario per grup ———

export function radar(perGrup, total) {
  const judul = `Skenario per grup · ${total}`
  const kepala = kepalaKartu('db-grup-h', ikon('radar'), judul)
  if (perGrup.length < 3) {
    const maks = Math.max(1, ...perGrup.map((g) => g.total))
    return `<section class="db-panel db-bawah" aria-labelledby="db-grup-h">${kepala}<ul class="db-bar">${perGrup.map((g) => `<li><a href="#/modul/${esc(g.id)}">${esc(g.nama)}</a><span class="db-bar-trek"><span class="db-bar-isi" style="width:${Math.round((g.total / maks) * 100)}%"></span></span><span class="db-num">${g.total}${g.gagal ? ` <span class="bad-t">× ${g.gagal}</span>` : ''}</span></li>`).join('') || '<li class="dim">Belum ada skenario.</li>'}</ul></section>`
  }
  const cx = 190
  const cy = 122
  const R = 66
  const maks = Math.max(...perGrup.map((g) => g.total))
  const sudut = perGrup.map((_, i) => ((-90 + (360 * i) / perGrup.length) * Math.PI) / 180)
  const titik = (r, a) =>
    `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`
  const cincin = [1, 2, 3, 4]
    .map((k) => `<polygon points="${sudut.map((a) => titik((R * k) / 4, a)).join(' ')}"/>`)
    .join('')
  const jari = sudut
    .map(
      (a) =>
        `<line x1="${cx}" y1="${cy}" x2="${titik(R, a).split(',')[0]}" y2="${titik(R, a).split(',')[1]}"/>`,
    )
    .join('')
  const area = perGrup.map((g, i) => titik((R * g.total) / maks, sudut[i])).join(' ')
  const label = perGrup
    .map((g, i) => {
      const a = sudut[i]
      const [x, y] = titik(R + 12, a)
        .split(',')
        .map(Number)
      const c = Math.cos(a)
      const sn = Math.sin(a)
      const anchor = c > 0.3 ? 'start' : c < -0.3 ? 'end' : 'middle'
      // Dua baris: nama grup, lalu jumlah. Di atas naik, di bawah turun, di samping di tengah.
      const y1 = sn < -0.5 ? y - 20 : sn > 0.5 ? y + 14 : y - 4
      return `<text x="${x}" y="${y1}" text-anchor="${anchor}">${esc(g.nama)}<tspan class="n" x="${x}" dy="16">${g.total} skenario${g.gagal ? ` · × ${g.gagal} gagal` : ''}</tspan></text>`
    })
    .join('')
  const aria = perGrup
    .map((g) => `${g.nama} ${g.total}${g.gagal ? `, ${g.gagal} gagal` : ''}`)
    .join('; ')
  return `<section class="db-panel db-bawah" aria-labelledby="db-grup-h">${kepala}<svg class="db-radar" viewBox="0 0 380 250" role="img" aria-label="${esc(`Skenario per grup: ${aria}`)}"><g class="kisi">${cincin}${jari}</g><polygon class="area" points="${area}"/><g class="titik">${perGrup.map((g, i) => `<circle cx="${titik((R * g.total) / maks, sudut[i]).split(',')[0]}" cy="${titik((R * g.total) / maks, sudut[i]).split(',')[1]}" r="3.5"/>`).join('')}</g><g class="label">${label}</g></svg></section>`
}

// ——— 3.6 Temuan dan Aktivitas ———

export function daftarTemuan(terbaru) {
  const isi = terbaru
    .slice(0, 4)
    .map(
      (x) =>
        `<li><span class="${x.jenis === 'Bug aplikasi' ? 'bad-t' : 'dim'}">${x.jenis === 'Bug aplikasi' ? '× ' : ''}${esc(x.jenis)}</span><span class="db-elip" title="${esc(x.judul)}">${esc(x.judul)}</span><span class="dim">${esc(waktuRingkas(x.at))}</span></li>`,
    )
    .join('')
  return `<section class="db-panel db-bawah" aria-labelledby="db-temuan-h">${kepalaKartu('db-temuan-h', ikon('bendera'), 'Temuan terbaru')}${isi ? `<ul class="db-baris temuan">${isi}</ul>` : '<p class="dim">Belum ada temuan.</p>'}</section>`
}

export function daftarAktivitas(aktivitas) {
  const isi = aktivitas
    .slice(0, 4)
    .map((a) => {
      const teks =
        a.jenis === 'kerja'
          ? `<a class="mono" href="#/kerja/${esc(a.key)}">${esc(a.key)}</a> ${esc(a.teks)}`
          : `<a href="#/laporan/${esc(a.key)}">${esc(a.teks)}</a>`
      return `<li><span class="db-tag ${a.jenis === 'kerja' ? 'info' : 'netral'}">${a.jenis === 'kerja' ? 'Kerja' : 'Jalan'}</span><span class="db-elip" title="${esc(a.teks)}">${teks}</span><span class="dim">${esc(waktuRingkas(a.at))}</span></li>`
    })
    .join('')
  return `<section class="db-panel db-bawah" aria-labelledby="db-akt-h">${kepalaKartu('db-akt-h', ikon('jam'), 'Aktivitas terbaru')}${isi ? `<ul class="db-baris aktivitas">${isi}</ul>` : '<p class="dim">Belum ada aktivitas.</p>'}</section>`
}

/** Satu tombol aksi utama untuk butir Butuh kamu (R-5.2). */
function tombolButuh(b) {
  return b.aksi.jenis === 'fase'
    ? `<button type="button" class="btn db-pil" data-db-fase="${esc(b.aksi.fase)}" data-key="${esc(b.key)}">${esc(b.aksi.label)}</button>`
    : b.aksi.jenis === 'terminal'
      ? `<button type="button" class="btn db-pil" data-db-terminal="${esc(b.key)}">${esc(b.aksi.label)}</button>`
      : b.aksi.jenis === 'tahap'
        ? `<button type="button" class="btn db-pil" data-db-tahap="${esc(b.aksi.tahap)}" data-key="${esc(b.key)}">${esc(b.aksi.label)}</button>`
        : `<a class="btn db-pil" href="#/kerja/${esc(b.key)}">${esc(b.aksi.label)}</a>`
}

const butir = (key, teks, judul, tombol = '') =>
  `<li><a class="mono" href="#/kerja/${esc(key)}">${esc(key)}</a><span class="db-butuh-teks">${teks}<span class="dim"> · ${esc(judul)}</span></span>${tombol}</li>`

/**
 * Tiga lajur tindakan (R-9.1): Butuh kamu (aksi utama per butir), AI sedang jalan, Menunggu pihak
 * lain; di bawahnya Antre dan Ditunda. Lajur kiri satu-satunya yang wajib dilihat tiap hari.
 */
/** Antrean slot tertahan: butir Butuh kamu dengan aksi memindahkan sisa antrean ke slot lain. */
export function butirTertahan(t) {
  const tujuan = [1, 2, 3]
    .filter((n) => n !== t.slot)
    .map((n) => `<option value="${n}">Slot ${n}</option>`)
    .join('')
  const antre = t.antrean.map((x) => esc(x.key)).join(', ')
  return `<li class="db-tertahan"><a class="mono" href="#/kerja/${esc(t.oleh)}">${esc(t.oleh)}</a><span class="db-butuh-teks">Antrean slot ${t.slot} tertahan oleh ${esc(t.oleh)} (${esc(t.alasan)})<span class="dim"> · menunggu: ${antre}</span></span><span class="db-tertahan-aksi"><select class="in" data-db-sisa-ke="${t.slot}" aria-label="Slot tujuan sisa antrean slot ${t.slot}">${tujuan}<option value="global">Antre global</option></select><button type="button" class="btn db-pil" data-db-sisa="${t.slot}">Pindahkan sisa antrean ke slot lain</button></span></li>`
}

export function lajurTindakan(d) {
  const butuh = d.butuhKamu ?? []
  const tertahan = d.antreanTertahan ?? []
  const ai = d.aiBekerja ?? []
  const lain = d.pihakLain ?? []
  const kolom = (id, judul, n, isi, kosong) =>
    `<section class="db-panel db-lajur-kolom" aria-labelledby="${id}"><h2 id="${id}" class="db-lajur-h">${judul} <span class="dim">${n}</span></h2>${n ? `<ul class="db-butuh">${isi}</ul>` : `<p class="dim">${kosong}</p>`}</section>`
  const kiri = butuh
    .map((b) =>
      butir(
        b.key,
        `${b.titik ? `<b>◆${esc(b.titik)}</b> ` : ''}${esc(b.alasan)}`,
        b.judul,
        tombolButuh(b),
      ),
    )
    .join('')
  const gb = d.butuhGabungan
    ? `<li><span class="chip info" aria-hidden="true">Gabung</span><span class="db-butuh-teks">${esc(d.butuhGabungan.alasan)}<span class="dim"> · ${esc(d.butuhGabungan.judul)}</span></span><a class="btn db-pil" href="#/workspace">Buka Workspace</a></li>`
    : ''
  const kiriSemua = gb + kiri + tertahan.map(butirTertahan).join('')
  const tengah = ai
    .map((x) =>
      butir(
        x.key,
        `● ${esc(x.fase ?? '')} · ${esc(x.mode ?? '')}${x.slot ? ` · slot ${x.slot}` : ''}`,
        x.judul,
      ),
    )
    .join('')
  const kanan = lain.map((x) => butir(x.key, esc(x.alasan), x.judul)).join('')
  const antre = d.antre?.length
    ? `<span>⏸ Antre ${d.antre.length}: ${d.antre.map((x) => `<a class="mono" href="#/kerja/${esc(x.key)}">${esc(x.key)}</a>`).join(', ')} <a href="#/workspace">Tempatkan di Workspace ›</a></span>`
    : ''
  const tunda = d.ditunda?.length
    ? `<span>Ditunda ${d.ditunda.length}: ${d.ditunda.map((x) => `<a class="mono" href="#/kerja/${esc(x.key)}">${esc(x.key)}</a>`).join(', ')}</span>`
    : ''
  return `<div class="db-lajur3">${kolom('db-butuh-h', 'Butuh kamu', butuh.length + tertahan.length + (gb ? 1 : 0), kiriSemua, 'Tidak ada yang menunggumu.')}${kolom('db-ai-h', 'AI sedang jalan', ai.length, tengah, 'Tidak ada sesi Claude yang bekerja.')}${kolom('db-lain-h', 'Menunggu pihak lain', lain.length, kanan, 'Tidak ada yang menunggu pihak lain.')}</div>${antre || tunda ? `<p class="dim db-tunda">${[antre, tunda].filter(Boolean).join(' · ')}</p>` : ''}`
}

/** Strip mini: 3 slot (● bekerja · ◆ menunggu · ○ kosong) + kesehatan komputer; ke Workspace. */
export function stripMini(m) {
  if (!m) return ''
  const tanda = (s) =>
    !s.pemakai.length
      ? ['○', 'kosong']
      : s.sesi === 'bekerja'
        ? ['●', 'AI bekerja']
        : s.sesi === 'menunggu'
          ? ['◆', 'menunggu kamu']
          : ['◐', 'terpakai']
  const slot = m.slot
    .map((s) => {
      const [t, arti] = tanda(s)
      return `<span class="db-mini-slot" title="Slot ${s.n}${s.chat ? ' (chat)' : ''}: ${esc(arti)}"><b>${t}</b> Slot ${s.n} <span class="dim">${s.chat ? 'chat · ' : ''}${s.pemakai.length ? esc(s.pemakai.join(', ')) : 'kosong'}${s.antre ? ` · antre ${s.antre}` : ''}${s.api || s.web ? ' · server hidup' : ''}</span></span>`
    })
    .join('')
  const k = m.komputer
  const kom = `<span class="db-mini-kom">${k.peringatan ? `<span class="warn-t">! ${k.peringatan} peringatan</span>` : '<span class="ok-t">✓ komputer</span>'} <span class="dim">beban ${Number(k.beban).toFixed(1)}/${k.core} · memori bebas ${k.memoriBebas ?? '?'}% · disk ${Math.round(k.diskSisa)} GiB</span></span>`
  return `<a class="db-panel db-strip" href="#/workspace" aria-label="Workspace: slot dan komputer">${slot}${kom}</a>`
}

/** Angka yang memicu tindakan saja (R-9.1). */
export function angkaTindakan(d) {
  const a = d.angka ?? {}
  const t = d.tugas
  const tile = (label, nilai, ket, nada = '', href = null) => {
    const isi = `<span class="db-angka-k">${esc(label)}</span><span class="db-angka-v ${nada}">${nilai}</span><span class="dim db-angka-ket">${ket}</span>`
    return href
      ? `<a class="db-panel db-angka" href="${href}">${isi}</a>`
      : `<div class="db-panel db-angka">${isi}</div>`
  }
  const belumAmbil = t ? Math.max(0, t.terbuka - (d.kerja?.aktif?.length ?? 0)) : null
  return `<div class="db-angka-baris">
    ${tile('Butuh kamu', a.butuh ?? 0, 'tiket menunggu keputusanmu', a.butuh ? 'warn-t' : '')}
    ${tile('Slot terpakai', `${a.slotTerpakai ?? 0}/3`, 'maks. 3 tiket aktif', '', '#/workspace')}
    ${tile('CI merah', a.ciMerah ?? 0, 'gerbang CI gagal', a.ciMerah ? 'bad-t' : '')}
    ${tile('MR menunggu merge', a.menungguMerge ?? 0, 'review/merge ke development oleh tim')}
    ${tile('Tugas Plane', t ? belumAmbil : '–', t ? `${t.terbuka} terbuka · belum diambil` : `Isi <code>PLANE_API_KEY</code> di <code>.env</code>`, '', '#/tugas')}
  </div>`
}

/**
 * Kerangka (skeleton) selama /api/dasbor dimuat: bentuknya mengikuti tata letak akhir (strip slot,
 * tiga lajur, lima kotak angka, daftar temuan) supaya halaman tidak melompat saat data datang.
 */
export function kerangkaDasbor() {
  const s = (w, h, r = 6) =>
    `<span class="skel" style="width:${w};height:${h}px;border-radius:${r}px"></span>`
  const butir = (n) =>
    Array.from(
      { length: n },
      (_, i) =>
        `<li class="db-skel-butir">${s('56px', 12)}${s(`${58 + ((i * 11) % 28)}%`, 12)}${s('64px', 26, 999)}</li>`,
    ).join('')
  const lajur = (lebar) =>
    `<section class="db-panel db-lajur-kolom">${s(`${lebar}px`, 16)}<ul class="db-butuh">${butir(3)}</ul></section>`
  const angka = Array.from(
    { length: 5 },
    () => `<div class="db-panel db-angka">${s('90px', 11)}${s('44px', 28)}${s('140px', 11)}</div>`,
  ).join('')
  return `<div class="db db-memuat" role="status" aria-busy="true" aria-label="Memuat dashboard">
    <div class="db-panel db-strip">${[0, 1, 2].map(() => s('150px', 14)).join('')}${s('230px', 14)}</div>
    <div class="db-lajur3">${lajur(110)}${lajur(130)}${lajur(150)}</div>
    <div class="db-angka-baris">${angka}</div>
    <section class="db-panel">${s('120px', 16)}${[0, 1, 2].map(() => `<div class="db-skel-butir">${s('48px', 12)}${s('70%', 12)}</div>`).join('')}</section>
  </div>`
}

/**
 * Isi halaman Dasbor: tindakan saja (R-9.1); tren ada di halamanStatistik.
 * @param {any} d hasil /api/dasbor
 * @param {{ galat?: string | null }} [o]
 */
export function halamanDasbor(d, { galat = null } = {}) {
  const kepala = `<div class="titlerow db-kepala"><div class="titlebox"><div class="ctx">Scenario Runner · apa yang harus aku lakukan</div><h1>Dashboard</h1></div><a class="btn db-pil" href="#/statistik">Statistik ›</a><button type="button" class="btn db-pil" id="db-segarkan">Segarkan</button></div>`
  if (galat)
    return `${kepala}<div class="errbox" role="alert"><b>Dashboard gagal dimuat</b><div class="mono">${esc(galat)}</div></div>`
  if (!d) return `<div class="db">${kepala}${kerangkaDasbor()}</div>`
  return `<div class="db">${kepala}${stripMini(d.mini)}${lajurTindakan(d)}${angkaTindakan(d)}${daftarTemuan(d.temuan.terbaru)}</div>`
}

const LABEL_TAHAP_M = {
  diambil: 'Diambil',
  dipelajari: 'Dipelajari',
  dikerjakan: 'Dikerjakan',
  diverifikasi: 'Diverifikasi',
  didokumentasikan: 'Didokumentasikan',
  selesai: 'Selesai',
}
const lama = (ms) =>
  !ms
    ? '–'
    : ms >= 86_400_000
      ? `${(ms / 86_400_000).toFixed(1)} h`
      : ms >= 3_600_000
        ? `${(ms / 3_600_000).toFixed(1)} j`
        : `${Math.max(1, Math.round(ms / 60_000))} m`
const ribuan = (n) =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)} jt` : `${Math.round(n / 1000)} rb`

/**
 * Metrik per tiket (R-9.3): lama per tahap (waktu kalender), kerja ulang, token sesi Claude yang
 * dijalankan dari panel. Sesi chat VS Code tidak terhubung ke tiket, jadi tidak terhitung.
 */
export function tabelMetrik(metrik) {
  const kolom = ['dipelajari', 'dikerjakan', 'diverifikasi', 'didokumentasikan']
  const baris = metrik
    .map((m) => {
      const t = m.token
      const ulang = [
        m.kerjaUlang.tahapMundur ? `mundur ${m.kerjaUlang.tahapMundur}` : '',
        m.kerjaUlang.mintaUbah ? `minta ubah ${m.kerjaUlang.mintaUbah}` : '',
        m.kerjaUlang.gerbangCiGagal ? 'CI gagal' : '',
      ]
        .filter(Boolean)
        .join(' · ')
      return `<tr><td><a class="mono" href="#/kerja/${esc(m.key)}">${esc(m.key)}</a></td><td>${esc(LABEL_TAHAP_M[m.tahap] ?? m.tahap)}</td>${kolom.map((k) => `<td class="kanan">${lama(m.durasi[k])}</td>`).join('')}<td class="kanan"><b>${lama(m.totalMs)}</b></td><td>${ulang ? `<span class="warn-t">!</span> ${esc(ulang)}` : '<span class="dim">–</span>'}</td><td class="kanan">${t ? `${ribuan(t.input + t.cacheBaca + t.cacheTulis)} masuk · ${ribuan(t.output)} keluar` : '<span class="dim">–</span>'}</td></tr>`
    })
    .join('')
  return `<section class="db-panel" aria-labelledby="db-metrik-h"><h2 id="db-metrik-h" class="db-lajur-h">Metrik per tiket</h2>
    ${metrik.length ? `<div class="db-metrik-gulir"><table class="db-metrik"><thead><tr><th>Tiket</th><th>Tahap</th>${kolom.map((k) => `<th class="kanan">${LABEL_TAHAP_M[k]}</th>`).join('')}<th class="kanan">Total</th><th>Kerja ulang</th><th class="kanan">Token</th></tr></thead><tbody>${baris}</tbody></table></div>` : '<p class="dim">Belum ada kerja.</p>'}
    <p class="dim db-angka-ket">Waktu kalender per tahap (termasuk menunggu). Token hanya dari sesi Claude yang dijalankan dari panel; kerja di chat VS Code tidak terhubung ke tiket.</p></section>`
}

/**
 * Halaman Statistik (R-9.4): tren dan detail yang dipindah dari Dashboard.
 * @param {any} d hasil /api/dasbor
 * @param {{ galat?: string | null, minggu?: number }} [o]
 */
export function halamanStatistik(d, { galat = null, minggu = 0 } = {}) {
  const kepala = `<div class="titlerow db-kepala"><div class="titlebox"><div class="ctx">Scenario Runner · tren</div><h1>Statistik</h1></div><a class="btn db-pil" href="#/dasbor">‹ Dashboard</a><button type="button" class="btn db-pil" id="db-segarkan">Segarkan</button></div>`
  if (galat)
    return `${kepala}<div class="errbox" role="alert"><b>Statistik gagal dimuat</b><div class="mono">${esc(galat)}</div></div>`
  if (!d) return `${kepala}<div class="empty">Memuat statistik…</div>`
  return `<div class="db">${kepala}${kotakAngka(d)}${panelAktif(d.kerja.aktif)}<div class="db-baris-grafik">${heatmap(d.jalan.harian, d.jalan.ringkas)}${produktivitas(d.jalan.harian, minggu)}</div><div class="db-baris-bawah">${radar(d.skenario.perGrup, d.skenario.total)}${daftarAktivitas(d.aktivitas)}</div>
    ${tabelMetrik(d.metrik ?? [])}</div>`
}

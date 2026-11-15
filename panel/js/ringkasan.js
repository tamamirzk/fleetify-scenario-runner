// Halaman Ringkasan sebelum putar: kolom UTAMA untuk membaca (kepala, Tujuan,
// Alur langkah, Persona, bagian lipat) dan kolom KANAN sempit untuk bertindak (kartu Putar menempel). Murni:
// semua data lewat parameter, diuji Vitest. Teks pengguna tanpa istilah internal (capai, siapkan, POST, slug).
import { esc } from './komponen.js'
import {
  KECEPATAN,
  KET_TAMPILAN,
  LABEL_MUTU,
  MUTU,
  PERINGATAN_TAMPILAN,
  SKALA,
  tampilanBawaan,
  teksKecepatan,
  teksSkala,
  teksUkuran,
  UKURAN,
} from './pilihan.js'

const IKON = {
  laptop:
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H4zM2 19h20"/></svg>',
  api: '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 9l-4 3 4 3M16 9l4 3-4 3"/></svg>',
}

/**
 * Kepala: judul besar, chip, angka ringkas sebaris kecil, jalur berkas sebagai rincian teknis kecil.
 * @param {any} f @param {any} d @param {{ namaModul?: string | null, chipTiket?: string }} [o]
 */
export function kepalaRingkasan(f, d, { namaModul = null, chipTiket = '' } = {}) {
  const chip = [
    `<span class="chip acc">${esc(namaModul ?? d.modul)}</span>`,
    d.setelan?.length
      ? `<span class="chip warn" title="Skenario ini mengubah setelan tenant; lihat bagian Setelan yang diubah">mengubah ${d.setelan.length} setelan</span>`
      : '',
    chipTiket,
  ].join('')
  return `<header class="rk-kepala">
    <h1>${esc(d.judul)}</h1>
    <div class="rk-angka">${d.steps.length} langkah · ${d.persona.length} persona · ±${esc(d.estimasi)}</div>
    <div class="rk-chip">${chip}</div>
    <div class="rk-berkas" title="Berkas skenario">scenarios/${esc(f.task)}/${esc(f.slug)}.json</div>
  </header>`
}

/** Persona satu langkah: chip nama·peran + penanda di layar / di belakang layar. */
function chipPersona(s, peranDari) {
  // Nama persona dari server sudah memuat perannya, mis. "Made (Mekanik)"; peran berkas hanya
  // ditambahkan bila nama tidak memuatnya.
  const nama = s.who_name ?? 'Tanpa akun'
  const peran = s.who && !nama.includes('(') ? peranDari(s.who) : null
  const alat = s.belakang
    ? `<span class="rk-alat" title="Lewat API, tanpa layar">${IKON.api}di belakang layar</span>`
    : `<span class="rk-alat" title="Di jendela browser">${IKON.laptop}di layar</span>`
  return `<span class="rk-persona"><b>${esc(nama)}</b>${peran ? ` · ${esc(peran)}` : ''}</span>${alat}`
}

/**
 * Bisa dimulai dari langkah ini? Langkah 1 atau yang punya jalan pintas selalu bisa; lainnya butuh data
 * dari jalan yang berhenti tepat sebelum langkah itu.
 */
export const bisaMulai = (s) => s.n === 1 || !!s.reach || (s.jump_runs?.length ?? 0) > 0

/** Keterangan langkah yang belum bisa jadi titik mulai, dalam kalimat pengguna. */
export const ketTidakBisa = (s) =>
  `Hanya bisa dimulai sesudah langkah ${s.n - 1} dijalankan (putar dari awal dulu).`

/**
 * Alur langkah: nomor, judul, persona, "Harus terlihat" utuh, jumlah aksi, pilih "Mulai di sini".
 * @param {any[]} steps @param {{ startStep?: number, persona?: any[] }} [o]
 */
export function alurLangkah(steps, { startStep = 1, persona = [] } = {}) {
  const peranDari = (siapa) => persona.find((p) => p.siapa === siapa)?.peran ?? null
  return `<ol class="rk-alur">${steps
    .map((s) => {
      const bisa = bisaMulai(s)
      const pilih = startStep === s.n
      const pakaiData = bisa && s.n > 1 && !s.reach
      return `<li class="rk-langkah${pilih ? ' cur' : ''}">
      <span class="rk-no" aria-hidden="true">${s.n}</span>
      <div class="rk-isi">
        <div class="rk-judul">${esc(s.title)}</div>
        <div class="rk-meta">${chipPersona(s, peranDari)}<span class="dim">${s.aksi} aksi</span></div>
        ${s.deskripsi ? `<p class="rk-desk">${esc(s.deskripsi)}</p>` : ''}
        <div class="rk-harus"><span class="rk-harus-l">Harus terlihat</span>${esc(s.expect)}</div>
        ${bisa ? (pakaiData ? '<div class="rk-ket dim">Mulai di sini memakai data dari jalan sebelumnya yang berhenti tepat sebelum langkah ini.</div>' : '') : `<div class="rk-ket dim">${ketTidakBisa(s)}</div>`}
      </div>
      <label class="rk-mulai${bisa ? '' : ' mati'}">${bisa ? `<input type="radio" name="start" value="${s.n}" ${pilih ? 'checked' : ''} aria-label="Mulai dari langkah ${s.n}">Mulai di sini` : '<span class="dim">—</span>'}</label>
    </li>`
    })
    .join('')}</ol>`
}

/** Persona: nama · peran · apa yang dilakukannya (langkah yang dikerjakannya). */
export function daftarPersona(persona, steps) {
  return `<ul class="rk-persona-daftar">${persona
    .map((p) => {
      const ls = steps.filter((s) => s.who === p.siapa)
      const layar = ls.filter((s) => !s.belakang)
      const kerja = !ls.length
        ? 'Hanya untuk menyiapkan data, tanpa layar.'
        : `${layar.length ? `Langkah ${layar.map((s) => s.n).join(', ')}` : 'Di belakang layar'}${layar[0] ? `: ${esc(layar[0].title)}` : ''}${layar.length > 1 ? ' …' : ''}`
      return `<li><b>${esc(p.nama)}</b> · <span>${esc(p.peran)}</span><div class="dim">${kerja}</div></li>`
    })
    .join('')}</ul>`
}

/** Bagian berjudul yang bisa dibuka-tutup; kosong = tidak dirender. */
export function bagianLipat(judul, butir, { buka = false } = {}) {
  if (!butir?.length) return ''
  return `<details class="rk-lipat"${buka ? ' open' : ''}><summary><span class="sb-panah" aria-hidden="true">⌄</span>${esc(judul)} <span class="dim">${butir.length}</span></summary><ul class="plain">${butir.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></details>`
}

/** Tampilan aplikasi + Mutu gambar, ringkas untuk kartu sempit (id sama dengan kotak lama). */
export function setelanTampilan(ukuran, skala, mutu) {
  return `<div class="rk-setel">
    <label>Layar aplikasi<select id="tampilan-ukuran" class="in" aria-label="Ukuran layar aplikasi">${UKURAN.map((u) => `<option value="${u}" ${u === ukuran ? 'selected' : ''}>${teksUkuran(u)}</option>`).join('')}</select></label>
    <label>Skala<select id="tampilan-skala" class="in" aria-label="Skala halaman aplikasi">${SKALA.map((s) => `<option value="${s}" ${s === Number(skala) ? 'selected' : ''}>${teksSkala(s)}</option>`).join('')}</select></label>
    <label>Mutu gambar<select id="tampilan-mutu" class="in" aria-label="Mutu tampilan langsung" title="Hanya tampilan langsung di runner; screenshot langkah dan laporan tidak berubah">${MUTU.map((m) => `<option value="${m}" ${m === mutu ? 'selected' : ''}>${LABEL_MUTU[m]}</option>`).join('')}</select></label>
  </div>
  <div class="rk-kecil ${tampilanBawaan(ukuran, skala) ? 'dim' : 'warn-t'}">${tampilanBawaan(ukuran, skala) ? KET_TAMPILAN : PERINGATAN_TAMPILAN}</div>`
}

/**
 * Kartu "Putar" (kolom kanan): sasaran, tempo, tampilan, tombol utama
 * selebar kartu, keterangan apa yang akan dilakukan, langkah awal terpilih.
 */
export function kartuPutar(o) {
  const {
    sasaran,
    run = null,
    startStep = 1,
    butuhData = false,
    dataRun = '',
    jumpRuns = [],
    aktifLain = false,
    headed = false,
    kecepatan = 1,
    jeda = false,
    tampilan = { ukuran: '1400x900', skala: 1, mutu: 'tajam' },
    siapkan = 0,
    logTerakhir = '',
    docs = '',
  } = o
  const ket = `${siapkan ? `${siapkan} aksi penyiapan data` : 'tanpa data tambahan'}${startStep > 1 ? ` · mulai di langkah ${startStep}` : ' · mulai di langkah 1'}`
  let aksi
  if (run?.status === 'menyiapkan')
    aksi = `<button class="btn primary lg rk-utama" type="button" disabled>Menyiapkan data…</button><div class="rk-kecil dim">${esc(logTerakhir)}</div>`
  else if (run?.status === 'siap')
    aksi = `<button class="btn primary lg rk-utama" type="button" id="btn-play">Putar dari langkah ${startStep}</button><button class="btn rk-batal" type="button" id="btn-cancel">Batal</button><div class="rk-kecil dim">Data siap. ${headed ? 'Jendela browser dibuka saat Putar.' : 'Tampilan langsung muncul di layar Runner.'}</div>`
  else
    aksi = `<button class="btn primary lg rk-utama" type="button" id="btn-prep" ${aktifLain || (butuhData && !dataRun) ? 'disabled' : ''}>Siapkan data</button><div class="rk-kecil ${aktifLain || (butuhData && !dataRun) ? 'warn-t' : 'dim'}">${aktifLain ? 'Masih ada jalan aktif. Hentikan dulu dari layar Sedang berjalan.' : butuhData && !dataRun ? 'Pilih data jalan untuk langkah awal ini.' : esc(ket)}</div>`
  const dataJalan = butuhData
    ? `<label class="rk-datarun">Data jalan untuk langkah ${startStep}<select class="in" id="datarun"><option value="">Pilih jalan…</option>${jumpRuns.map((r) => `<option ${dataRun === r ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></label>`
    : ''
  return `<section class="rk-kartu glass" aria-labelledby="rk-h-putar">
    <div class="rk-kartu-hd"><h2 id="rk-h-putar">Putar</h2><span class="dim">${run?.status === 'siap' ? 'data siap' : esc(sasaran)}</span></div>
    ${run?.status === 'gagal' ? `<div class="errbox" role="alert"><b>Siapkan data gagal</b><div class="mono">${esc(run.error ?? '')}</div></div>` : ''}
    ${docs ? `<div class="docs">${docs}</div>` : ''}
    <div class="rk-tempo"><label>Kecepatan<select id="tempo-kec" class="in" aria-label="Kecepatan jalan">${KECEPATAN.map((v) => `<option value="${v}" ${v === kecepatan ? 'selected' : ''}>${teksKecepatan(v)}${v < 1 ? ' lambat' : ''}</option>`).join('')}</select></label>
      <label class="chk"><input type="checkbox" id="tempo-jeda" ${jeda ? 'checked' : ''}>Jeda tiap langkah</label></div>
    <label class="chk rk-jendela" title="Mati: skenario diputar tanpa jendela Chromium; tonton lewat tampilan langsung di Runner. Berlaku untuk jalan berikutnya."><input type="checkbox" id="tampil-jendela" ${headed ? 'checked' : ''} ${run && run.status !== 'gagal' ? 'disabled' : ''}>Tampilkan jendela browser</label>
    ${setelanTampilan(tampilan.ukuran, tampilan.skala, tampilan.mutu)}
    ${dataJalan}
    <div class="rk-aksi">${aksi}</div>
  </section>`
}

/** Di bawah kartu (kecil): hasil jalan terakhir + tautan laporan, tombol Sunting skenario. */
export function kartuTerakhir(f, metaHtml) {
  return `<section class="rk-terakhir">
    <div class="rk-kecil"><b>Jalan terakhir</b> · ${f.last ? metaHtml : 'belum pernah dijalankan'}</div>
    <button type="button" class="btn tb" data-sunting="${esc(f.slug)}">Sunting skenario</button>
  </section>`
}

/** Bilah tindakan menempel di bawah (< 1100 px): tombol utama selalu terlihat. */
export function bilahPutar(o) {
  const { run = null, startStep = 1, nonaktif = false, ket = '' } = o
  const tombol =
    run?.status === 'menyiapkan'
      ? '<button class="btn primary lg" type="button" disabled>Menyiapkan data…</button>'
      : run?.status === 'siap'
        ? `<button class="btn primary lg" type="button" data-aksi-putar="play">Putar dari langkah ${startStep}</button>`
        : `<button class="btn primary lg" type="button" data-aksi-putar="prep" ${nonaktif ? 'disabled' : ''}>Siapkan data</button>`
  return `<div class="rk-bilah glass" role="region" aria-label="Tindakan">${tombol}<span class="rk-kecil dim">${esc(ket)}</span></div>`
}

/** Seluruh halaman: kolom utama (membaca) + kolom kanan (bertindak) + bilah bawah untuk layar sempit. */
export function halamanRingkasan({ kepala, tujuan, alur, persona, lipat, kartu, terakhir, bilah }) {
  return `<div class="rk">
    <div class="rk-utama-kol">
      ${kepala}
      <section class="rk-bag" aria-labelledby="rk-h-tujuan"><h2 id="rk-h-tujuan">Tujuan</h2><p class="rk-tujuan">${esc(tujuan)}</p></section>
      <section class="rk-bag" aria-labelledby="rk-h-alur"><h2 id="rk-h-alur">Alur langkah</h2>${alur}</section>
      <section class="rk-bag" aria-labelledby="rk-h-persona"><h2 id="rk-h-persona">Persona</h2>${persona}</section>
      ${lipat ? `<section class="rk-bag rk-lipatan">${lipat}</section>` : ''}
    </div>
    <aside class="rk-kanan" aria-label="Putar">${kartu}${terakhir}</aside>
    ${bilah}
  </div>`
}

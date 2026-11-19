// Halaman Workspace (docs/RANCANGAN-KERJA-V2.md R-7.6, R-7.9): strip komputer, kartu per slot,
// layanan bersama, dan Antre. Fungsi murni penghasil HTML; data dari GET /api/workspace.
import { esc } from './komponen.js'

const JAM = (iso) =>
  iso ? new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : ''

/** Batang persen dengan teks (status tidak hanya warna). */
function batang(label, persen, teks, nada) {
  const p = Math.max(0, Math.min(100, Math.round(persen)))
  return `<div class="ws-meter"><span class="ws-meter-k">${esc(label)}</span><span class="ws-batang ${nada}" role="img" aria-label="${esc(`${label} ${teks}`)}"><i class="ws-isi" style="width:${p}%"></i></span><span class="ws-meter-v">${esc(teks)}</span></div>`
}

/** Strip komputer: CPU, memori, disk + peringatan dengan saran (R-7.9). */
export function stripKomputer(k) {
  if (!k) return ''
  const beban = (k.cpu.beban / k.cpu.core) * 100
  const memPakai = k.memori.bebasPersen == null ? 0 : 100 - k.memori.bebasPersen
  const diskPakai = 100 - (k.disk.sisaGiB / k.disk.totalGiB) * 100
  const nada = (v, kuning, merah) => (v >= merah ? 'bad' : v >= kuning ? 'warn' : 'ok')
  const kelompok = k.kelompok
    .filter((x) => x.mb >= 20)
    .slice(0, 6)
    .map(
      (x) =>
        `<li><span>${esc(x.nama)}</span><span class="mono">${x.mb >= 1024 ? `${(x.mb / 1024).toFixed(1)} GiB` : `${x.mb} MB`}</span></li>`,
    )
    .join('')
  const peringatan = k.peringatan
    .map(
      (w) =>
        `<li><span class="warn-t">!</span> ${esc(w.teks)} <span class="dim">→ ${esc(w.saran)}</span></li>`,
    )
    .join('')
  return `<section class="db-panel ws-komputer" aria-label="Komputer"><div class="ws-meter-baris">
      ${batang('CPU', beban, `beban ${k.cpu.beban.toFixed(1)} / ${k.cpu.core} core`, nada(beban, 100, 150))}
      ${batang('Memori', memPakai, k.memori.bebasPersen == null ? '?' : `${k.memori.bebasPersen}% bebas dari ${k.memori.totalGiB} GiB`, nada(memPakai, 75, 85))}
      ${batang('Disk', diskPakai, `sisa ${Math.round(k.disk.sisaGiB)} GiB`, k.disk.sisaGiB < 10 ? 'bad' : k.disk.sisaGiB < 20 ? 'warn' : 'ok')}
    </div>
    ${peringatan ? `<ul class="ws-peringatan">${peringatan}</ul>` : ''}
    <details class="ws-rinci"><summary class="dim ws-rinci-ringkas">Pemakaian memori per kelompok</summary><ul class="ws-kelompok">${kelompok}</ul></details></section>`
}

const SESI = {
  bekerja: ['info', '● Claude bekerja'],
  menunggu: ['warn', '◆ Menunggu kamu'],
  berhenti: ['', '○ Sesi berhenti'],
}

/** Daftar "Berikutnya" sebuah slot: naik/turun, pindah ke slot lain, keluarkan (kembali ke antre global). */
export function daftarBerikutnya(s) {
  const antrean = s.antrean ?? []
  if (!antrean.length) return ''
  const lain = [1, 2, 3].filter((n) => n !== s.n)
  const butir = antrean
    .map((a, i) => {
      const pindah = `<select class="in ws-pindah" data-ws-pindah="${esc(a.key)}" aria-label="Pindahkan ${esc(a.key)} ke slot lain"><option value="">Pindah ke…</option>${lain.map((n) => `<option value="${n}">Slot ${n}</option>`).join('')}</select>`
      return `<li><span class="ws-urut">${i + 1}.</span><span class="ws-berikut-isi"><a class="mono" href="#/kerja/${esc(a.key)}">${esc(a.key)}</a> <span class="dim">${esc(a.judul)}</span>${a.ditunda ? ' <span class="chip">ditunda</span>' : ''}${a.peringatan ? ` <span class="warn-t" title="${esc(a.peringatan)}">!</span>` : ''}</span><span class="ws-berikut-aksi"><button type="button" class="btn tb" data-ws-urut="${esc(a.key)}" data-arah="naik" aria-label="Naikkan ${esc(a.key)}"${i === 0 ? ' disabled' : ''}>↑</button><button type="button" class="btn tb" data-ws-urut="${esc(a.key)}" data-arah="turun" aria-label="Turunkan ${esc(a.key)}"${i === antrean.length - 1 ? ' disabled' : ''}>↓</button>${pindah}<button type="button" class="btn tb" data-ws-keluar="${esc(a.key)}" title="Kembali ke antre global">Keluarkan</button></span></li>`
    })
    .join('')
  const mulai = s.pemakai.length
    ? ''
    : `<div class="ws-mulai"><span class="dim">Slot kosong tetapi antrean belum berjalan.</span> <button type="button" class="btn tb" data-ws-mulai="${s.n}">Mulai antrean</button></div>`
  return `<div class="ws-berikutnya"><div class="db-eyebrow">Berikutnya <span class="dim">${antrean.length}</span></div><ol class="ws-berikut">${butir}</ol>${mulai}</div>`
}

/** Kartu satu slot: sedang dikerjakan, berikutnya, sesi, git, server, DB, aksi. */
export function kartuSlot(s) {
  const isi = s.pemakai.length
    ? `<div class="db-eyebrow">Sedang</div>${s.pemakai
        .map(
          (p) =>
            `<a class="mono" href="#/kerja/${esc(p.key)}">${esc(p.key)}</a> <span class="dim">${esc(p.judul)}</span>`,
        )
        .join('<br>')}`
    : '<span class="dim">kosong</span>'
  const sesi = s.sesi
    ? `<span class="chip ${SESI[s.sesi.status]?.[0] ?? ''}">${SESI[s.sesi.status]?.[1] ?? s.sesi.status}</span><span class="dim">${esc(s.sesi.fase)} · ${esc(JAM(s.sesi.at))}</span>`
    : ''
  const server = (nama, port, hidup) =>
    `<span>${esc(nama)} <span class="mono">:${port}</span> ${hidup ? '<span class="ok-t">● hidup</span>' : '<span class="dim">○ mati</span>'}</span>`
  const hidup = s.api || s.web
  return `<article class="db-panel ws-slot" aria-labelledby="ws-slot-${s.n}"><h2 id="ws-slot-${s.n}" class="ws-slot-h">Slot ${s.n}${s.chat ? ' <span class="chip" title="Slot tetap untuk kerja tanpa tiket (bug/permintaan dari chat)">chat</span>' : ''}${s.diam ? ' <span class="chip">diam</span>' : ''}</h2>
    ${s.ada ? '' : `<p class="bad-t">× worktree ${esc(s.worktree)} belum ada</p>`}
    <div class="ws-pemakai">${isi}</div>${sesi ? `<div class="ws-sesi">${sesi}</div>` : ''}${daftarBerikutnya(s)}
    <dl class="ws-dl"><dt>Git</dt><dd><span class="mono">${esc(s.branch ?? `detached ${s.head ?? '-'}`)}</span>${s.bersih ? '' : ' <span class="warn-t">! ada perubahan</span>'}</dd>
      <dt>Server</dt><dd class="ws-server">${server('API', s.portApi, s.api)}${server('Web', s.portWeb, s.web)}</dd>
      <dt>DB</dt><dd><span class="mono">${esc(s.db)}</span> <span class="dim">${esc(s.dbUkuran ?? '-')}</span></dd></dl>
    <div class="ws-aksi">${hidup ? `<button type="button" class="btn tb" data-ws-slot="${s.n}" data-ws-aksi="matikan">Matikan</button><a class="btn tb" href="http://localhost:${s.portWeb}" target="_blank" rel="noopener">Buka web ↗</a>` : `<button type="button" class="btn tb" data-ws-slot="${s.n}" data-ws-aksi="nyalakan">Nyalakan</button>`}
      <button type="button" class="btn tb" data-ws-slot="${s.n}" data-ws-aksi="migrasi">Migrasi</button>
      <button type="button" class="btn tb" data-ws-slot="${s.n}" data-ws-aksi="reset"${hidup ? ' disabled title="Matikan server dulu"' : ''}>Reset DB</button></div></article>`
}

/** Satu baris rencana: usulan bawaan + pilihan lain; Tams menerapkan per tiket. */
export function barisRencana(u) {
  const opsi = u.opsi
    .map(
      (o, i) =>
        `<option value="${esc(o.jenis)}:${o.n}"${i === 0 ? ' selected' : ''}>${esc(o.label)}${i === 0 ? ' (usulan)' : ''}</option>`,
    )
    .join('')
  return `<li class="ws-rencana-baris"><span class="ws-rencana-isi"><a class="mono" href="#/kerja/${esc(u.key)}">${esc(u.key)}</a> <span class="dim">${esc(u.judul)}</span>${u.modul ? ` <span class="chip">${esc(u.modul)}</span>` : ''}<span class="dim ws-rencana-alasan">${esc(u.alasan)}</span></span><span class="ws-berikut-aksi"><select class="in" data-ws-opsi="${esc(u.key)}" aria-label="Rencana untuk ${esc(u.key)}">${opsi}</select><button type="button" class="btn tb utama-tb" data-ws-terap="${esc(u.key)}">Terapkan</button></span></li>`
}

const STATUS_GABUNG = {
  menunggu: ['', '○ menunggu'],
  tergabung: ['ok', '✓ tergabung'],
  konflik: ['bad', '× konflik'],
  dikeluarkan: ['', '↷ dikeluarkan'],
}
const HASIL_CI = { lulus: ['ok', '✓'], peringatan: ['warn', '!'], gagal: ['bad', '×'] }

/** Gabungan yang sedang berjalan: tiket + status, langkah berikutnya, dan aksi sesuai keadaan. */
function gabunganAktif(d) {
  const g = d.gabungan
  const tiket = g.tiket
    .map((t) => {
      const [kelas, label] = STATUS_GABUNG[t.status] ?? ['', t.status]
      const rinci =
        t.status === 'konflik' && t.konflik?.length
          ? `<span class="dim ws-gb-konflik">Berkas konflik: <span class="mono">${t.konflik.map(esc).join(', ')}</span></span>`
          : ''
      const aksi = []
      if (!g.push && (t.status === 'konflik' || t.status === 'menunggu'))
        aksi.push(`<button type="button" class="btn tb" data-gb-keluarkan="${esc(t.key)}">Keluarkan</button>`)
      if (!g.push && t.status === 'konflik')
        aksi.push(`<button type="button" class="btn tb" data-gb-konflik="${esc(t.key)}" title="Sesi Claude tiket ini menyelesaikan konflik di worktree v2-gabung">Minta AI selesaikan konflik</button>`)
      return `<li class="ws-gb-tiket"><span class="ws-gb-isi"><a class="mono" href="#/kerja/${esc(t.key)}">${esc(t.key)}</a> <span class="chip ${kelas}">${esc(label)}</span> <span class="dim mono">${esc(t.branch)}</span>${rinci}</span><span class="ws-berikut-aksi">${aksi.join('')}</span></li>`
    })
    .join('')
  const tertunda = g.tiket.some((t) => t.status === 'menunggu' || t.status === 'konflik')
  const bergabung = g.tiket.some((t) => t.status === 'tergabung')
  const ci = g.gerbangCi
  const ciTeks = d.gerbangBerjalan
    ? '<span class="chip info"><span class="putar kecil" aria-hidden="true"></span>Gerbang CI berjalan…</span>'
    : ci
      ? `<span class="chip ${HASIL_CI[ci.hasil]?.[0] ?? ''}">${HASIL_CI[ci.hasil]?.[1] ?? ''} Gerbang CI ${esc(ci.hasil)}</span><span class="dim">${ci.langkah.filter((l) => l.hasil === 'lulus').length}/${ci.langkah.length} · <span class="mono">${esc(ci.head.slice(0, 8))}</span></span>`
      : '<span class="dim">○ Gerbang CI belum dijalankan</span>'
  const masalahCi =
    ci && !d.gerbangBerjalan
      ? ci.langkah
          .filter((l) => l.hasil !== 'lulus')
          .map((l) => `<li>${l.hasil === 'peringatan' ? '<span class="warn-t">!</span>' : '<span class="bad-t">×</span>'} ${esc(l.judul)}${l.ringkas ? `<span class="dim">: ${esc(l.ringkas)}</span>` : ''}</li>`)
          .join('')
      : ''
  const aksi = []
  if (!g.push && !g.merge) {
    if (tertunda)
      aksi.push('<button type="button" class="btn tb utama-tb" data-gb-lanjut>Lanjutkan gabung</button>')
    if (!tertunda && bergabung)
      aksi.push(`<button type="button" class="btn tb" data-gb-gerbang${d.gerbangBerjalan ? ' disabled' : ''}>${ci ? 'Jalankan ulang gerbang CI' : 'Jalankan gerbang CI'}</button>`)
    aksi.push(
      d.syarat?.boleh
        ? `<button type="button" class="btn tb kj-tim" data-gb-push>Push ${esc(g.branch)}…</button>`
        : `<button type="button" class="btn tb" disabled title="${esc((d.syarat?.alasan ?? []).join('; ') || d.langkah.alasan)}">Push</button>`,
    )
  }
  if (!g.push || g.merge)
    aksi.push('<button type="button" class="btn tb" data-gb-batal>Batalkan gabungan</button>')
  const sudahPush = g.push
    ? `<p class="ok-t">✓ Di-push ${esc(JAM(g.push.at))} <span class="dim">· <span class="mono">${esc(g.push.head.slice(0, 8))}</span>${g.merge ? ' · sudah di-merge ke development' : ''}</span></p>`
    : ''
  const mr =
    g.push && !g.merge
      ? `<form class="kj-tanya-isi" data-gb-mr><input type="url" name="url" value="${esc(g.mr ?? '')}" placeholder="Tempel link MR dari GitLab…" aria-label="Link MR gabungan"><button type="submit" class="btn tb">Simpan</button></form>${g.mr ? `<a class="btn tb" href="${esc(g.mr)}" target="_blank" rel="noopener">Buka MR ↗</a>` : ''}`
      : ''
  return `<div class="ws-gb-kepala"><span class="mono">${esc(g.branch)}</span> <span class="dim">dari <span class="mono">origin/development</span> ${esc(g.base.slice(0, 8))}</span></div>
    <ul class="ws-gb-daftar">${tiket}</ul>
    <p class="ws-gb-langkah"><b>Langkah berikutnya:</b> ${esc(d.langkah.alasan)}</p>
    <div class="ws-gb-ci">${ciTeks}</div>${masalahCi ? `<ul class="kj-serah-daftar">${masalahCi}</ul>` : ''}${sudahPush}
    <div class="ws-aksi">${aksi.join('')}<button type="button" class="btn tb" data-gb-salin-mr${d.mr ? '' : ' disabled'}>Salin deskripsi MR</button>${mr}</div>`
}

/** Calon gabung: kotak centang per tiket + nama branch + tombol Gabungkan. */
function calonGabungan(d) {
  if (!d.calon.length)
    return '<p class="dim">Belum ada tiket yang siap digabung. Tiket yang sudah disetujui (◆B), punya commit, dan belum di-push muncul di sini.</p>'
  const baris = d.calon
    .map((c) => {
      const ci = c.gerbangFokus
      const chip = ci ? `<span class="chip ${HASIL_CI[ci]?.[0] ?? ''}">${HASIL_CI[ci]?.[1] ?? ''} fokus ${esc(ci)}</span>` : '<span class="dim">fokus belum dijalankan</span>'
      return `<li class="ws-gb-calon"><label><input type="checkbox" data-gb-calon="${esc(c.key)}" checked><span class="ws-gb-isi"><a class="mono" href="#/kerja/${esc(c.key)}">${esc(c.key)}</a> <span class="dim">${esc(c.judul)}</span><span class="dim mono">${esc(c.branch)} · ${c.commit} commit</span> ${chip}</span></label></li>`
    })
    .join('')
  return `<ul class="ws-gb-daftar">${baris}</ul>
    <form class="ws-gb-buat" data-gb-buat><label class="dim" for="gb-branch">Branch gabungan</label><input id="gb-branch" class="in mono" name="branch" value="${esc(d.bawaan)}" aria-label="Nama branch gabungan"><button type="submit" class="btn tb utama-tb">Gabungkan</button></form>
    <p class="dim kj-catatan-kecil">Dibuat dari origin/development di worktree v2-gabung; tiket digabung satu per satu (merge --no-ff). Konflik menghentikan proses di tiket itu.</p>`
}

/** Kartu "Siap digabung" (K20). `d` = GET /api/gabung, atau null/galat saat belum termuat. */
export function kartuGabungan(d, { galat = null, sibuk = null } = {}) {
  const n = d?.gabungan ? d.gabungan.tiket.length : (d?.calon?.length ?? 0)
  const isi = galat
    ? `<p class="bad-t">× ${esc(galat)}</p>`
    : !d
      ? '<p class="dim">Memuat…</p>'
      : d.gabungan
        ? gabunganAktif(d)
        : calonGabungan(d)
  const info = sibuk ? `<div class="kj-sibuk glass" role="status"><span class="putar" aria-hidden="true"></span>${esc(sibuk)}…</div>` : ''
  return `<section class="db-panel ws-gabung" aria-labelledby="ws-gb-h"><h2 id="ws-gb-h" class="db-lajur-h">Siap digabung <span class="dim">${n}</span></h2>${info}${isi}</section>`
}

export function halamanWorkspace(w, { galat = null, sibuk = null, gabung = null, gabungGalat = null, gabungSibuk = null } = {}) {
  const kepala = `<div class="titlerow db-kepala"><div class="titlebox"><div class="ctx">Scenario Runner · kerja paralel</div><h1>Workspace</h1></div><button type="button" class="btn db-pil" id="ws-segarkan">Segarkan</button></div>`
  if (galat)
    return `${kepala}<div class="errbox" role="alert"><b>Workspace gagal dimuat</b><div class="mono">${esc(galat)}</div></div>`
  if (!w) return `${kepala}<div class="empty">Memuat workspace…</div>`
  const layanan = w.layanan
    .map(
      (l) =>
        `<li>${l.ok ? '<span class="ok-t">●</span>' : '<span class="bad-t">×</span>'} ${esc(l.nama)}${l.ok ? '' : ` <span class="dim">→ ${esc(l.saran)}</span>`}</li>`,
    )
    .join('')
  const usulan = w.rencana?.usulan ?? []
  const diRencana = new Set(usulan.map((u) => u.key))
  const sisaGlobal = w.antre.filter((a) => !diRencana.has(a.key))
  const rencana = usulan.length
    ? `<ol class="ws-antre ws-rencana">${usulan.map(barisRencana).join('')}</ol>${usulan.length >= 2 ? `<p class="dim ws-peringatan-klaster">${esc(w.rencana?.peringatan ?? '')}</p>` : ''}`
    : '<p class="dim">Tidak ada tiket yang menunggu slot.</p>'
  const antre = sisaGlobal.length
    ? `<div class="db-eyebrow">Antre global <span class="dim">${sisaGlobal.length}</span></div><ol class="ws-antre">${sisaGlobal.map((a) => `<li><a class="mono" href="#/kerja/${esc(a.key)}">${esc(a.key)}</a> <span class="dim">${esc(a.judul)}</span> <button type="button" class="btn tb" data-ws-tempatkan="${esc(a.key)}">Tempatkan…</button></li>`).join('')}</ol>`
    : ''
  return `<div class="db ws">${kepala}${sibuk ? `<div class="kj-sibuk glass" role="status"><span class="putar" aria-hidden="true"></span>${esc(sibuk)}…</div>` : ''}${stripKomputer(w.komputer)}
    <div class="ws-slot-baris">${w.slot.map(kartuSlot).join('')}</div>
    ${kartuGabungan(gabung, { galat: gabungGalat, sibuk: gabungSibuk })}
    <div class="ws-bawah"><section class="db-panel" aria-labelledby="ws-lay-h"><h2 id="ws-lay-h" class="db-lajur-h">Layanan bersama</h2><ul class="ws-layanan">${layanan}</ul></section>
      <section class="db-panel" aria-labelledby="ws-antre-h"><h2 id="ws-antre-h" class="db-lajur-h">Rencana slot <span class="dim">${usulan.length + sisaGlobal.length}</span></h2>${rencana}${antre}</section></div></div>`
}

/** Isi dialog pilihan slot saat Ambil / Tempatkan (R-7.1a). */
export function isiPilihSlot(key, pilihan) {
  const opsi = pilihan
    .map((p) => {
      const mati = p.keadaan === 'tidak-siap'
      const judul =
        p.keadaan === 'kosong'
          ? `Slot ${p.n} · kosong`
          : p.keadaan === 'klaster'
            ? `Slot ${p.n} · gabung klaster ${p.pemakai.map((x) => x.key).join(', ')}`
            : `Slot ${p.n} · belum siap`
      return `<label class="kj-pilihan"><input type="radio" name="ws-slot" value="${p.n}"${mati ? ' disabled' : ''}><span><b>${esc(judul)}</b><span class="kj-ket">${esc(p.keterangan)}</span></span></label>`
    })
    .join('')
  // Slot terisi juga bisa diantre: kerja ini naik otomatis (branch baru, DB tidak di-reset) setelah pemakainya di-push.
  const antreSlot = pilihan
    .filter((p) => p.keadaan === 'klaster')
    .map(
      (p) =>
        `<label class="kj-pilihan"><input type="radio" name="ws-slot" value="antre:${p.n}"><span><b>⏸ Antre di slot ${p.n}</b><span class="kj-ket">Naik otomatis setelah ${esc(p.pemakai.map((x) => x.key).join(', '))} di-push; DB tidak di-reset</span></span></label>`,
    )
    .join('')
  return `<div class="kj-dialog-kepala"><h2>Ambil ${esc(key)} ke…</h2></div>
    <fieldset><legend class="db-eyebrow">Slot</legend>${opsi}${antreSlot}<label class="kj-pilihan"><input type="radio" name="ws-slot" value="antre"><span><b>⏸ Antrekan</b><span class="kj-ket">Tunggu slot kosong; tiket tetap diambil dari Plane</span></span></label></fieldset>
    <p class="dim kj-catatan-kecil">Slot kosong: branch <span class="mono">feat/${esc(key.toLowerCase())}</span> dari development, server slot dimatikan, DB di-reset dari template lalu dimigrasi (±1 menit).</p>
    <div class="kj-dialog-aksi"><button class="btn tb" value="batal">Batal</button><button class="btn tb utama-tb" value="ok" id="ws-pilih-ok" disabled>Ambil</button></div>`
}

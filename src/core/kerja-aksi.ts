// Aksi Kerja yang dipakai CLI (bun run kerja) dan panel: ambil dari Plane, target, potret, cek, catat,
// tulis ke Plane. Menulis ke Plane terlihat tim: pemanggil wajib sudah mendapat konfirmasi pengguna.
import { spawn, spawnSync } from 'node:child_process'
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import path from 'node:path'
import {
  antreanLengkap,
  cekBasi,
  denganAntre,
  geserUrutan,
  pilihBerikutnya,
  type TujuanAntre,
  type UsulanTiket,
  usulanRencana,
} from './antrean.ts'
import {
  type DataCatatan,
  periksaCatatan,
  ringkasPeriksaCatatan,
  tambahKeputusan,
  tambahMintaUbah,
  templatCatatan,
} from './catatan.ts'
import { config, ROOT } from './config.ts'
import {
  arsipkanGabungan,
  bacaGabungan,
  calonGabung,
  type Gabungan,
  langkahGabungan,
  lanjutkanGabung,
  mulaiGabungan,
  namaGabunganBawaan,
  simpanGabungan,
  WORKTREE_GABUNG,
} from './gabung.ts'
import { type HasilGerbang, jalankanGerbang } from './gerbang.ts'
import {
  adaKerja,
  adalahKerjaLokal,
  bacaBerkasKerja,
  bacaKerja,
  daftarKerja,
  dataCatatan,
  dirKerja,
  type Fase,
  formatDua,
  type HasilCek,
  type Kerja,
  kerjaDariTiket,
  komentarHtml,
  LABEL_TAHAP,
  pindahTahap,
  setCek,
  simpanKerja,
  TAHAP,
  type Tahap,
  TargetSchema,
} from './kerja.ts'
import { PENTING_POTRET, periksaKesehatan } from './kesehatan.ts'
import {
  type LaporanKerja,
  type LaporanLengkap,
  periksaLaporan,
  setujuiHasil,
} from './laporan-kerja.ts'
import { metrikKerja, tokenSesi } from './metrik.ts'
import { MODUL_V2, panen, tebakModul } from './panen.ts'
import {
  ambilTiket,
  komentarTiket,
  pindahStatusTiket,
  planeDikonfigurasi,
  tugasSayaTersimpan,
} from './plane.ts'
import { potret } from './potret.ts'
import { deskripsiMr, keadaanGit, pushBranch, sudahDiMerge, syaratPush } from './serah.ts'
import {
  argsClaude,
  type FaseSesi,
  keadaanTmux,
  type ModeSesi,
  mulaiTmux,
  promptFase,
  type Sesi,
  statusDariHook,
} from './sesi.ts'
import {
  branchBaru,
  type DefSlot,
  defSlot,
  denganSlot,
  NOMOR_SLOT,
  type NomorSlot,
  type PemakaiSlot,
  pilihanSlot,
  SLOT_CHAT,
  semuaSlot,
  siapkanSlotBaru,
} from './slot.ts'

export async function ambilKerja(key: string): Promise<Kerja> {
  const t = await ambilTiket(key)
  const { kerja, tiketMd } = kerjaDariTiket(t, adaKerja(key) ? bacaKerja(key) : null)
  simpanKerja(kerja)
  writeFileSync(path.join(dirKerja(key), 'tiket.md'), tiketMd)
  // Kerangka catatan: hanya bagian tulisan; bagian data dirender dari kerja.json (R-8.1).
  // Kerja format 2 tidak punya catatan.md: laporannya lima kartu di kerja.json.
  if (!formatDua(kerja) && bacaBerkasKerja(key, 'catatan.md') === null)
    writeFileSync(path.join(dirKerja(key), 'catatan.md'), templatCatatan(key))
  return kerja
}

/** Gerbang catatan sebuah kerja: brief (akhir Pahami) atau akhir (sebelum Didokumentasikan). */
export function periksaCatatanKerja(key: string, saat: 'brief' | 'akhir') {
  const k = bacaKerja(key)
  if (formatDua(k))
    return periksaLaporan({ ...k, temuan: k.temuan ?? [], dilakukan: k.dilakukan ?? [] }, saat)
  return periksaCatatan(bacaBerkasKerja(key, 'catatan.md'), dataCatatan(k), k.verifikasi, saat)
}

/** Gerbang yang harus lulus untuk MAJU ke sebuah tahap; mundur selalu boleh. */
export const gerbangTahap = (tahap: Tahap): 'brief' | 'akhir' | null =>
  tahap === 'dikerjakan' || tahap === 'diverifikasi'
    ? 'brief'
    : tahap === 'didokumentasikan' || tahap === 'selesai'
      ? 'akhir'
      : null

export function setTahap(key: string, tahap: Tahap, catatan = ''): Kerja {
  const lama = bacaKerja(key)
  const maju = TAHAP.indexOf(tahap) > TAHAP.indexOf(lama.tahap)
  const saat = gerbangTahap(tahap)
  if (maju && saat) {
    const p = periksaCatatanKerja(key, saat)
    if (!p.ok)
      throw new Error(
        `Belum bisa pindah ke ${LABEL_TAHAP[tahap]}. ${ringkasPeriksaCatatan(p, saat)}`,
      )
  }
  const k = pindahTahap(lama, tahap, catatan)
  simpanKerja(k)
  return k
}

/** Ubah bagian data catatan lalu simpan (keputusan, pertanyaan, minta ubah, cek staging). */
export function ubahDataCatatan(key: string, f: (d: DataCatatan) => DataCatatan): Kerja {
  const k = bacaKerja(key)
  const k2 = { ...k, ...f(dataCatatan(k)) }
  simpanKerja(k2)
  return k2
}

/** Laporan format 2 sebuah kerja (tanpa keputusan/verifikasi). */
export const laporanDari = (k: Kerja): LaporanKerja => ({
  masalah: k.masalah,
  temuan: k.temuan ?? [],
  dilakukan: k.dilakukan ?? [],
  hasil: k.hasil,
})

/** Laporan lengkap (lima kartu + verifikasi) untuk panen, deskripsi MR, dan --render. */
export const laporanLengkap = (k: Kerja): LaporanLengkap => ({
  ...laporanDari(k),
  keputusan: k.keputusan,
  verifikasi: k.verifikasi,
})

/**
 * Ubah laporan format 2 lalu simpan (hanya menambah butir; lihat laporan-kerja.ts). `riwayat` bila
 * perubahan itu penting dicatat di riwayat (mis. Masalah diganti).
 */
export function ubahLaporan(
  key: string,
  f: (l: LaporanKerja) => LaporanKerja,
  riwayat?: (l: LaporanKerja) => string | null,
): Kerja {
  const k = bacaKerja(key)
  if (!formatDua(k))
    throw new Error(
      `${key} memakai format laporan lama (catatan.md); perintah ini hanya untuk format 2`,
    )
  const l = f(laporanDari(k))
  const k2 = { ...k, masalah: l.masalah, temuan: l.temuan, dilakukan: l.dilakukan, hasil: l.hasil }
  const cat = riwayat?.(l)
  simpanKerja(cat ? pindahTahap(k2, k.tahap, cat) : k2)
  return bacaKerja(key)
}

/** Masukan deskripsi MR satu kerja: kerja format 2 membawa laporannya, format lama catatan.md. */
export const tiketMr = (x: Kerja) => ({
  key: x.key,
  judul: x.judul,
  url: x.url,
  md: formatDua(x) ? null : bacaBerkasKerja(x.key, 'catatan.md'),
  data: dataCatatan(x),
  verifikasi: x.verifikasi,
  ...(formatDua(x) ? { laporan: laporanLengkap(x) } : {}),
})

/** Target potret dari objek atau berkas JSON; divalidasi skema. */
export function setTarget(key: string, sumber: unknown): Kerja {
  const isi = typeof sumber === 'string' ? JSON.parse(readFileSync(sumber, 'utf8')) : sumber
  const r = TargetSchema.safeParse(isi)
  if (!r.success)
    throw new Error(
      `Target tidak sah:\n${r.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n')}`,
    )
  const k = { ...bacaKerja(key), target: r.data }
  simpanKerja(k)
  return k
}

export async function potretKerja(
  key: string,
  fase: Fase,
  log?: (l: string) => void,
): Promise<Kerja> {
  // Tanpa web, API, atau DB, potret hanya merekam halaman galat dan menimpa bukti (R-7.7).
  const k0 = bacaKerja(key)
  return denganSlot(slotKerja(k0), () => potretDiLingkungan(key, fase, log))
}

async function potretDiLingkungan(
  key: string,
  fase: Fase,
  log?: (l: string) => void,
): Promise<Kerja> {
  const sehat = await periksaKesehatan({ hanya: PENTING_POTRET })
  const mati = sehat.cek.filter((c) => c.hasil === 'gagal')
  if (mati.length)
    throw new Error(
      `Potret ${fase} dibatalkan: ${mati.map((c) => `${c.nama} ${c.info}${c.saran ? ` (${c.saran})` : ''}`).join('; ')}`,
    )
  const hasil = await potret(bacaKerja(key), fase, log)
  // Baca ulang: kerja.json bisa berubah selama memotret (mis. hasil cek dicatat).
  const k = bacaKerja(key)
  const gagal = [...hasil.layar, ...hasil.db].filter((x) => x.galat).length
  const k2 = pindahTahap(
    { ...k, potret: { ...k.potret, [fase]: hasil } },
    k.tahap,
    `Potret ${fase}: ${hasil.layar.length} layar, ${hasil.db.length} query${gagal ? `, ${gagal} gagal` : ''}`,
  )
  simpanKerja(k2)
  return k2
}

export function catatKerja(
  key: string,
  o: { branch?: string; commit?: string[]; skenario?: string[]; worktree?: string },
): Kerja {
  const k = bacaKerja(key)
  const gabung = (a: string[], b: string[] = []) => [...new Set([...a, ...b])]
  const k2 = {
    ...k,
    worktree: o.worktree ? path.resolve(o.worktree) : k.worktree,
    branch: o.branch ?? k.branch,
    commit: gabung(k.commit, o.commit),
    skenario: gabung(k.skenario, o.skenario),
  }
  simpanKerja(k2)
  return k2
}

/** Worktree v2 sebuah kerja: opsi eksplisit, lalu kerja.json, lalu V2_REPO_DIR. */
export const worktreeKerja = (k: Kerja, dir?: string) =>
  path.resolve(dir ?? k.worktree ?? config.v2RepoDir)

/** Jalankan gerbang fokus/ci untuk sebuah kerja; hasil disimpan di kerja.json, log di kerja/<KEY>/gerbang/. */
export async function gerbangKerja(
  key: string,
  tingkat: 'fokus' | 'ci',
  o: { dir?: string; rinci?: (s: string) => void } = {},
): Promise<HasilGerbang> {
  const k = bacaKerja(key)
  const dir = worktreeKerja(k, o.dir)
  if (!existsSync(path.join(dir, '.git'))) throw new Error(`Worktree v2 tidak ditemukan: ${dir}`)
  const cap = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13)
  const h = await jalankanGerbang({
    dir,
    tingkat,
    logRel: `kerja/${key}/gerbang/${tingkat}-${cap}.log`,
    rinci: o.rinci,
  })
  const k2 = bacaKerja(key)
  simpanKerja({ ...k2, gerbang: { ...(k2.gerbang ?? {}), [tingkat]: h } })
  return h
}

/** Catat hasil verifikasi satu kriteria tiket. */
export function cekKerja(key: string, kriteria: string, hasil: HasilCek, bukti = ''): Kerja {
  const k = setCek(bacaKerja(key), kriteria, hasil, bukti)
  simpanKerja(k)
  return k
}

/** Kirim komentar dokumentasi ke tiket Plane. Hanya setelah dikonfirmasi pengguna. */
export async function komentarKePlane(key: string, catatan = ''): Promise<Kerja> {
  const k = bacaKerja(key)
  await komentarTiket(k.plane, komentarHtml(k, catatan))
  const at = new Date().toISOString()
  const k2 = pindahTahap(
    { ...k, plane: { ...k.plane, komentar_at: at } },
    k.tahap,
    'Komentar dokumentasi dikirim ke Plane',
  )
  simpanKerja(k2)
  return k2
}

/** Pindah status tiket di Plane. Hanya setelah dikonfirmasi pengguna. */
export async function statusKePlane(key: string, nama: string): Promise<Kerja> {
  const k = bacaKerja(key)
  const baru = await pindahStatusTiket(k.plane, nama)
  const at = new Date().toISOString()
  const k2 = pindahTahap(
    { ...k, plane: { ...k.plane, status: baru, status_baru: baru, status_at: at } },
    k.tahap,
    `Status Plane dipindah ke ${baru}`,
  )
  simpanKerja(k2)
  return k2
}

/**
 * Jalankan satu fase Claude untuk tiket (R-6.1–R-6.3): sesi tmux `kerja-<KEY>` di akar
 * scenario-runner dengan worktree v2 sebagai --add-dir. Sesi Claude per tiket dibuat sekali.
 */
export async function jalankanFase(
  key: string,
  fase: FaseSesi,
  mode: ModeSesi,
  o: { teks?: string; port: number; model?: string; worktree?: string },
): Promise<{ kerja: Kerja; cara: string }> {
  const k = bacaKerja(key)
  const worktree = o.worktree ?? worktreeKerja(k)
  const baru = !k.sesi
  const id = k.sesi?.id ?? crypto.randomUUID()
  const args = argsClaude({
    key,
    fase,
    mode,
    sesiId: id,
    baru,
    worktree,
    port: o.port,
    teks: o.teks,
    model: o.model,
  })
  const cara = await mulaiTmux(key, {
    args,
    mode,
    prompt: promptFase(key, fase, { worktree, teks: o.teks }),
    cwd: ROOT,
  })
  const at = new Date().toISOString()
  const sesi: Sesi = {
    id,
    fase,
    mode,
    status: 'bekerja',
    mulai: cara === 'dimulai' ? at : (k.sesi?.mulai ?? at),
    at,
  }
  const k2 = pindahTahap(
    { ...bacaKerja(key), sesi },
    k.tahap,
    `Claude: fase ${fase} (${mode}, ${cara})`,
  )
  simpanKerja(k2)
  return { kerja: k2, cara }
}

/** Kabar dari hook Claude Code → status sesi (R-6.4). Event tak dikenal diabaikan. */
export function kabarSesi(
  key: string,
  payload: { hook_event_name?: string; message?: string },
): Kerja | null {
  const k = bacaKerja(key)
  if (!k.sesi) return null
  const s = statusDariHook(String(payload.hook_event_name ?? ''), payload.message)
  if (!s) return null
  const k2 = {
    ...k,
    sesi: { ...k.sesi, status: s.status, pesan: s.pesan, at: new Date().toISOString() },
  }
  simpanKerja(k2)
  return k2
}

/** Status sesi yang dicocokkan dengan tmux: sesi yang prosesnya sudah mati dianggap berhenti. */
export async function sesiTerkini(
  key: string,
): Promise<{ sesi: Sesi | null; tmux: Awaited<ReturnType<typeof keadaanTmux>> }> {
  const k = bacaKerja(key)
  const t = await keadaanTmux(key)
  if (k.sesi && k.sesi.status !== 'berhenti' && !t.hidup) {
    const k2 = {
      ...k,
      sesi: {
        ...k.sesi,
        status: 'berhenti' as const,
        pesan: 'Proses Claude sudah berhenti',
        at: new Date().toISOString(),
      },
    }
    simpanKerja(k2)
    return { sesi: k2.sesi, tmux: t }
  }
  return { sesi: k.sesi ?? null, tmux: t }
}

/** Tunda atau aktifkan lagi sebuah tiket; tercatat di riwayat. */
export function tundaKerja(key: string, tunda: boolean, alasan = ''): Kerja {
  const k = bacaKerja(key)
  const { ditunda: _lama, ...tanpa } = k
  const k2 = tunda
    ? {
        ...k,
        ditunda: {
          at: new Date().toISOString(),
          ...(alasan.trim() ? { alasan: alasan.trim() } : {}),
        },
      }
    : tanpa
  const k3 = pindahTahap(
    k2 as Kerja,
    k.tahap,
    tunda ? `Ditunda${alasan.trim() ? `: ${alasan.trim()}` : ''}` : 'Diaktifkan lagi',
  )
  simpanKerja(k3)
  return k3
}

/** Tiket se-klaster: kerja lain dengan branch sama (deskripsi MR dan catatan push digabung). */
export function klasterKerja(k: Kerja): Kerja[] {
  if (!k.branch) return [k]
  const nomor = (key: string) => Number(key.split('-')[1] ?? 0)
  return daftarKerja()
    .filter((x) => x.branch === k.branch)
    .sort((a, b) => nomor(a.key) - nomor(b.key))
}

/** Keadaan serah sebuah kerja: git worktree, syarat push, dan deskripsi MR (R-4.2, R-8.4). */
export function keadaanSerah(key: string, gerbangBerjalan = false) {
  const k = bacaKerja(key)
  const dir = worktreeKerja(k)
  const git = keadaanGit(dir)
  const dasar = syaratPush({ git, gerbangCi: k.gerbang?.ci ?? null, gerbangBerjalan })
  // Tiket di gabungan aktif di-push lewat branch gabungan, bukan sendiri-sendiri (K20).
  const gb = bacaGabungan()
  const tg = gb?.tiket.find((t) => t.key === key && t.status !== 'dikeluarkan')
  const gabungan =
    gb && tg
      ? { branch: gb.branch, status: tg.status, konflik: tg.konflik ?? [], merge: !!gb.merge }
      : null
  const syarat =
    gabungan && !gabungan.merge
      ? { boleh: false, alasan: [`di-push lewat gabungan ${gabungan.branch}`, ...dasar.alasan] }
      : dasar
  const tiket = klasterKerja(k).map(tiketMr)
  const mr = deskripsiMr({
    tiket,
    branch: git.branch ?? '(detached)',
    commit: git.akanDipush,
    gerbangCi: k.gerbang?.ci ?? null,
  })
  return {
    worktree: dir,
    git,
    syarat,
    gerbangCi: k.gerbang?.ci ?? null,
    gerbangBerjalan,
    mr,
    push: k.push ?? null,
    linkMr: k.mr ?? null,
    gabungan,
    klaster: tiket.map((t) => t.key),
  }
}

/**
 * Push dari panel (R-2.3, R-4.2): syarat diperiksa ulang di server, push biasa ke origin, lalu
 * dicatat di semua tiket se-klaster. Hanya dipanggil dari endpoint panel setelah klik Tams.
 */
export function pushKerja(
  key: string,
  o: { setelahLepas?: (n: number, pelepas: string[]) => void } = {},
): Kerja {
  const s = keadaanSerah(key)
  if (!s.syarat.boleh) throw new Error(`Push ditolak: ${s.syarat.alasan.join('; ')}`)
  const branch = s.git.branch as string
  const r = pushBranch(s.worktree, branch, !!s.git.upstream)
  if (!r.ok) throw new Error(`git push gagal: ${r.keluaran.split('\n').slice(-3).join(' ')}`)
  const at = new Date().toISOString()
  const catat = {
    at,
    branch,
    head: s.git.head,
    remote: s.git.remote,
    jumlah: s.git.akanDipush.length,
  }
  // Slot dilepas setelah push (R-7.3): Pasca-deploy tidak memakai worktree.
  const slotLama = bacaKerja(key).slot ?? null
  const pelepas = klasterKerja(bacaKerja(key)).map((x) => x.key)
  for (const x of klasterKerja(bacaKerja(key)))
    simpanKerja(
      pindahTahap(
        { ...bacaKerja(x.key), push: catat, slot: null },
        bacaKerja(x.key).tahap,
        `Di-push ke ${branch} (${catat.jumlah} commit, ${s.git.head.slice(0, 8)}) dari panel`,
      ),
    )
  // Pergantian otomatis (K21): kerja pertama di antrean slot itu naik, di proses terpisah supaya
  // respons push tidak menunggu git switch + migrasi.
  if (slotLama && (NOMOR_SLOT as readonly number[]).includes(slotLama))
    (o.setelahLepas ?? mulaiAntreanLatar)(slotLama, pelepas)
  return bacaKerja(key)
}

/** Simpan link MR yang ditempel Tams (hanya https). */
export function simpanLinkMr(key: string, url: string): Kerja {
  const u = url.trim()
  if (u && !/^https:\/\/\S+$/.test(u)) throw new Error('Link MR harus diawali https://')
  const k = bacaKerja(key)
  const k2 = { ...k, mr: u || undefined }
  simpanKerja(k2)
  return k2
}

/** Definisi slot sebuah kerja, atau null bila tidak memegang slot. */
export function slotKerja(k: Kerja): DefSlot | null {
  return k.slot && (NOMOR_SLOT as readonly number[]).includes(k.slot)
    ? defSlot(k.slot as NomorSlot)
    : null
}

/** Pemakai tiap slot: kerja aktif (belum selesai) yang memegang slot itu. */
export function pemakaiSlot(): Map<number, PemakaiSlot[]> {
  const m = new Map<number, PemakaiSlot[]>()
  for (const k of daftarKerja())
    if (k.slot && k.tahap !== 'selesai')
      m.set(k.slot, [...(m.get(k.slot) ?? []), { key: k.key, judul: k.judul, branch: k.branch }])
  return m
}

export function pilihanSlotKerja() {
  const siap = new Map(semuaSlot().map((s) => [s.n, existsSync(path.join(s.worktree, '.git'))]))
  return pilihanSlot(pemakaiSlot(), siap)
}

/**
 * Tempatkan tiket di slot (R-7.1a). Slot kosong: branch kerja baru dari development, server slot
 * dimatikan, DB di-reset dari template lalu dimigrasi. Slot terisi: gabung klaster (branch dan
 * DB yang sama, tanpa reset). Mengembalikan ringkasan langkah.
 */
export function tempatkanDiSlot(
  key: string,
  n: NomorSlot,
  o: { resetDb?: boolean } = {},
): { kerja: Kerja; langkah: string[] } {
  const k = bacaKerja(key)
  if (k.slot) throw new Error(`${key} sudah di slot ${k.slot}`)
  const pil = pilihanSlotKerja().find((p) => p.n === n)
  if (!pil || pil.keadaan === 'tidak-siap') throw new Error(`Slot ${n} belum siap`)
  const s = defSlot(n)
  let langkah: string[]
  let ubah: Partial<Kerja>
  if (pil.keadaan === 'kosong') {
    const branch = k.branch ?? branchBaru(key)
    const reset = o.resetDb ?? n !== SLOT_CHAT
    const db = reset ? 'DB slot di-reset dari template' : 'DB slot dipertahankan (tanpa reset)'
    langkah = [`branch ${branch}`, db, ...siapkanSlotBaru(s, branch, { resetDb: reset })]
    ubah = { slot: n, worktree: s.worktree, branch, klaster: undefined }
  } else {
    const induk = pil.pemakai[0] as PemakaiSlot
    langkah = [`gabung klaster ${induk.key} (branch ${induk.branch ?? '-'})`]
    ubah = { slot: n, worktree: s.worktree, branch: induk.branch, klaster: induk.key }
  }
  const { antre: _a, peringatanAntre: _w, ...tanpaAntre } = bacaKerja(key)
  const k2 = pindahTahap(
    { ...tanpaAntre, ...ubah } as Kerja,
    k.tahap,
    `Ditempatkan di slot ${n}: ${langkah[0]}`,
  )
  simpanKerja(k2)
  return { kerja: k2, langkah }
}

/**
 * Masukkan tiket ke antrean: `slot` = antre di slot itu (naik otomatis setelah kerja aktifnya
 * di-push); tanpa `slot` = antre global (Tams menempatkan sendiri). Hanya menulis kerja.json.
 */
export function antrekanKerja(key: string, o: { slot?: number } = {}): Kerja {
  const k = bacaKerja(key)
  const tujuan: TujuanAntre = o.slot ?? 'global'
  const k2 = pindahTahap(
    denganAntre(daftarKerja(), k, tujuan, new Date().toISOString()),
    k.tahap,
    tujuan === 'global' ? 'Masuk antrean slot' : `Masuk antrean slot ${tujuan}`,
  )
  simpanKerja(k2)
  return k2
}

/** Geser butir naik/turun di antreannya. */
export function aturUrutAntre(key: string, arah: 'naik' | 'turun'): Kerja {
  const semua = daftarKerja()
  for (const u of geserUrutan(semua, key, arah)) {
    const k = bacaKerja(u.key)
    if (k.antre) simpanKerja({ ...k, antre: { ...k.antre, urutan: u.urutan } })
  }
  return bacaKerja(key)
}

/** Pindahkan butir ke antrean slot lain, atau `global` (juga cara mengeluarkannya dari antrean slot). */
export function pindahAntre(key: string, tujuan: TujuanAntre): Kerja {
  const k = bacaKerja(key)
  if (!k.antre) throw new Error(`${key} tidak ada di antrean`)
  const k2 = pindahTahap(
    denganAntre(daftarKerja(), k, tujuan, new Date().toISOString()),
    k.tahap,
    tujuan === 'global'
      ? `Dikeluarkan dari antrean slot ${k.antre.slot ?? '-'} (kembali ke antre global)`
      : `Dipindah ke antrean slot ${tujuan}`,
  )
  simpanKerja(k2)
  return k2
}

/** Pindahkan sisa antrean sebuah slot ke slot lain (antrean tertahan); urutan dipertahankan. */
export function pindahkanSisaAntre(dari: number, ke: TujuanAntre): string[] {
  const keys = antreanLengkap(daftarKerja(), dari)
    .filter((k) => k.tahap !== 'selesai')
    .map((k) => k.key)
  for (const key of keys) pindahAntre(key, ke)
  return keys
}

/** Modul docs-site sebuah kerja: yang tersimpan, atau tebakan dari judul + tiket.md. */
export const modulKerja = (k: Kerja): string | null =>
  k.modul ?? tebakModul(k.judul, bacaBerkasKerja(k.key, 'tiket.md'))

/**
 * Rencana slot: usulan untuk tiket yang sudah diambil tapi belum punya slot atau antrean slot
 * (antre global ikut dihitung). Hanya usulan; Tams mengonfirmasi per tiket.
 */
export function rencanaSlotKerja(): UsulanTiket[] {
  const semua = daftarKerja()
  const menunggu = semua
    .filter(
      (k) =>
        !k.slot &&
        !k.push &&
        !k.ditunda &&
        (k.tahap === 'diambil' || k.tahap === 'dipelajari') &&
        (!k.antre || k.antre.slot === undefined),
    )
    .sort((a, b) => (a.diambil_at ?? '').localeCompare(b.diambil_at ?? ''))
  if (!menunggu.length) return []
  const pil = pilihanSlotKerja()
  return usulanRencana(
    menunggu.map((k) => ({
      key: k.key,
      judul: k.judul,
      modul: modulKerja(k),
      lokal: adalahKerjaLokal(k),
    })),
    pil.map((p) => ({
      n: p.n,
      siap: p.keadaan !== 'tidak-siap',
      pemakai: p.pemakai.map((x) => ({
        key: x.key,
        modul: modulKerja(semua.find((y) => y.key === x.key) as Kerja),
      })),
      antre: antreanLengkap(semua, p.n).filter((k) => k.tahap !== 'selesai').length,
    })),
  )
}

// ── Pergantian otomatis setelah push (K21) ─────────────────────────────────

export interface DepGanti {
  semua(): Kerja[]
  simpan(k: Kerja): void
  /** Status segar tiket di Plane (read-only); null = tak diketahui. */
  statusPlane(key: string): Promise<string | null>
  /** Tempatkan di slot kosong: branch baru dari development, DB tidak di-reset. */
  tempatkan(key: string, n: NomorSlot, o: { resetDb: boolean }): { kerja: Kerja; langkah: string[] }
  selesaiNama: string[]
  kini(): string
}

export interface HasilGanti {
  ditempatkan: string | null
  dilewati: { key: string; alasan: string }[]
  gagal: { key: string; alasan: string } | null
}

/**
 * Status Plane segar untuk cek basi: baca satu tiket (read-only); bila gagal, cadangannya cache
 * Tugas saya. Kerja lokal tidak sampai ke sini (cekBasi mengecualikannya).
 */
async function statusPlaneSegar(key: string): Promise<string | null> {
  if (!planeDikonfigurasi()) return null
  try {
    return (await ambilTiket(key)).status
  } catch {
    return tugasSayaTersimpan()?.tugas.find((t) => t.key === key)?.status ?? null
  }
}

const depBawaan = (): DepGanti => ({
  semua: daftarKerja,
  simpan: simpanKerja,
  statusPlane: statusPlaneSegar,
  tempatkan: tempatkanDiSlot,
  selesaiNama: config.plane.statusSelesai,
  kini: () => new Date().toISOString(),
})

/**
 * Slot `n` baru dilepas: tempatkan kerja pertama di antrean slot itu. Slot masih terisi → tidak
 * berbuat apa-apa. Tiap giliran dicek basi dulu (selesai di Plane/dibatalkan/kerja selesai →
 * dilewati dan dicatat); penempatan gagal berhenti di situ dan kerja tetap di antrean.
 * Tidak menyentuh antrean global.
 */
export async function gantiOtomatis(
  n: NomorSlot,
  o: { pelepas?: string[]; dep?: DepGanti } = {},
): Promise<HasilGanti> {
  const dep = o.dep ?? depBawaan()
  const hasil: HasilGanti = { ditempatkan: null, dilewati: [], gagal: null }
  const catat = (k: Kerja, teks: string) => dep.simpan(pindahTahap(k, k.tahap, teks))
  for (let putaran = 0; putaran < 50; putaran++) {
    const semua = dep.semua()
    if (semua.some((k) => k.slot === n && k.tahap !== 'selesai')) return hasil
    const calon = pilihBerikutnya(antreanLengkap(semua, n))
    if (!calon) return hasil
    const kini = dep.kini()
    // Selesai tak perlu bertanya ke Plane.
    const status = calon.tahap === 'selesai' ? null : await dep.statusPlane(calon.key)
    const basi = cekBasi(calon, status, dep.selesaiNama)
    if (basi) {
      const { antre: _a, ...tanpa } = calon
      const k2 = pindahTahap(
        {
          ...tanpa,
          ...(calon.tahap === 'selesai'
            ? {}
            : { peringatanAntre: { at: kini, jenis: 'dilewati' as const, slot: n, alasan: basi } }),
        } as Kerja,
        calon.tahap,
        `Dilewati dari antrean slot ${n}: ${basi}`,
      )
      dep.simpan(k2)
      hasil.dilewati.push({ key: calon.key, alasan: basi })
      continue
    }
    try {
      const { kerja } = dep.tempatkan(calon.key, n, { resetDb: false })
      const dari = o.pelepas?.length ? ` setelah ${o.pelepas.join(', ')} di-push` : ''
      catat(
        kerja,
        `Giliran antrean slot ${n} tiba${dari}: ditempatkan otomatis, DB slot tidak di-reset`,
      )
      for (const p of o.pelepas ?? []) {
        const kp = dep.semua().find((x) => x.key === p)
        if (kp) catat(kp, `Slot ${n} diteruskan otomatis ke ${calon.key} (antrean slot ${n})`)
      }
      hasil.ditempatkan = calon.key
    } catch (e) {
      const alasan = (e as Error).message
      const k = dep.semua().find((x) => x.key === calon.key) ?? calon
      dep.simpan(
        pindahTahap(
          { ...k, peringatanAntre: { at: kini, jenis: 'gagal', slot: n, alasan } },
          k.tahap,
          `Penempatan otomatis ke slot ${n} gagal: ${alasan}`,
        ),
      )
      hasil.gagal = { key: calon.key, alasan }
    }
    return hasil
  }
  return hasil
}

const DIR_LOG_ANTRE = () => path.join(ROOT, 'kerja', '_antre-log')

/**
 * Jalankan pergantian slot di proses terpisah (CLI `kerja antre-mulai`): menempatkan memakai
 * spawnSync (git, migrasi) yang bisa puluhan detik, jadi tidak boleh di proses server panel.
 */
export function mulaiAntreanLatar(n: number, pelepas: string[] = []) {
  mkdirSync(DIR_LOG_ANTRE(), { recursive: true })
  const log = openSync(path.join(DIR_LOG_ANTRE(), `slot-${n}.log`), 'a')
  try {
    const args = [path.join(ROOT, 'src', 'kerja.ts'), 'antre-mulai', String(n)]
    if (pelepas.length) args.push('--pelepas', pelepas.join(','))
    spawn(process.execPath, args, {
      cwd: ROOT,
      detached: true,
      stdio: ['ignore', log, log],
    }).unref()
  } finally {
    closeSync(log)
  }
}

/** Pintu CLI `kerja antre-mulai`: kunci per slot (satu pergantian sekaligus), lalu gantiOtomatis. */
export async function jalankanAntreanSlot(
  n: NomorSlot,
  pelepas: string[] = [],
): Promise<HasilGanti> {
  mkdirSync(DIR_LOG_ANTRE(), { recursive: true })
  const kunci = path.join(DIR_LOG_ANTRE(), `slot-${n}.lock`)
  if (existsSync(kunci) && Date.now() - Number(readFileSync(kunci, 'utf8') || 0) < 10 * 60_000)
    throw new Error(`Pergantian slot ${n} sedang berjalan`)
  writeFileSync(kunci, String(Date.now()))
  try {
    return await gantiOtomatis(n, { pelepas })
  } finally {
    rmSync(kunci, { force: true })
  }
}

/** Lepas slot tanpa push (mis. tiket ditunda); worktree dan branch tetap. */
export function lepasSlotKerja(key: string): Kerja {
  const k = bacaKerja(key)
  const k2 = pindahTahap({ ...k, slot: null }, k.tahap, `Slot ${k.slot ?? '-'} dilepas`)
  simpanKerja(k2)
  return k2
}

/**
 * Keputusan review ◆B (R-9.2). Setuju: dicatat sebagai keputusan Tams dan tahap maju ke
 * Didokumentasikan (gerbang catatan akhir tetap berlaku). Minta ubah: dicatat sebagai permintaan
 * ubah ◆B. Menjalankan fase berikutnya dilakukan pemanggil (panel).
 */
export function reviewKerja(
  key: string,
  setuju: boolean,
  teks = '',
): { kerja: Kerja; mintaUbah?: number } {
  if (setuju && formatDua(bacaKerja(key))) {
    // Format 2: persetujuan menempel di Hasil (oleh Tams, waktu); tidak ada butir keputusan tambahan.
    const p = periksaCatatanKerja(key, 'akhir')
    if (!p.ok) throw new Error(`Belum bisa disetujui. ${ringkasPeriksaCatatan(p, 'akhir')}`)
    ubahLaporan(key, (l) => setujuiHasil(l, 'tams'))
    const k = bacaKerja(key)
    return {
      kerja:
        k.tahap === 'didokumentasikan'
          ? k
          : setTahap(key, 'didokumentasikan', 'Hasil disetujui Tams (◆B)'),
    }
  }
  if (setuju) {
    ubahDataCatatan(key, (d) =>
      tambahKeputusan(d, `Hasil disetujui (◆B)${teks.trim() ? `: ${teks.trim()}` : ''}`, 'tams'),
    )
    const k = bacaKerja(key)
    return {
      kerja:
        k.tahap === 'didokumentasikan'
          ? k
          : setTahap(key, 'didokumentasikan', 'Hasil disetujui Tams (◆B)'),
    }
  }
  if (!teks.trim()) throw new Error('Tulis apa yang perlu diubah')
  const k = ubahDataCatatan(key, (d) => tambahMintaUbah(d, teks, 'B'))
  return { kerja: k, mintaUbah: k.mintaUbah.at(-1)?.id }
}

/**
 * Panen catatan kerja ke docs-site fleetify-ops (R-8.3). Modul: opsi, lalu `kerja.json`, lalu
 * tebakan dari judul/tiket. Tanpa `tulis` hanya pratinjau. Saat ditulis, modul disimpan dan
 * dicatat di riwayat; commit di fleetify-ops dilakukan Tams.
 */
export function panenKerja(key: string, o: { modul?: string; tulis: boolean }) {
  const k = bacaKerja(key)
  const modul = o.modul ?? k.modul ?? tebakModul(k.judul, bacaBerkasKerja(key, 'tiket.md'))
  if (!modul)
    throw new Error(
      `Modul docs-site untuk ${key} tidak bisa ditebak: pakai --modul (${MODUL_V2.map((m) => m.slug).join(', ')})`,
    )
  const h = panen(
    {
      key,
      judul: k.judul,
      url: k.url,
      branch: k.branch,
      commit: k.commit,
      mr: k.mr,
      tahap: LABEL_TAHAP[k.tahap],
      md: formatDua(k) ? null : bacaBerkasKerja(key, 'catatan.md'),
      data: dataCatatan(k),
      verifikasi: k.verifikasi,
      ...(formatDua(k) ? { laporan: laporanLengkap(k) } : {}),
    },
    modul,
    { tulis: o.tulis, tanggal: new Date().toISOString().slice(0, 10) },
  )
  if (o.tulis) {
    const k2 = bacaKerja(key)
    simpanKerja(
      pindahTahap(
        { ...k2, modul },
        k2.tahap,
        `Dipanen ke docs-site: ${h.rel}${h.cek?.ok ? '' : ' (check-v2 GAGAL)'}`,
      ),
    )
  }
  return { ...h, modul }
}

/** Metrik semua kerja (R-9.3): lama per tahap, kerja ulang, token sesi Claude dari panel. */
export function semuaMetrik() {
  return daftarKerja().map((k) => metrikKerja(k, tokenSesi(k.sesi?.id)))
}

/**
 * Tandai kerja yang MR-nya sudah di-merge ke development (K19): commit push ada di
 * origin/development. Dipanggil Dashboard; git fetch dibatasi di sudahDiMerge.
 */
export function periksaMergeSemua(sudah: typeof sudahDiMerge = sudahDiMerge): string[] {
  const baru: string[] = []
  periksaMergeGabungan(sudah)
  for (const k of daftarKerja()) {
    if (!k.push || k.merge || k.tahap === 'selesai') continue
    if (!sudah(worktreeKerja(k), k.push.head)) continue
    const k2 = pindahTahap(
      { ...k, merge: { at: new Date().toISOString(), head: k.push.head } },
      k.tahap,
      `MR di-merge ke development (${k.push.head.slice(0, 8)}): ${adalahKerjaLokal(k) ? 'tugas Tams tinggal menandai selesai' : 'tugas Tams tinggal Plane Code Complete'}`,
    )
    simpanKerja(k2)
    baru.push(k.key)
  }
  return baru
}

// ── Gabungkan untuk MR (K20) ───────────────────────────────────────────────

const judulKerja = (key: string) => bacaKerja(key).judul

export function calonGabungKerja() {
  return calonGabung(daftarKerja(), bacaGabungan())
}

/** Mulai gabungan dari tiket terpilih (hanya calon yang sah). */
export function buatGabungan(branch: string, keys: string[]): Gabungan {
  const lama = bacaGabungan()
  if (lama && !lama.merge)
    throw new Error('Masih ada gabungan aktif; selesaikan atau batalkan dulu')
  const calon = new Map(calonGabungKerja().map((k) => [k.key, k]))
  const asing = keys.filter((k) => !calon.has(k))
  if (asing.length) throw new Error(`Bukan calon gabung: ${asing.join(', ')}`)
  const g = mulaiGabungan(
    branch,
    keys.map((k) => ({ key: k, branch: calon.get(k)?.branch as string })),
    judulKerja,
  )
  // Gabungan lama yang sudah di-merge diarsipkan, baru yang aktif menggantikannya.
  if (lama) arsipkanGabungan(lama)
  simpanGabungan(g)
  for (const t of g.tiket) {
    const k = bacaKerja(t.key)
    simpanKerja(pindahTahap(k, k.tahap, `Masuk gabungan ${branch}: ${t.status}`))
  }
  return g
}

function gabunganAktif(): Gabungan {
  const g = bacaGabungan()
  if (!g) throw new Error('Tidak ada gabungan aktif')
  return g
}

/** Lanjutkan menggabung tiket yang tersisa (mis. setelah konflik diselesaikan AI). */
export function lanjutGabungan(): Gabungan {
  const g = gabunganAktif()
  // Konflik yang diselesaikan AI: merge sudah di-commit di v2-gabung → tandai tergabung.
  const tiket = g.tiket.map((t) =>
    t.status === 'konflik' && sudahTergabung(t.branch)
      ? { ...t, status: 'tergabung' as const, konflik: undefined }
      : t.status === 'konflik'
        ? { ...t, status: 'menunggu' as const }
        : t,
  )
  const g2 = lanjutkanGabung({ ...g, tiket }, judulKerja)
  simpanGabungan(g2)
  return g2
}

const sudahTergabung = (branch: string) =>
  spawnSync('git', ['-C', WORKTREE_GABUNG(), 'merge-base', '--is-ancestor', branch, 'HEAD'])
    .status === 0

/** Keluarkan tiket dari gabungan (mis. konflik); tiketnya kembali jadi calon. */
export function keluarkanDariGabungan(key: string): Gabungan {
  const g = gabunganAktif()
  if (g.push) throw new Error('Gabungan sudah di-push; tiket tidak bisa dikeluarkan lagi')
  const t = g.tiket.find((x) => x.key === key)
  if (!t) throw new Error(`${key} tidak ada di gabungan`)
  if (t.status === 'tergabung')
    throw new Error(`${key} sudah tergabung; buat gabungan baru bila ingin mengeluarkannya`)
  const g2 = {
    ...g,
    tiket: g.tiket.map((x) =>
      x.key === key ? { ...x, status: 'dikeluarkan' as const, konflik: undefined } : x,
    ),
  }
  simpanGabungan(g2)
  return lanjutGabungan()
}

/** Batalkan gabungan yang belum di-push: worktree kembali ke development, branch gabungan dihapus. */
export function batalkanGabungan() {
  const g = gabunganAktif()
  if (g.push && !g.merge)
    throw new Error('Gabungan sudah di-push; tunggu merge atau tutup MR-nya dulu')
  const w = WORKTREE_GABUNG()
  spawnSync('git', ['-C', w, 'switch', '-q', '--detach', 'origin/development'])
  if (!g.push) spawnSync('git', ['-C', w, 'branch', '-D', g.branch])
  simpanGabungan(null)
}

/** Keadaan gabungan untuk kartu Workspace: git, syarat push, deskripsi MR, langkah berikutnya. */
export function keadaanGabungan(gerbangBerjalan = false) {
  const g = bacaGabungan()
  const calon = calonGabungKerja().map((k) => ({
    key: k.key,
    judul: k.judul,
    branch: k.branch,
    commit: k.commit.length,
    gerbangFokus: k.gerbang?.fokus?.hasil ?? null,
  }))
  if (!g)
    return {
      gabungan: null,
      calon,
      bawaan: namaGabunganBawaan(new Date().toISOString().slice(0, 10)),
    }
  const dir = WORKTREE_GABUNG()
  const git = keadaanGit(dir)
  const syarat = syaratPush({ git, gerbangCi: g.gerbangCi ?? null, gerbangBerjalan })
  const masuk = g.tiket.filter((t) => t.status === 'tergabung').map((t) => bacaKerja(t.key))
  const mr = deskripsiMr({
    tiket: masuk.map(tiketMr),
    branch: g.branch,
    commit: git.akanDipush.filter((c) => c.judul.startsWith('Merge ')),
    gerbangCi: g.gerbangCi ?? null,
  })
  return {
    gabungan: g,
    calon,
    git,
    syarat: { ...syarat, boleh: syarat.boleh && langkahGabungan(g).siapPush },
    langkah: langkahGabungan(g),
    mr,
    gerbangBerjalan,
  }
}

/** Gerbang CI pada branch gabungan (R-4.1); hasil tersimpan di gabungan. */
export async function gerbangGabungan(): Promise<Gabungan> {
  gabunganAktif() // pastikan ada gabungan sebelum gerbang berjalan
  const cap = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 13)
  const h = await jalankanGerbang({
    dir: WORKTREE_GABUNG(),
    tingkat: 'ci',
    logRel: `kerja/_gabung-log/ci-${cap}.log`,
  })
  const g2 = { ...gabunganAktif(), gerbangCi: h }
  simpanGabungan(g2)
  return g2
}

/**
 * Push branch gabungan (klik Tams, R-2.3); dicatat di gabungan dan semua tiket tergabung. Slot
 * tiket dilepas lalu antrean tiap slot yang dilepas dijalankan (K21), satu kali per slot unik.
 * `dep` hanya untuk tes: ganti git push dan pemicu antrean.
 */
export function pushGabungan(
  dep: {
    pushBranch?: typeof pushBranch
    setelahLepas?: (n: number, pelepas: string[]) => void
  } = {},
): Gabungan {
  const s = keadaanGabungan()
  if (!s.gabungan || !('syarat' in s) || !s.syarat?.boleh)
    throw new Error(
      `Push ditolak: ${'syarat' in s ? s.syarat?.alasan.join('; ') || s.langkah?.alasan : 'tidak ada gabungan'}`,
    )
  const g = s.gabungan
  const r = (dep.pushBranch ?? pushBranch)(WORKTREE_GABUNG(), g.branch, !!s.git?.upstream)
  if (!r.ok) throw new Error(`git push gagal: ${r.keluaran.split('\n').slice(-3).join(' ')}`)
  const at = new Date().toISOString()
  const head = s.git?.head as string
  const g2 = { ...g, push: { at, head, jumlah: s.git?.akanDipush.length ?? 0 } }
  simpanGabungan(g2)
  const lepas = new Map<number, string[]>()
  for (const t of g.tiket.filter((x) => x.status === 'tergabung')) {
    const k = bacaKerja(t.key)
    if (k.slot && (NOMOR_SLOT as readonly number[]).includes(k.slot))
      lepas.set(k.slot, [...(lepas.get(k.slot) ?? []), k.key])
    simpanKerja(
      pindahTahap(
        {
          ...k,
          push: {
            at,
            branch: g.branch,
            head,
            remote: s.git?.remote ?? null,
            jumlah: g2.push.jumlah,
          },
          slot: null,
        },
        k.tahap,
        `Di-push lewat gabungan ${g.branch} (${head.slice(0, 8)})`,
      ),
    )
  }
  for (const [n, pelepas] of lepas) (dep.setelahLepas ?? mulaiAntreanLatar)(n, pelepas)
  return g2
}

/**
 * Deteksi merge gabungan (K19/K20): bila head yang di-push sudah ada di origin/development,
 * gabungan ditandai merge. Tiap tiket di dalamnya lalu dicatat oleh deteksi merge per kerja
 * (push.head mereka sama dengan head gabungan).
 */
export function periksaMergeGabungan(sudah: typeof sudahDiMerge = sudahDiMerge): boolean {
  const g = bacaGabungan()
  if (!g?.push || g.merge) return false
  if (!sudah(WORKTREE_GABUNG(), g.push.head)) return false
  simpanGabungan({ ...g, merge: { at: new Date().toISOString(), head: g.push.head } })
  return true
}

/** Link MR gabungan (ditempel Tams) disalin ke semua tiket tergabung. */
export function simpanLinkMrGabungan(url: string): Gabungan {
  const g = gabunganAktif()
  const u = url.trim()
  if (u && !/^https:\/\/\S+$/.test(u)) throw new Error('Link MR harus diawali https://')
  const g2 = { ...g, mr: u || undefined }
  simpanGabungan(g2)
  for (const t of g.tiket.filter((x) => x.status === 'tergabung'))
    simpanKerja({ ...bacaKerja(t.key), mr: u || undefined })
  return g2
}

/** Minta AI menyelesaikan konflik tiket di v2-gabung (sesi tiket itu, worktree gabungan). */
export async function selesaikanKonflikAI(key: string, port: number) {
  const g = gabunganAktif()
  const t = g.tiket.find((x) => x.key === key && x.status === 'konflik')
  if (!t) throw new Error(`${key} tidak sedang konflik`)
  const teks = `Selesaikan konflik penggabungan di worktree ${WORKTREE_GABUNG()} (branch ${g.branch}): jalankan "git -C ${WORKTREE_GABUNG()} merge --no-ff -m 'Merge ${t.branch} (${key}: ${judulKerja(key)})' ${t.branch}", selesaikan konflik di ${t.konflik?.join(', ')} dengan mempertahankan maksud kedua sisi, jalankan tes terkait, lalu commit merge-nya. Jangan push. Setelah selesai, Tams menekan "Lanjutkan gabung" di Workspace.`
  return jalankanFase(key, 'lanjut', 'terminal', { teks, port, worktree: WORKTREE_GABUNG() })
}

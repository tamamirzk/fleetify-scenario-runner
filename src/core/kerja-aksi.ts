// Aksi Kerja yang dipakai CLI (bun run kerja) dan panel: ambil dari Plane, target, potret, cek, catat,
// tulis ke Plane. Menulis ke Plane terlihat tim: pemanggil wajib sudah mendapat konfirmasi pengguna.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  type DataCatatan,
  periksaCatatan,
  ringkasPeriksaCatatan,
  tambahKeputusan,
  tambahMintaUbah,
  templatCatatan,
} from './catatan.ts'
import { config, ROOT } from './config.ts'
import { type HasilGerbang, jalankanGerbang } from './gerbang.ts'
import {
  adaKerja,
  bacaBerkasKerja,
  bacaKerja,
  daftarKerja,
  dataCatatan,
  dirKerja,
  type Fase,
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
import { metrikKerja, tokenSesi } from './metrik.ts'
import { MODUL_V2, panen, tebakModul } from './panen.ts'
import { ambilTiket, komentarTiket, pindahStatusTiket } from './plane.ts'
import { potret } from './potret.ts'
import { deskripsiMr, keadaanGit, pushBranch, syaratPush } from './serah.ts'
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
  semuaSlot,
  siapkanSlotBaru,
} from './slot.ts'

export async function ambilKerja(key: string): Promise<Kerja> {
  const t = await ambilTiket(key)
  const { kerja, tiketMd } = kerjaDariTiket(t, adaKerja(key) ? bacaKerja(key) : null)
  simpanKerja(kerja)
  writeFileSync(path.join(dirKerja(key), 'tiket.md'), tiketMd)
  // Kerangka catatan: hanya bagian tulisan; bagian data dirender dari kerja.json (R-8.1).
  if (bacaBerkasKerja(key, 'catatan.md') === null)
    writeFileSync(path.join(dirKerja(key), 'catatan.md'), templatCatatan(key))
  return kerja
}

/** Gerbang catatan sebuah kerja: brief (akhir Pahami) atau akhir (sebelum Didokumentasikan). */
export function periksaCatatanKerja(key: string, saat: 'brief' | 'akhir') {
  const k = bacaKerja(key)
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
  o: { teks?: string; port: number; model?: string },
): Promise<{ kerja: Kerja; cara: string }> {
  const k = bacaKerja(key)
  const worktree = worktreeKerja(k)
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
  const syarat = syaratPush({ git, gerbangCi: k.gerbang?.ci ?? null, gerbangBerjalan })
  const tiket = klasterKerja(k).map((x) => ({
    key: x.key,
    judul: x.judul,
    url: x.url,
    md: bacaBerkasKerja(x.key, 'catatan.md'),
    data: dataCatatan(x),
    verifikasi: x.verifikasi,
  }))
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
    klaster: tiket.map((t) => t.key),
  }
}

/**
 * Push dari panel (R-2.3, R-4.2): syarat diperiksa ulang di server, push biasa ke origin, lalu
 * dicatat di semua tiket se-klaster. Hanya dipanggil dari endpoint panel setelah klik Tams.
 */
export function pushKerja(key: string): Kerja {
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
  for (const x of klasterKerja(bacaKerja(key)))
    simpanKerja(
      pindahTahap(
        { ...bacaKerja(x.key), push: catat, slot: null },
        bacaKerja(x.key).tahap,
        `Di-push ke ${branch} (${catat.jumlah} commit, ${s.git.head.slice(0, 8)}) dari panel`,
      ),
    )
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
export function tempatkanDiSlot(key: string, n: NomorSlot): { kerja: Kerja; langkah: string[] } {
  const k = bacaKerja(key)
  if (k.slot) throw new Error(`${key} sudah di slot ${k.slot}`)
  const pil = pilihanSlotKerja().find((p) => p.n === n)
  if (!pil || pil.keadaan === 'tidak-siap') throw new Error(`Slot ${n} belum siap`)
  const s = defSlot(n)
  let langkah: string[]
  let ubah: Partial<Kerja>
  if (pil.keadaan === 'kosong') {
    const branch = k.branch ?? branchBaru(key)
    langkah = [`branch ${branch}`, 'DB slot di-reset dari template', ...siapkanSlotBaru(s, branch)]
    ubah = { slot: n, worktree: s.worktree, branch, klaster: undefined }
  } else {
    const induk = pil.pemakai[0] as PemakaiSlot
    langkah = [`gabung klaster ${induk.key} (branch ${induk.branch ?? '-'})`]
    ubah = { slot: n, worktree: s.worktree, branch: induk.branch, klaster: induk.key }
  }
  const { antre: _a, ...tanpaAntre } = bacaKerja(key)
  const k2 = pindahTahap(
    { ...tanpaAntre, ...ubah } as Kerja,
    k.tahap,
    `Ditempatkan di slot ${n}: ${langkah[0]}`,
  )
  simpanKerja(k2)
  return { kerja: k2, langkah }
}

/** Masukkan tiket ke Antre (menunggu slot kosong). */
export function antrekanKerja(key: string): Kerja {
  const k = bacaKerja(key)
  if (k.slot) throw new Error(`${key} sedang memegang slot ${k.slot}`)
  const k2 = pindahTahap(
    { ...k, antre: { at: new Date().toISOString() } },
    k.tahap,
    'Masuk antrean slot',
  )
  simpanKerja(k2)
  return k2
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
      md: bacaBerkasKerja(key, 'catatan.md'),
      data: dataCatatan(k),
      verifikasi: k.verifikasi,
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

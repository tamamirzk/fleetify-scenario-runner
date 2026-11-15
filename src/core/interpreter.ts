// Penerjemah aksi skenario JSON. Bergantung pada antarmuka Layar (bukan Playwright langsung),
// sehingga bisa diuji dengan layar palsu. Implementasi Playwright: core/layar.ts.
import { argumenAksi, PUSTAKA } from '../pustaka/index.ts'
import type { PersonaId } from './personas.ts'
import { personaName } from './personas.ts'
import { DataBelumAda, isiPlaceholder, isiSebisanya, pola, polaRegex } from './placeholder.ts'
import { uraiSasaran } from './sasaran.ts'
import { type Aksi, type Cek, jenisAksi, type Sasaran } from './skema.ts'

export const TAHAN_KLIK = 3000
export const TAHAN_BANNER = 4000
export const BATAS_TUNGGU = 15_000
export const BATAS_SIMPAN = 10_000

export type Pola = string | RegExp

export interface Layar {
  buka(route: string): Promise<void>
  banner(teks: string, ms: number): Promise<void>
  tahan(ms: number): Promise<void>
  /** false bila opsional dan sasaran tidak ada. */
  klik(s: Sasaran, o: { tahan: number; opsional: boolean }): Promise<boolean>
  /** Klik dan kembalikan isi JSON respons pertama yang URL-nya cocok. */
  klikTangkap(s: Sasaran, tahan: number, url: RegExp, metode?: string): Promise<unknown>
  isi(s: Sasaran, nilai: string, o: { tahan: number; opsional: boolean }): Promise<boolean>
  pilih(s: Sasaran, opsi: Pola, tahan?: number): Promise<void>
  cari(s: Sasaran, ketik: string, opsi: Pola): Promise<void>
  tunggu(s: Sasaran, o: { hilang: boolean; batas: number }): Promise<void>
  tungguUrl(p: RegExp, batas: number): Promise<void>
  gulir(s: Sasaran, opsional: boolean): Promise<boolean>
  terlihat(s: Sasaran, batas: number): Promise<boolean>
  hilang(s: Sasaran, batas: number): Promise<boolean>
  nonaktif(s: Sasaran): Promise<boolean>
  url(): string
  teksHalaman(): Promise<string>
  screenshot(nama: string): Promise<string | null>
  sebagai(who: PersonaId): Promise<void>
  /** Teks elemen yang terlihat (cek `nilai`); null bila tidak ditemukan dalam batas. */
  teksElemen?(s: Sasaran, batas: number): Promise<string | null>
}

/** Catatan satu pemeriksaan UI dari aksi pastikan* atau field cek. */
export interface CatatanCek {
  /** id dari field `cek` skenario (mis. "5.2"); kosong = nomor otomatis. */
  id?: string
  jenis: 'terlihat' | 'tidak_terlihat' | 'nonaktif' | 'nilai'
  judul: string
  diharapkan: string
  terlihat: string
  lulus: boolean
  sasaran?: Sasaran
  lunak?: boolean
}

export interface Lingkungan {
  /** Tidak ada untuk siapkan, capai, dan bersihkan (tanpa jendela). */
  layar?: Layar
  data: Record<string, unknown>
  /** Jalankan aksi pustaka; argumen sudah terisi placeholder. `simpan` = kunci data tujuan hasil. */
  pustaka(nama: string, args: Record<string, unknown>, simpan?: string): Promise<unknown>
  catat(teks: string): void
  log(teks: string): void
  /** Catat hasil pemeriksaan UI (hanya saat ada layar). */
  cek?(c: CatatanCek): Promise<void>
}

const kutip = (t: string) => `“${t.length > 90 ? `${t.slice(0, 87)}…` : t}”`
const tampilPola = (t: string) => t.replace(/^\/\^?(.*?)\$?\/[a-z]*$/, '$1')

/** Uraian satu aksi untuk panel ("Aksi di langkah ini", callout jeda). */
export function uraiAksi(aksi: Aksi, data: Record<string, unknown> = {}): string {
  const a = aksi as Record<string, unknown>
  const s = (k: string) => a[k] as Sasaran
  const t = (v: unknown) => isiSebisanya(String(v), data)
  const sas = (k: string) => t(uraiSasaran(s(k)))
  switch (jenisAksi(aksi)) {
    case 'buka':
      return `Buka ${uraiRute(String(a.buka), data)}`
    case 'banner':
      return `Keterangan ${kutip(t(a.banner))}`
    case 'tahan':
      return `Tahan ${(Number(a.tahan) / 1000).toLocaleString('id-ID')} dtk`
    case 'klik':
      return `Klik ${sas('klik')}`
    case 'isi':
      return a.nilai === '' ? `Kosongkan ${sas('isi')}` : `Isi ${sas('isi')}: ${kutip(t(a.nilai))}`
    case 'pilih':
      return `Pilih ${kutip(tampilPola(t(a.opsi)))} di ${sas('pilih')}`
    case 'cari':
      return `Cari ${kutip(t(a.ketik))} di ${sas('cari')}`
    case 'tunggu':
      return a.hilang ? `Tunggu ${sas('tunggu')} tertutup` : `Tunggu ${sas('tunggu')}`
    case 'tungguUrl':
      return 'Tunggu halaman berpindah'
    case 'gulir':
      return `Gulir ke ${sas('gulir')}`
    case 'pastikanTerlihat': {
      const v = a.pastikanTerlihat
      return `Periksa ${typeof v === 'string' ? kutip(tampilPola(t(v))) : t(uraiSasaran(v as Sasaran))} terlihat`
    }
    case 'pastikanTidakTerlihat': {
      const v = a.pastikanTidakTerlihat
      return `Periksa ${typeof v === 'string' ? kutip(tampilPola(t(v))) : t(uraiSasaran(v as Sasaran))} tidak terlihat`
    }
    case 'pastikanNonaktif':
      return `Periksa ${sas('pastikanNonaktif')} nonaktif`
    case 'sebagai':
      return `Ganti akun ke ${personaName(String(a.sebagai))}`
    case 'screenshot':
      return 'Ambil screenshot'
    case 'simpan':
      return `Catat ${String(a.simpan).replaceAll('_', ' ')} dari ${a.dariUrl ? 'alamat' : 'halaman'}`
    case 'dokumen':
      return `Catat dokumen ${(a.dokumen as { label: string }).label}`
    default: {
      const k = jenisAksi(aksi)
      const nama = String(a[k])
      const p = PUSTAKA[nama]
      if (!p?.urai) return nama
      try {
        // biome-ignore lint/suspicious/noExplicitAny: argumen sudah divalidasi skema pustaka
        return t(p.urai(p.argumen.parse(isiPlaceholder(argumenAksi(a, k), data)) as any))
      } catch {
        // Placeholder belum terisi (langkah belum jalan): pakai argumen mentah.
        // biome-ignore lint/suspicious/noExplicitAny: hanya untuk teks tampilan
        return t(p.urai(argumenAksi(a, k) as any))
      }
    }
  }
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi

/** Rute untuk tampilan: {mr.id} menjadi nomor dokumennya bila ada, UUID dipendekkan. */
function uraiRute(rute: string, data: Record<string, unknown>): string {
  const m = rute.match(/\{([a-zA-Z_]\w*)\.id\}/)
  const obj = m?.[1] ? (data[m[1]] as Record<string, unknown> | undefined) : undefined
  const nomor = obj?.nomor ?? obj?.sku
  if (nomor) return String(nomor)
  return isiSebisanya(rute, data).replace(UUID, (u) => `${u.slice(0, 8)}…`)
}

function perluLayar(env: Lingkungan, jenis: string): Layar {
  if (!env.layar)
    throw new Error(`Aksi "${jenis}" butuh jendela; tidak boleh di siapkan/capai/bersihkan`)
  return env.layar
}

function cocok(teks: string, re: RegExp): string | null {
  const m = teks.match(re)
  return m ? (m[1] ?? m[0]) : null
}

function ambilJalur(obj: unknown, jalur: string): unknown {
  return jalur
    .split('.')
    .reduce<unknown>(
      (o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined),
      obj,
    )
}

/** Jalankan satu aksi. Placeholder diisi dari env.data tepat sebelum aksi berjalan. */
export async function jalankanAksi(aksi: Aksi, env: Lingkungan): Promise<void> {
  const jenis = jenisAksi(aksi)
  let a: Record<string, unknown>
  try {
    a = isiPlaceholder(aksi as Record<string, unknown>, env.data)
  } catch (e) {
    if (e instanceof DataBelumAda)
      throw new Error(
        `${e.message}: aksi "${jenis}" merujuk data yang belum disimpan langkah sebelumnya`,
      )
    throw e
  }
  const sas = (k: string) => a[k] as Sasaran
  const tahan = (def: number) => (typeof a.tahan === 'number' ? a.tahan : def)
  switch (jenis) {
    case 'buka':
      return perluLayar(env, jenis).buka(String(a.buka))
    case 'banner':
      return perluLayar(env, jenis).banner(String(a.banner), tahan(TAHAN_BANNER))
    case 'tahan':
      return perluLayar(env, jenis).tahan(Number(a.tahan))
    case 'klik': {
      const layar = perluLayar(env, jenis)
      const tangkap = a.tangkap as
        | { url: string; metode?: string; simpan: Record<string, string> }
        | undefined
      if (tangkap) {
        const body = await layar.klikTangkap(
          sas('klik'),
          tahan(TAHAN_KLIK),
          polaRegex(tangkap.url),
          tangkap.metode,
        )
        for (const [k, jalur] of Object.entries(tangkap.simpan)) {
          const v = ambilJalur(body, jalur)
          if (v === undefined) throw new Error(`Respons tidak memuat "${jalur}" untuk ${k}`)
          env.data[k] = v
        }
        return
      }
      const done = await layar.klik(sas('klik'), {
        tahan: tahan(TAHAN_KLIK),
        opsional: !!a.opsional,
      })
      if (!done) env.log(`(dilewati, tidak ada) ${uraiAksi(aksi, env.data)}`)
      return
    }
    case 'isi': {
      const done = await perluLayar(env, jenis).isi(sas('isi'), String(a.nilai), {
        tahan: tahan(TAHAN_KLIK),
        opsional: !!a.opsional,
      })
      if (!done) env.log(`(dilewati, tidak bisa diisi) ${uraiAksi(aksi, env.data)}`)
      return
    }
    case 'pilih':
      return perluLayar(env, jenis).pilih(
        sas('pilih'),
        pola(String(a.opsi)),
        a.tahan as number | undefined,
      )
    case 'cari':
      return perluLayar(env, jenis).cari(sas('cari'), String(a.ketik), pola(String(a.opsi)))
    case 'tunggu': {
      const p = perluLayar(env, jenis).tunggu(sas('tunggu'), {
        hilang: !!a.hilang,
        batas: (a.batas as number | undefined) ?? BATAS_TUNGGU,
      })
      if (a.opsional) await p.catch(() => env.log(`(dilewati) ${uraiAksi(aksi, env.data)}`))
      else await p
      return
    }
    case 'tungguUrl': {
      const p = perluLayar(env, jenis).tungguUrl(
        polaRegex(String(a.tungguUrl)),
        (a.batas as number | undefined) ?? BATAS_TUNGGU,
      )
      if (a.opsional) await p.catch(() => env.log('(dilewati) halaman tidak berpindah'))
      else await p
      return
    }
    case 'gulir': {
      const done = await perluLayar(env, jenis).gulir(sas('gulir'), !!a.opsional)
      if (!done) env.log(`(dilewati, tidak ada) ${uraiAksi(aksi, env.data)}`)
      return
    }
    case 'pastikanTerlihat':
    case 'pastikanTidakTerlihat': {
      const layar = perluLayar(env, jenis)
      const v = a[jenis]
      const s: Sasaran = typeof v === 'string' ? { teks: v } : (v as Sasaran)
      const terlihat = jenis === 'pastikanTerlihat'
      const batas = (a.batas as number | undefined) ?? BATAS_TUNGGU
      const ok = terlihat ? await layar.terlihat(s, batas) : await layar.hilang(s, 3000)
      await env.cek?.({
        jenis: terlihat ? 'terlihat' : 'tidak_terlihat',
        judul: uraiAksi(aksi, env.data),
        diharapkan: `${uraiSasaran(s)} ${terlihat ? 'terlihat' : 'tidak terlihat'}`,
        terlihat: ok
          ? terlihat
            ? 'terlihat'
            : 'tidak terlihat'
          : terlihat
            ? `tidak ditemukan dalam ${batas / 1000} dtk`
            : 'masih terlihat sesudah 3 dtk',
        lulus: ok,
        sasaran: s,
        lunak: !!a.lunak,
      })
      if (!ok) gagal(env, a, `${uraiAksi(aksi, env.data)}: tidak terpenuhi`)
      return
    }
    case 'pastikanNonaktif': {
      const s = sas('pastikanNonaktif')
      const ok = await perluLayar(env, jenis).nonaktif(s)
      await env.cek?.({
        jenis: 'nonaktif',
        judul: uraiAksi(aksi, env.data),
        diharapkan: `${uraiSasaran(s)} nonaktif`,
        terlihat: ok ? 'nonaktif' : 'masih aktif',
        lulus: ok,
        sasaran: s,
        lunak: !!a.lunak,
      })
      if (!ok) gagal(env, a, `${uraiAksi(aksi, env.data)}: masih aktif`)
      return
    }
    case 'sebagai':
      return perluLayar(env, jenis).sebagai(a.sebagai as PersonaId)
    case 'screenshot':
      await perluLayar(env, jenis).screenshot(String(a.screenshot))
      return
    case 'simpan': {
      const layar = perluLayar(env, jenis)
      const re = polaRegex(String(a.dariUrl ?? a.dariTeks))
      // Halaman bisa masih memuat: coba ulang sampai batas.
      const akhir = Date.now() + ((a.batas as number | undefined) ?? BATAS_SIMPAN)
      let v: string | null = null
      for (;;) {
        v = cocok(a.dariUrl ? layar.url() : await layar.teksHalaman(), re)
        if (v !== null || Date.now() >= akhir) break
        await new Promise((r) => setTimeout(r, 300))
      }
      if (v === null)
        throw new Error(
          `${String(a.simpan)} tidak terbaca dari ${a.dariUrl ? `alamat ${layar.url()}` : 'halaman'}`,
        )
      env.data[String(a.simpan)] = v
      return
    }
    case 'dokumen': {
      const docs = (env.data.docs as unknown[] | undefined) ?? []
      env.data.docs = [...docs, a.dokumen]
      return
    }
    default: {
      const nama = String(a[jenis])
      const p = PUSTAKA[nama]
      if (!p) throw new Error(`Aksi pustaka "${nama}" tidak ada`)
      if (p.jenis === 'layar') perluLayar(env, `layar: ${nama}`)
      const simpan = typeof a.simpan === 'string' ? a.simpan : undefined
      const hasil = await env.pustaka(nama, argumenAksi(a, jenis), simpan)
      if (simpan) env.data[simpan] = hasil
    }
  }
}

function gagal(env: Lingkungan, a: Record<string, unknown>, pesan: string) {
  if (a.lunak) env.catat(pesan)
  else throw new Error(pesan)
}

const normal = (t: string) => t.replaceAll(/\s+/g, ' ').trim().toLowerCase()

/** Cocokkan teks elemen dengan `diharapkan`: pola "/regex/flags", atau sama persis tanpa beda huruf/spasi. */
export function cocokNilai(teks: string, diharapkan: string): boolean {
  const re = /^\/(.*)\/([a-z]*)$/s.exec(diharapkan)
  if (re) return new RegExp(re[1] ?? '', re[2]).test(teks)
  return normal(teks) === normal(diharapkan)
}

/**
 * Jalankan field `cek` satu langkah (placeholder sudah diisi): semua cek dinilai dan dicatat dulu,
 * baru melempar bila ada yang gagal dan tidak lunak — supaya laporan memuat semua hasil langkah itu.
 */
export async function jalankanCek(daftar: readonly Cek[], env: Lingkungan): Promise<void> {
  const layar = perluLayar(env, 'cek')
  const gagalKeras: string[] = []
  for (const mentah of daftar) {
    const c = isiPlaceholder(mentah as Record<string, unknown>, env.data) as Cek
    let catatan: CatatanCek
    if (c.nilai) {
      const batas = c.batas ?? 5000
      const teks = layar.teksElemen ? await layar.teksElemen(c.nilai, batas) : null
      const diharapkan = String(c.diharapkan)
      catatan = {
        id: c.id,
        jenis: 'nilai',
        judul: c.judul ?? `Nilai ${uraiSasaran(c.nilai)}`,
        diharapkan,
        terlihat: teks === null ? `tidak ditemukan dalam ${batas / 1000} dtk` : teks.trim(),
        lulus: teks !== null && cocokNilai(teks, diharapkan),
        sasaran: c.nilai,
        lunak: !!c.lunak,
      }
    } else {
      const terlihat = c.terlihat !== undefined
      const v = (terlihat ? c.terlihat : c.tidakTerlihat) as string | Sasaran
      const s: Sasaran = typeof v === 'string' ? { teks: v } : v
      const batas = c.batas ?? (terlihat ? 5000 : 3000)
      const ok = terlihat ? await layar.terlihat(s, batas) : await layar.hilang(s, batas)
      catatan = {
        id: c.id,
        jenis: terlihat ? 'terlihat' : 'tidak_terlihat',
        judul: c.judul ?? `${uraiSasaran(s)} ${terlihat ? 'terlihat' : 'tidak terlihat'}`,
        diharapkan: `${uraiSasaran(s)} ${terlihat ? 'terlihat' : 'tidak terlihat'}`,
        terlihat: ok
          ? terlihat
            ? 'terlihat'
            : 'tidak terlihat'
          : terlihat
            ? `tidak ditemukan dalam ${batas / 1000} dtk`
            : `masih terlihat sesudah ${batas / 1000} dtk`,
        lulus: ok,
        sasaran: s,
        lunak: !!c.lunak,
      }
    }
    await env.cek?.(catatan)
    if (!catatan.lulus) {
      if (catatan.lunak)
        env.catat(`Cek lunak tidak terpenuhi: ${catatan.judul} (terlihat: ${catatan.terlihat})`)
      else
        gagalKeras.push(
          `${catatan.judul}: diharapkan ${catatan.diharapkan}, terlihat ${catatan.terlihat}`,
        )
    }
  }
  if (gagalKeras.length) throw new Error(`cek UI gagal — ${gagalKeras.join('; ')}`)
}

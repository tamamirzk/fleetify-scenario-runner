// Data halaman Dasbor operasional: tugas Plane, kerja per tahap, jalan skenario, cakupan skenario,
// temuan, dan aktivitas terbaru. Fungsi murni atas data yang sudah dibaca (diuji Vitest).
import { type Kerja, LABEL_TAHAP, ringkasCek, TAHAP, type Tahap } from './kerja.ts'

export interface JalanRingkas {
  run_id: string
  scenario: string
  title?: string | null
  status: string
  started_at?: string | null
}
export interface TugasRingkas {
  key: string
  status: string
  grup: string
  selesai: boolean
  skenario: unknown[]
}
export interface SkenarioRingkas {
  slug: string
  task: string
  valid: boolean
  status: string
}

const HARI = 86_400_000
const dua = (n: number) => String(n).padStart(2, '0')
/** Tanggal lokal YYYY-MM-DD (bukan UTC: jalan pukul 06.00 WIB tetap hari itu). */
export const tglLokal = (d: Date) =>
  `${d.getFullYear()}-${dua(d.getMonth() + 1)}-${dua(d.getDate())}`
/** Jalan yang belum pernah diputar tidak dihitung sebagai jalan. */
const BELUM_DIPUTAR = new Set(['idle', 'siap', 'menyiapkan'])
export const MINGGU_HEATMAP = 24

/** Temuan dari docs/TEMUAN.md: tiap "## waktu · [jenis ·] judul". */
export function bacaTemuan(md: string) {
  const out: { at: string; jenis: string; judul: string }[] = []
  for (const baris of md.split('\n')) {
    const m = baris.match(/^## (\d{4}-\d{2}-\d{2} \d{2}:\d{2}) · (.+)$/)
    if (!m) continue
    const bagian = (m[2] ?? '').split(' · ')
    const jenis =
      bagian.length > 1 && /^(Bug aplikasi|Skenario salah|Catatan)$/.test(bagian[0] ?? '')
        ? (bagian.shift() as string)
        : 'Catatan'
    out.push({ at: m[1] as string, jenis, judul: bagian.join(' · ') })
  }
  return out.reverse()
}

export interface HariJalan {
  tanggal: string
  n: number
  lulus: number
  gagal: number
  lain: number
  /** Hari setelah hari ini (tidak digambar). */
  nanti: boolean
  hariIni: boolean
}

/** 24 minggu × 7 hari berakhir di minggu berjalan, Senin pertama. */
export function harianJalan(
  jalan: JalanRingkas[],
  now: Date,
  minggu = MINGGU_HEATMAP,
): HariJalan[] {
  const per = new Map<string, JalanRingkas[]>()
  for (const r of jalan) {
    const k = tglLokal(new Date(r.started_at as string))
    per.set(k, [...(per.get(k) ?? []), r])
  }
  const hariIni = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const senin = new Date(hariIni)
  senin.setDate(senin.getDate() - ((hariIni.getDay() + 6) % 7) - (minggu - 1) * 7)
  return Array.from({ length: minggu * 7 }, (_, i) => {
    const d = new Date(senin.getFullYear(), senin.getMonth(), senin.getDate() + i)
    const k = tglLokal(d)
    const rs = per.get(k) ?? []
    const lulus = rs.filter((r) => r.status === 'selesai').length
    const gagal = rs.filter((r) => r.status === 'gagal').length
    return {
      tanggal: k,
      n: rs.length,
      lulus,
      gagal,
      lain: rs.length - lulus - gagal,
      nanti: d.getTime() > hariIni.getTime(),
      hariIni: d.getTime() === hariIni.getTime(),
    }
  })
}

/** Angka di bawah heatmap: total, % lulus, rentetan sekarang/terpanjang, hari (Senin–Minggu) tersibuk. */
export function ringkasHarian(harian: HariJalan[]) {
  const lewat = harian.filter((h) => !h.nanti)
  const total = lewat.reduce((a, h) => a + h.n, 0)
  const lulus = lewat.reduce((a, h) => a + h.lulus, 0)
  let rentetan = 0
  for (let i = lewat.length - 1; i >= 0 && (lewat[i]?.n ?? 0) > 0; i--) rentetan++
  let terpanjang = 0
  let kini = 0
  for (const h of lewat) {
    kini = h.n ? kini + 1 : 0
    terpanjang = Math.max(terpanjang, kini)
  }
  const perHari = [0, 0, 0, 0, 0, 0, 0]
  harian.forEach((h, i) => {
    perHari[i % 7] = (perHari[i % 7] ?? 0) + h.n
  })
  const maks = Math.max(...perHari)
  return {
    total,
    lulus,
    persenLulus: total ? Math.round((lulus / total) * 100) : 0,
    rentetan,
    terpanjang,
    tersibuk: total ? { hari: perHari.indexOf(maks), n: maks } : null,
  }
}

export function susunDasbor(o: {
  sekarang?: Date
  tugas: TugasRingkas[] | null
  tugasGalat?: string | null
  kerja: Kerja[]
  jalan: JalanRingkas[]
  skenario: SkenarioRingkas[]
  modul: { id: string; nama: string }[]
  temuan: { at: string; jenis: string; judul: string }[]
  /** Ada kerja/<KEY>/catatan.md. */
  adaCatatan?: (key: string) => boolean
  /** "FMS-87 sebelum" saat potret sedang berjalan. */
  memotret?: string | null
}) {
  const now = o.sekarang ?? new Date()
  // Tugas Plane (null = Plane tidak tersambung/gagal).
  const terbuka = o.tugas?.filter((t) => !t.selesai) ?? null
  const perStatus = new Map<string, number>()
  for (const t of terbuka ?? []) perStatus.set(t.status, (perStatus.get(t.status) ?? 0) + 1)
  const tugas = terbuka
    ? {
        terbuka: terbuka.length,
        punyaSkenario: terbuka.filter((t) => t.skenario.length).length,
        perStatus: [...perStatus].map(([status, n]) => ({ status, n })),
      }
    : null

  // Kerja per tahap; aktif = belum selesai, terakhir diperbarui dulu.
  const perTahap = TAHAP.map((t) => ({
    tahap: t,
    label: LABEL_TAHAP[t],
    n: o.kerja.filter((k) => k.tahap === t).length,
  }))
  const aktif = o.kerja
    .filter((k) => k.tahap !== 'selesai')
    .sort((a, b) => b.diperbarui_at.localeCompare(a.diperbarui_at))
    .map((k) => {
      const potret = k.potret.sesudah ?? k.potret.sebelum
      const masuk = [...k.riwayat].reverse().find((r) => r.tahap === k.tahap)
      return {
        key: k.key,
        judul: k.judul,
        statusPlane: k.plane.status,
        tahap: k.tahap as Tahap,
        tahapNo: TAHAP.indexOf(k.tahap) + 1,
        label: LABEL_TAHAP[k.tahap],
        diambil_at: k.diambil_at,
        diperbarui_at: k.diperbarui_at,
        sejak: masuk?.at ?? k.diperbarui_at,
        layar: k.target.layar.length,
        query: k.target.db.length,
        queryGagal: (potret?.db ?? []).filter((q) => q.galat).map((q) => q.nama),
        verifikasi: ringkasCek(k.verifikasi ?? []),
        // Tiket yang dikerjakan AI (pernah di tahap Dikerjakan atau punya rujukan kode).
        pakaiKode:
          !!k.branch || k.commit.length > 0 || k.riwayat.some((r) => r.tahap === 'dikerjakan'),
        branch: k.branch,
        commit: k.commit.length,
        sebelum: !!k.potret.sebelum,
        sesudah: !!k.potret.sesudah,
        catatan: o.adaCatatan?.(k.key) ?? false,
        skenario: k.skenario.length,
        komentar: !!k.plane.komentar_at,
        memotret: o.memotret?.split(' ')[0] === k.key ? (o.memotret.split(' ')[1] ?? '') : null,
      }
    })

  // Jalan yang sungguh diputar: 7 hari terakhir dan harian 24 minggu.
  const jalan = o.jalan.filter((r) => r.started_at && !BELUM_DIPUTAR.has(r.status))
  const sejak7 = now.getTime() - 7 * HARI
  const j7 = jalan
    .filter((r) => new Date(r.started_at as string).getTime() >= sejak7)
    .sort((a, b) => (a.started_at as string).localeCompare(b.started_at as string))
  const hitung = (rs: JalanRingkas[], s: string) => rs.filter((r) => r.status === s).length
  const harian = harianJalan(jalan, now)

  // Skenario per grup.
  const perGrup = o.modul
    .map((m) => {
      const fs = o.skenario.filter((s) => s.task === m.id)
      return {
        id: m.id,
        nama: m.nama,
        total: fs.length,
        gagal: fs.filter((s) => s.status === 'ada_kegagalan').length,
      }
    })
    .filter((g) => g.total)

  // Aktivitas: riwayat kerja + jalan, terbaru dulu.
  const aktivitas = [
    ...o.kerja.flatMap((k) =>
      k.riwayat.map((r) => ({
        at: r.at,
        jenis: 'kerja' as const,
        key: k.key,
        teks: r.catatan || LABEL_TAHAP[r.tahap],
      })),
    ),
    ...jalan.map((r) => ({
      at: r.started_at as string,
      jenis: 'jalan' as const,
      key: r.run_id,
      teks: `${r.title ?? r.scenario} · ${r.status}`,
    })),
  ]
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 12)

  return {
    tugas,
    tugasGalat: o.tugasGalat ?? null,
    kerja: { total: o.kerja.length, perTahap, aktif },
    jalan: {
      tujuhHari: {
        total: j7.length,
        lulus: hitung(j7, 'selesai'),
        gagal: hitung(j7, 'gagal'),
        lain: j7.length - hitung(j7, 'selesai') - hitung(j7, 'gagal'),
        urut: j7.map((r) =>
          r.status === 'selesai' ? 'lulus' : r.status === 'gagal' ? 'gagal' : 'lain',
        ),
      },
      harian,
      ringkas: ringkasHarian(harian),
      terakhir: jalan.slice(0, 6),
    },
    skenario: {
      total: o.skenario.length,
      valid: o.skenario.filter((s) => s.valid).length,
      perGrup,
    },
    temuan: {
      total: o.temuan.length,
      bug: o.temuan.filter((t) => t.jenis === 'Bug aplikasi').length,
      terbaru: o.temuan.slice(0, 5),
    },
    aktivitas,
  }
}

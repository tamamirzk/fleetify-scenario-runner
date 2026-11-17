// Monitoring komputer (docs/RANCANGAN-KERJA-V2.md R-7.2, R-7.9): CPU, memori, disk, dan pemakaian
// memori yang dikelompokkan menurut arti. Pengelompokan dan saran murni; pengambil data di bawah.
import { spawnSync } from 'node:child_process'
import { statfsSync } from 'node:fs'
import os from 'node:os'

export interface Proses {
  pid: number
  rssMb: number
  cpu: number
  perintah: string
  cwd?: string
}

export interface KelompokMemori {
  nama: string
  mb: number
  cpu: number
}

/** Kelompok menurut arti. `slot` = daftar [nama, worktree] untuk mencocokkan cwd proses. */
export function kelompokkan(proses: Proses[], slot: [string, string][]): KelompokMemori[] {
  const g = new Map<string, KelompokMemori>()
  const tambah = (nama: string, p: Proses) => {
    const x = g.get(nama) ?? { nama, mb: 0, cpu: 0 }
    x.mb += p.rssMb
    x.cpu += p.cpu
    g.set(nama, x)
  }
  for (const p of proses) {
    const c = p.perintah
    const s = p.cwd ? slot.find(([, w]) => p.cwd === w || p.cwd?.startsWith(`${w}/`)) : undefined
    if (s) tambah(s[0], p)
    else if (/Virtualization\.VirtualMachine|colima|limactl/.test(c))
      tambah('VM Colima (Docker)', p)
    else if (/(^|\/)(mds|mds_stores|mdworker|mdworker_shared)( |$)/.test(c)) tambah('Spotlight', p)
    else if (/(^|\/)claude( |$)|native-binary\/claude/.test(c)) tambah('Sesi Claude', p)
    else if (/postgresql@16|redis-server/.test(c)) tambah('Postgres/Redis native', p)
    else tambah('Lainnya', p)
  }
  return [...g.values()]
    .map((x) => ({ ...x, mb: Math.round(x.mb), cpu: Math.round(x.cpu) }))
    .sort((a, b) => b.mb - a.mb)
}

export interface Komputer {
  at: string
  cpu: { beban: number; core: number }
  memori: { totalGiB: number; bebasPersen: number | null }
  disk: { sisaGiB: number; totalGiB: number }
  kelompok: KelompokMemori[]
  peringatan: { teks: string; saran: string }[]
  /** Boleh menyalakan server slot baru? Ditolak saat memori tertekan (R-7.2). */
  bolehNyalakanSlot: boolean
}

/** Ambang: memori bebas < 15% menolak slot baru; < 25% memperingatkan. */
export const AMBANG = {
  tolakSlotPersen: 15,
  peringatanMemoriPersen: 25,
  diskGiB: 20,
  bebanPerCore: 1.5,
}

export function nilaiKomputer(
  k: Omit<Komputer, 'peringatan' | 'bolehNyalakanSlot' | 'at'>,
  slotDiam: string[] = [],
) {
  const p: Komputer['peringatan'] = []
  const m = k.memori.bebasPersen
  if (m != null && m < AMBANG.peringatanMemoriPersen)
    p.push({
      teks: `Memori bebas ${m}%`,
      saran: slotDiam.length
        ? `matikan server ${slotDiam.join(', ')} yang sedang diam`
        : 'tutup aplikasi berat yang tidak dipakai',
    })
  if (k.disk.sisaGiB < AMBANG.diskGiB)
    p.push({
      teks: `Disk sisa ${Math.round(k.disk.sisaGiB)} GiB`,
      saran: 'bersihkan runs/ lama, prune Docker/Colima, worktree yang tidak dipakai',
    })
  if (k.cpu.beban / k.cpu.core > AMBANG.bebanPerCore) {
    const spot = k.kelompok.find((x) => x.nama === 'Spotlight')
    p.push({
      teks: `Beban CPU ${k.cpu.beban.toFixed(1)} untuk ${k.cpu.core} core`,
      saran:
        spot && spot.cpu > 50
          ? 'Spotlight sedang mengindeks: kecualikan ~/work di System Settings › Spotlight'
          : 'cek proses berat di daftar pemakaian',
    })
  }
  return { peringatan: p, bolehNyalakanSlot: m == null || m >= AMBANG.tolakSlotPersen }
}

// ── Pengambil data ─────────────────────────────────────────────────────────

function sh(cmd: string) {
  return (spawnSync('bash', ['-c', cmd], { encoding: 'utf8' }).stdout ?? '').trim()
}

/** Proses dengan RSS ≥ 5 MB (proses diam dimampatkan macOS); cwd hanya untuk bun/node/vite (untuk mencocokkan slot). */
export function bacaProses(): Proses[] {
  const out: Proses[] = []
  for (const l of sh('ps -axo pid=,rss=,%cpu=,command=').split('\n')) {
    const m = l.trim().match(/^(\d+)\s+(\d+)\s+([\d.]+)\s+(.*)$/)
    if (!m) continue
    const rssMb = Number(m[2]) / 1024
    if (rssMb < 5) continue
    out.push({ pid: Number(m[1]), rssMb, cpu: Number(m[3]), perintah: m[4] ?? '' })
  }
  const cari = out.filter((p) => /(^|\/)(bun|node)( |$)|vite/.test(p.perintah)).map((p) => p.pid)
  if (cari.length) {
    const cwd = new Map<number, string>()
    let pid = 0
    for (const l of sh(`lsof -a -d cwd -Fpn -p ${cari.join(',')} 2>/dev/null`).split('\n')) {
      if (l.startsWith('p')) pid = Number(l.slice(1))
      else if (l.startsWith('n')) cwd.set(pid, l.slice(1))
    }
    for (const p of out) p.cwd = cwd.get(p.pid)
  }
  return out
}

export function bacaKomputer(slot: [string, string][], slotDiam: string[] = []): Komputer {
  const fs = statfsSync(os.homedir())
  const persen = sh('memory_pressure 2>/dev/null | tail -1').match(/(\d+)%/)?.[1]
  const dasar = {
    cpu: { beban: os.loadavg()[0] ?? 0, core: os.cpus().length },
    memori: {
      totalGiB: Math.round(os.totalmem() / 1024 ** 3),
      bebasPersen: persen ? Number(persen) : null,
    },
    disk: {
      sisaGiB: (fs.bavail * fs.bsize) / 1024 ** 3,
      totalGiB: (fs.blocks * fs.bsize) / 1024 ** 3,
    },
    kelompok: kelompokkan(bacaProses(), slot),
  }
  return { at: new Date().toISOString(), ...dasar, ...nilaiKomputer(dasar, slotDiam) }
}

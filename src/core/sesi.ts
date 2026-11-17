// Sesi Claude per tiket (docs/RANCANGAN-KERJA-V2.md R-5.2, R-6.1–R-6.5). Panel menjalankan satu
// fase dalam sesi tmux `kerja-<KEY>`; mode Terminal membuka Terminal.app tersambung ke sesi itu,
// mode Latar memakai `claude -p` dan progresnya hanya tampil di panel. Hook Claude Code mengabari
// panel (POST /api/kerja/<KEY>/kabar). Bagian murni di atas; pelaksana tmux/osascript di bawah.
import path from 'node:path'
import { ROOT } from './config.ts'

export const FASE_SESI = ['pahami', 'kerjakan', 'serahkan', 'lanjut'] as const
export type FaseSesi = (typeof FASE_SESI)[number]
export type ModeSesi = 'terminal' | 'latar'
export type StatusSesi = 'bekerja' | 'menunggu' | 'berhenti'

export interface Sesi {
  /** ID sesi Claude: dibuat sekali per tiket, lalu dilanjutkan dengan --resume (R-6.1). */
  id: string
  fase: FaseSesi
  mode: ModeSesi
  status: StatusSesi
  /** Pesan terakhir dari hook (mis. "Claude needs your permission to use Bash"). */
  pesan?: string
  mulai: string
  at: string
}

export const LABEL_FASE: Record<FaseSesi, string> = {
  pahami: 'Pahami',
  kerjakan: 'Kerjakan',
  serahkan: 'Serahkan',
  lanjut: 'Lanjutkan',
}

/** Batas biaya per fase untuk mode Latar (pengganti --max-turns yang tidak ada di CLI; K15). */
export const BATAS_USD: Record<FaseSesi, number> = {
  pahami: 3,
  kerjakan: 10,
  serahkan: 3,
  lanjut: 5,
}

export const namaTmux = (key: string) => `kerja-${key}`

/** Tugas per fase. Selalu lewat skill kerjakan, supaya aturan tahap dan gerbang ikut. */
export function promptFase(
  key: string,
  fase: FaseSesi,
  o: { worktree: string; teks?: string },
): string {
  const umum = `Worktree v2: ${o.worktree}. Jangan push dan jangan menulis ke Plane: keduanya lewat tombol panel. Berhenti dan tanya (bun run kerja tanya) bila ada keputusan milik Tams.`
  switch (fase) {
    case 'pahami':
      return `/kerjakan ${key} — fase PAHAMI saja: telusuri kode dan data, tulis Brief di catatan.md (Masalah & penyebab, Rencana), kriteria lewat "kerja cek ${key} belum", pertanyaan lewat "kerja tanya", lalu potret sebelum. Jangan mengubah kode v2. Selesai bila "bun run kerja catatan ${key} brief" ✓. ${umum}`
    case 'kerjakan':
      return `/kerjakan ${key} — fase KERJAKAN: baca jawaban dan keputusan Tams ("bun run kerja catatan ${key} --render"), implementasi di worktree, "bun run kerja gerbang ${key} fokus", verifikasi tiap kriteria, "kerja kesehatan" lalu potret sesudah, isi "Yang dikerjakan". Selesai bila "bun run kerja catatan ${key} akhir" ✓. ${umum}`
    case 'serahkan':
      return `/kerjakan ${key} — fase SERAHKAN: merge origin/development ke branch kerja, "bun run kerja gerbang ${key} ci" sampai ✓ atau !, tambah daftar cek staging ("kerja staging ${key} tambah"), lalu panen dokumentasi ke docs-site ("bun run kerja panen ${key} --tulis"; check-v2 harus lulus, jangan commit fleetify-ops). Jangan push. ${umum}`
    case 'lanjut':
      return `/kerjakan ${key} — lanjutkan dari keadaan di kerja.json. Arahan Tams: ${o.teks?.trim() || '(tanpa arahan tambahan)'}. ${umum}`
  }
}

/** Larangan untuk semua fase: push, tulis Plane, migrasi deploy (R-6.5, R-2.3). */
export const LARANG_UMUM = [
  'Bash(git push *)',
  'Bash(git push)',
  'Bash(bun run kerja plane *)',
  'Bash(bun src/kerja.ts plane *)',
  'Bash(* prisma migrate deploy*)',
  'Bash(prisma migrate deploy*)',
  // API panel (push, Plane) hanya lewat klik Tams; hook memakai curl di luar sistem izin alat.
  'Bash(curl *:5800*)',
  'Bash(wget *:5800*)',
]

/** Izin alat per fase. Pahami hanya baca (kecuali berkas kerja/); Kerjakan menulis di worktree. */
export function izinFase(fase: FaseSesi, worktree: string): { izin: string[]; larang: string[] } {
  const wt = `//${path.resolve(worktree).replace(/^\//, '')}/**`
  const baca = [
    'Read',
    'Grep',
    'Glob',
    'Bash(bun run kerja *)',
    'Bash(bun src/kerja.ts *)',
    'Bash(git status*)',
    'Bash(git log *)',
    'Bash(git diff *)',
    'Bash(git show *)',
    'Edit(./kerja/**)',
    'Write(./kerja/**)',
  ]
  if (fase === 'pahami')
    return { izin: baca, larang: [...LARANG_UMUM, `Edit(${wt})`, `Write(${wt})`] }
  const tulis = [
    `Edit(${wt})`,
    `Write(${wt})`,
    'Bash(bun run test *)',
    'Bash(bun run typecheck*)',
    'Bash(bunx biome *)',
  ]
  if (fase === 'serahkan')
    return {
      izin: [...baca, ...tulis, 'Bash(git fetch *)', 'Bash(git merge *)'],
      larang: LARANG_UMUM,
    }
  return { izin: [...baca, ...tulis], larang: LARANG_UMUM }
}

/** Hook Claude Code → panel. Payload hook (JSON di stdin) diteruskan apa adanya (R-6.4). */
export function settingsHook(key: string, port: number): string {
  const kirim = `curl -s -m 3 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:${port}/api/kerja/${key}/kabar >/dev/null 2>&1 || true`
  const satu = [{ hooks: [{ type: 'command', command: kirim }] }]
  return JSON.stringify({
    hooks: { UserPromptSubmit: satu, Notification: satu, Stop: satu, SessionEnd: satu },
  })
}

export const kutipShell = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`

/** Argumen `claude` untuk satu fase. `baru` = sesi pertama tiket (pakai --session-id). */
export function argsClaude(o: {
  key: string
  fase: FaseSesi
  mode: ModeSesi
  sesiId: string
  baru: boolean
  worktree: string
  port: number
  teks?: string
  /** Alias model (mis. haiku/sonnet) untuk fase ringan atau uji; kosong = model bawaan. */
  model?: string
}): string[] {
  const { izin, larang } = izinFase(o.fase, o.worktree)
  const a = [
    'claude',
    o.baru ? '--session-id' : '--resume',
    o.sesiId,
    '--name',
    `${o.key} · ${LABEL_FASE[o.fase]}`,
    '--add-dir',
    path.resolve(o.worktree),
    '--settings',
    settingsHook(o.key, o.port),
    '--allowedTools',
    ...izin,
    '--disallowedTools',
    ...larang,
  ]
  if (o.model) {
    if (!/^[a-z0-9.\-[\]]+$/i.test(o.model)) throw new Error(`Model tidak sah: ${o.model}`)
    a.push('--model', o.model)
  }
  if (o.mode === 'latar')
    a.push(
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--permission-mode',
      'acceptEdits',
      '--permission-prompts',
      'none',
      '--max-budget-usd',
      String(BATAS_USD[o.fase]),
    )
  a.push('--', promptFase(o.key, o.fase, { worktree: o.worktree, teks: o.teks }))
  return a
}

/** Perintah shell yang dijalankan di dalam tmux. Latar: stream-json diringkas per baris. */
export function perintahTmux(args: string[], mode: ModeSesi): string {
  const claude = args.map(kutipShell).join(' ')
  return mode === 'latar'
    ? `${claude} | bun ${kutipShell(path.join(ROOT, 'src', 'sesi-baris.ts'))}`
    : claude
}

/** Status sesi dari nama event hook. */
export function statusDariHook(
  event: string,
  pesan?: string,
): { status: StatusSesi; pesan?: string } | null {
  switch (event) {
    case 'UserPromptSubmit':
      return { status: 'bekerja' }
    case 'Notification':
      return { status: 'menunggu', pesan: pesan || 'Claude menunggu kamu' }
    case 'Stop':
      return { status: 'menunggu', pesan: 'Claude selesai; giliranmu' }
    case 'SessionEnd':
      return { status: 'berhenti', pesan: 'Sesi berakhir' }
    default:
      return null
  }
}

/** Satu baris ringkas dari satu event stream-json `claude -p` (mode Latar). */
export function barisStream(e: Record<string, unknown>): string | null {
  const isi = (e.message as { content?: Record<string, unknown>[] } | undefined)?.content ?? []
  if (e.type === 'assistant') {
    const out: string[] = []
    for (const c of isi) {
      if (c.type === 'text' && typeof c.text === 'string' && c.text.trim()) out.push(c.text.trim())
      if (c.type === 'tool_use') {
        const inp = (c.input ?? {}) as Record<string, unknown>
        const arg = inp.command ?? inp.file_path ?? inp.pattern ?? inp.description ?? ''
        out.push(
          `▸ ${String(c.name)}${arg ? `: ${String(arg).split('\n')[0]?.slice(0, 140)}` : ''}`,
        )
      }
    }
    return out.length ? out.join('\n') : null
  }
  if (e.type === 'result')
    return `■ selesai (${e.subtype ?? 'hasil'})${typeof e.total_cost_usd === 'number' ? ` · $${e.total_cost_usd.toFixed(2)}` : ''}`
  return null
}

// ── Pelaksana ──────────────────────────────────────────────────────────────

async function sh(args: string[]) {
  const p = Bun.spawn(args, { stdout: 'pipe', stderr: 'pipe' })
  const [out, err] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
  ])
  return { kode: await p.exited, out: out.trim(), err: err.trim() }
}

/** Ada sesi tmux tiket ini? Bila ada: apakah prosesnya masih hidup dan apa yang berjalan. */
export async function keadaanTmux(key: string) {
  const ada = (await sh(['tmux', 'has-session', '-t', namaTmux(key)])).kode === 0
  if (!ada) return { ada: false, hidup: false, perintah: '' }
  const r = await sh([
    'tmux',
    'list-panes',
    '-t',
    namaTmux(key),
    '-F',
    '#{pane_dead} #{pane_current_command}',
  ])
  const [mati, perintah = ''] = r.out.split('\n')[0]?.split(' ') ?? []
  return { ada: true, hidup: mati === '0', perintah }
}

/** Baris terakhir layar sesi (tanpa baris kosong) untuk kartu di panel. */
export async function cuplikanSesi(key: string, baris = 12): Promise<string[]> {
  const r = await sh(['tmux', 'capture-pane', '-p', '-t', namaTmux(key), '-S', '-200'])
  if (r.kode !== 0) return []
  return r.out
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim())
    .slice(-baris)
}

/** Buka jendela Terminal.app yang tersambung ke sesi tmux tiket (R-6.2). */
export async function bukaTerminal(key: string) {
  const r = await sh([
    'osascript',
    '-e',
    `tell application "Terminal" to do script "tmux attach -t ${namaTmux(key)}"`,
    '-e',
    'tell application "Terminal" to activate',
  ])
  if (r.kode !== 0) throw new Error(`Terminal tidak bisa dibuka: ${r.err || r.out}`)
}

export async function hentikanSesi(key: string) {
  await sh(['tmux', 'kill-session', '-t', namaTmux(key)])
}

/**
 * Mulai fase: sesi interaktif yang masih hidup menerima prompt baru lewat send-keys (konteks
 * tetap); selain itu sesi tmux lama ditutup dan `claude` dijalankan baru (--resume bila sudah
 * pernah ada sesi Claude untuk tiket ini).
 */
export async function mulaiTmux(
  key: string,
  o: { args: string[]; mode: ModeSesi; prompt: string; cwd: string },
) {
  const k = await keadaanTmux(key)
  if (k.hidup && o.mode === 'terminal' && /claude|node/i.test(k.perintah)) {
    await sh(['tmux', 'send-keys', '-t', namaTmux(key), '-l', o.prompt])
    await sh(['tmux', 'send-keys', '-t', namaTmux(key), 'Enter'])
    return 'dilanjutkan'
  }
  if (k.ada) await hentikanSesi(key)
  const r = await sh([
    'tmux',
    'new-session',
    '-d',
    '-s',
    namaTmux(key),
    '-c',
    o.cwd,
    '-x',
    '200',
    '-y',
    '50',
    perintahTmux(o.args, o.mode),
  ])
  if (r.kode !== 0) throw new Error(`tmux gagal: ${r.err || r.out}`)
  // Layar tetap terbaca setelah claude keluar (cuplikan dan "Buka terminal" tetap berguna).
  await sh(['tmux', 'set-option', '-t', namaTmux(key), 'remain-on-exit', 'on'])
  // Claude Code memakai focus events tmux (petunjuknya muncul di layar bila mati).
  await sh(['tmux', 'set-option', '-g', 'focus-events', 'on'])
  return 'dimulai'
}

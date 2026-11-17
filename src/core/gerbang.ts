// Gerbang kode v2 (docs/RANCANGAN-KERJA-V2.md R-4.1, R-10.1, R-10.2). Dua tingkat:
//   fokus — hanya bagian yang berubah terhadap development (cepat, dipakai saat bekerja);
//   ci    — mengulang job .gitlab-ci.yml v2 dengan variabel CI yang sama (sekali, sebelum push).
// Bagian murni (daftar langkah, pembaca keluaran vitest) di atas; pelaksana di bawah.
import { createHash } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import path from 'node:path'
import { ROOT } from './config.ts'

export type Proyek = 'Backend' | 'Frontend' | '.'
export type HasilLangkah = 'lulus' | 'gagal' | 'peringatan' | 'dilewati'

export interface Langkah {
  id: string
  judul: string
  proyek: Proyek
  /** Perintah shell, dijalankan dari <worktree>/<proyek>. */
  cmd: string
  env?: Record<string, string>
  /** Langkah lain yang harus lulus dulu (mis. install sebelum typecheck). */
  butuh?: string[]
  /** Tes vitest: berkas yang gagal dibandingkan dengan development. */
  tes?: boolean
}

/** Variabel global `.gitlab-ci.yml` v2: placeholder agar env.ts lolos validasi tanpa DB/Redis. */
export const CI_ENV: Record<string, string> = {
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://ci:ci@localhost:5432/ci',
  DATABASE_REPLICA_URL: 'postgresql://ci:ci@localhost:5432/ci',
  MIGRATE_DATABASE_URL: 'postgresql://ci:ci@localhost:5432/ci',
  REDIS_URL: 'redis://localhost:6379',
  OIDC_ISSUER: 'http://localhost:9000',
  OIDC_CLIENT_ID: 'fleetify-web',
  OIDC_CLIENT_SECRET: 'fleetify_local_client_secret',
  OIDC_REDIRECT_URI: 'http://localhost:5173/auth/callback',
  OIDC_POST_LOGOUT_REDIRECT_URI: 'http://localhost:5173',
  APP_SESSION_SECRET: 'ci_dummy_session_secret_0123456789',
  WEB_ORIGIN: 'http://localhost:5173',
}

/**
 * Sidik `.gitlab-ci.yml` saat langkah di bawah disalin. Bila berbeda, gerbang memberi peringatan:
 * CI v2 berubah dan langkah di berkas ini perlu ditinjau ulang.
 */
export const SIDIK_CI_DIKENAL = '2d2b0e3683df'
export const sidikCi = (yml: string) => createHash('sha256').update(yml).digest('hex').slice(0, 12)

/** Berkas pemicu tes frontend PENUH (salinan `full_triggers` job frontend-test). */
export const PEMICU_TES_PENUH =
  /^(Frontend\/src\/test\/|Frontend\/src\/shared\/theme\/|Frontend\/src\/shared\/i18n\/|Frontend\/vite\.config\.ts$|Frontend\/package\.json$|Frontend\/bun\.lock$|Frontend\/tsconfig[^/]*\.json$|Frontend\/openapi\.json$|Frontend\/openapi-ts\.config\.ts$|Frontend\/capacitor\.config\.ts$|Frontend\/index\.html$|Frontend\/\.env|Frontend\/(android|ios)\/|Backend\/src\/shared\/rbac\/|\.gitlab-ci\.yml$|biome\.json$)/

/** Cakupan tes frontend untuk MR ke development: penuh bila ada berkas pemicu, selain itu terkait. */
export const cakupanTesFrontend = (berubah: string[]): 'penuh' | 'terkait' =>
  berubah.some((f) => PEMICU_TES_PENUH.test(f)) ? 'penuh' : 'terkait'

const TES = '--reporter=dot --silent=passed-only'

/** Langkah tingkat `ci`: lima job .gitlab-ci.yml (merge-conflicts, backend, backend-test,
 *  frontend-static, frontend-test), tanpa sharding. `base` = merge-base dengan development. */
export function langkahCi(base: string, berubah: string[]): Langkah[] {
  const fe = cakupanTesFrontend(berubah)
  return [
    {
      id: 'konflik',
      judul: 'Konflik dengan development',
      proyek: '.',
      cmd: 'git merge-tree --write-tree --name-only --no-messages HEAD origin/development',
    },
    {
      id: 'be-install',
      judul: 'Backend: install',
      proyek: 'Backend',
      cmd: 'bun install --frozen-lockfile',
    },
    {
      id: 'be-prisma',
      judul: 'Backend: prisma generate',
      proyek: 'Backend',
      cmd: 'bunx prisma generate',
      butuh: ['be-install'],
    },
    {
      id: 'be-check',
      judul: 'Backend: biome',
      proyek: 'Backend',
      cmd: 'bun run check',
      butuh: ['be-install'],
    },
    {
      id: 'be-typecheck',
      judul: 'Backend: typecheck',
      proyek: 'Backend',
      cmd: 'bun run typecheck',
      butuh: ['be-prisma'],
    },
    {
      id: 'be-openapi',
      judul: 'Backend: Frontend/openapi.json sinkron',
      proyek: 'Backend',
      cmd: 'bun run openapi:export && cp openapi.json ../Frontend/openapi.json && git diff --exit-code -- ../Frontend/openapi.json',
      butuh: ['be-prisma'],
    },
    {
      id: 'be-test',
      judul: 'Backend: tes',
      proyek: 'Backend',
      cmd: `bun run test ${TES}`,
      butuh: ['be-prisma'],
      tes: true,
    },
    {
      id: 'fe-install',
      judul: 'Frontend: install',
      proyek: 'Frontend',
      cmd: 'bun install --frozen-lockfile',
    },
    {
      id: 'fe-client',
      judul: 'Frontend: gen:client dari spec yang di-commit',
      proyek: 'Frontend',
      cmd: 'OPENAPI_SPEC=openapi.json bun run gen:client',
      butuh: ['fe-install'],
    },
    {
      id: 'fe-check',
      judul: 'Frontend: biome',
      proyek: 'Frontend',
      cmd: 'bun run check',
      butuh: ['fe-client'],
    },
    {
      id: 'fe-typecheck',
      judul: 'Frontend: typecheck',
      proyek: 'Frontend',
      cmd: 'bun run typecheck',
      butuh: ['fe-client'],
    },
    {
      id: 'fe-test',
      judul: `Frontend: tes ${fe}`,
      proyek: 'Frontend',
      cmd:
        fe === 'penuh'
          ? `bun run test ${TES}`
          : `bun run test --changed ${base} --passWithNoTests ${TES}`,
      env: { VITE_API_BASE_URL: 'http://localhost:3000' },
      butuh: ['fe-client'],
      tes: true,
    },
  ]
}

const dalam = (berubah: string[], proyek: 'Backend' | 'Frontend') =>
  berubah.filter((f) => f.startsWith(`${proyek}/`)).map((f) => f.slice(proyek.length + 1))

const kutip = (f: string) => `'${f.replace(/'/g, `'\\''`)}'`

/** Langkah tingkat `fokus`: hanya proyek yang berubah, biome pada berkas berubah, tes terkait. */
export function langkahFokus(base: string, berubah: string[]): Langkah[] {
  const out: Langkah[] = []
  const be = dalam(berubah, 'Backend')
  const fe = dalam(berubah, 'Frontend')
  const lint = (fs: string[]) =>
    fs
      .filter((f) => /\.(ts|tsx|js|jsx|json|css)$/.test(f))
      .map(kutip)
      .join(' ')
  if (be.length) {
    if (be.some((f) => f.startsWith('prisma/')))
      out.push({
        id: 'be-prisma',
        judul: 'Backend: prisma generate',
        proyek: 'Backend',
        cmd: 'bunx prisma generate',
      })
    const l = lint(be)
    if (l)
      out.push({
        id: 'be-check',
        judul: 'Backend: biome (berkas berubah)',
        proyek: 'Backend',
        cmd: `bunx biome check --no-errors-on-unmatched ${l}`,
      })
    out.push(
      {
        id: 'be-typecheck',
        judul: 'Backend: typecheck',
        proyek: 'Backend',
        cmd: 'bun run typecheck',
      },
      {
        id: 'be-openapi',
        judul: 'Backend: Frontend/openapi.json sinkron',
        proyek: 'Backend',
        cmd: 'bun run openapi:export && cp openapi.json ../Frontend/openapi.json && git diff --exit-code -- ../Frontend/openapi.json',
        env: CI_ENV,
      },
      {
        id: 'be-test',
        judul: 'Backend: tes terkait',
        proyek: 'Backend',
        cmd: `bun run test --changed ${base} --passWithNoTests ${TES}`,
        tes: true,
        env: CI_ENV,
      },
    )
  }
  if (fe.length || be.length) {
    // Perubahan backend bisa mengubah spec → client → tipe frontend (pelajaran MR FMS-105).
    out.push({
      id: 'fe-client',
      judul: 'Frontend: gen:client',
      proyek: 'Frontend',
      cmd: 'OPENAPI_SPEC=openapi.json bun run gen:client',
    })
    const l = lint(fe)
    if (l)
      out.push({
        id: 'fe-check',
        judul: 'Frontend: biome (berkas berubah)',
        proyek: 'Frontend',
        cmd: `bunx biome check --no-errors-on-unmatched ${l}`,
        butuh: ['fe-client'],
      })
    out.push({
      id: 'fe-typecheck',
      judul: 'Frontend: typecheck',
      proyek: 'Frontend',
      cmd: 'bun run typecheck',
      butuh: ['fe-client'],
    })
    if (fe.length)
      out.push({
        id: 'fe-test',
        judul: 'Frontend: tes terkait',
        proyek: 'Frontend',
        cmd: `bun run test --changed ${base} --passWithNoTests ${TES}`,
        env: { VITE_API_BASE_URL: 'http://localhost:3000' },
        butuh: ['fe-client'],
        tes: true,
      })
  }
  return out
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: kode warna ANSI dari keluaran alat
const ANSI = /\u001b\[[0-9;]*m/g

/** Berkas tes yang gagal dari keluaran vitest (baris "FAIL  src/…test.ts > …" atau "× src/…"). */
export function berkasGagalVitest(keluaran: string): string[] {
  const out = new Set<string>()
  for (const baris of keluaran.replace(ANSI, '').split('\n')) {
    const m = baris.match(/(?:FAIL|×|❯)\s+(\S+\.(?:test|spec)\.[cm]?[jt]sx?)/)
    if (m?.[1]) out.add(m[1])
  }
  return [...out].sort()
}

/** Angka ringkas vitest: "Tests  91 failed | 63991 passed". */
export function hitungVitest(keluaran: string): { gagal: number; lulus: number } | null {
  const m = keluaran
    .replace(ANSI, '')
    .match(/Tests\s+(?:(\d+) failed)?(?:\s*\|\s*)?(?:(\d+) passed)?/)
  if (!m || (!m[1] && !m[2])) return null
  return { gagal: Number(m[1] ?? 0), lulus: Number(m[2] ?? 0) }
}

export interface HasilLangkahGerbang {
  id: string
  judul: string
  hasil: HasilLangkah
  detik: number
  /** Satu kalimat: alasan gagal, angka tes, atau berkas yang juga gagal di development. */
  ringkas?: string
}

export interface HasilGerbang {
  tingkat: 'fokus' | 'ci'
  hasil: 'lulus' | 'gagal' | 'peringatan'
  at: string
  head: string
  detik: number
  langkah: HasilLangkahGerbang[]
  /** Berkas log lengkap, relatif terhadap akar scenario-runner. */
  log: string
  catatan: string[]
}

/** Hasil keseluruhan: gagal bila ada langkah gagal; peringatan bila hanya peringatan. */
export function simpulkan(langkah: HasilLangkahGerbang[]): HasilGerbang['hasil'] {
  if (langkah.some((l) => l.hasil === 'gagal' || l.hasil === 'dilewati')) return 'gagal'
  return langkah.some((l) => l.hasil === 'peringatan') ? 'peringatan' : 'lulus'
}

const durasi = (d: number) =>
  d >= 60 ? `${Math.floor(d / 60)}m${String(d % 60).padStart(2, '0')}s` : `${d}s`

/** Ringkasan untuk terminal/panel: baris vonis, lalu hanya yang gagal/peringatan (R-10.2). */
export function ringkasGerbang(h: HasilGerbang): string {
  const lulus = h.langkah.filter((l) => l.hasil === 'lulus').length
  const tanda = { lulus: '✓', gagal: '×', peringatan: '!' }[h.hasil]
  const baris = [
    `${tanda} gerbang ${h.tingkat} ${lulus}/${h.langkah.length} · ${durasi(h.detik)} · ${h.head.slice(0, 8)} · log: ${h.log}`,
  ]
  for (const l of h.langkah)
    if (l.hasil !== 'lulus')
      baris.push(
        `  ${{ gagal: '×', peringatan: '!', dilewati: '–', lulus: '✓' }[l.hasil]} ${l.judul}${l.ringkas ? `: ${l.ringkas}` : ''}`,
      )
  for (const c of h.catatan) baris.push(`  ! ${c}`)
  return baris.join('\n')
}

// ── Pelaksana ──────────────────────────────────────────────────────────────

async function jalan(cmd: string, cwd: string, env: Record<string, string> = {}) {
  const p = Bun.spawn(['bash', '-c', cmd], {
    cwd,
    env: { ...process.env, NO_COLOR: '1', FORCE_COLOR: '0', ...env },
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const [out, err] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
  ])
  return { kode: await p.exited, keluaran: `${out}${err}` }
}

const git = async (dir: string, args: string) => (await jalan(`git ${args}`, dir)).keluaran.trim()

const ekorGalat = (keluaran: string) =>
  keluaran
    .replace(ANSI, '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /error|Error|failed|×|differ|conflict|diff --git/i.test(l))
    .slice(0, 2)
    .join(' · ')
    .slice(0, 220)

/**
 * Uji ulang berkas tes yang gagal di checkout bersih `origin/development` (worktree sementara,
 * node_modules dipinjam lewat symlink). Kembalikan berkas yang juga gagal di sana, atau null bila
 * tak bisa dibandingkan.
 */
export async function gagalDiDevelopment(
  dir: string,
  proyek: 'Backend' | 'Frontend',
  berkas: string[],
  tulis: (s: string) => void,
): Promise<string[] | null> {
  if (proyek === 'Backend') {
    // Client Prisma dipinjam dari worktree kerja; tak sah bila skemanya berbeda dari development.
    const beda = await jalan('git diff --quiet origin/development HEAD -- Backend/prisma', dir)
    if (beda.kode !== 0) return null
  }
  const tmp = path.join(ROOT, 'runs', 'gerbang', `dasar-${Date.now()}`)
  mkdirSync(path.dirname(tmp), { recursive: true })
  try {
    const add = await jalan(`git worktree add --detach '${tmp}' origin/development`, dir)
    if (add.kode !== 0) return null
    symlinkSync(path.join(dir, proyek, 'node_modules'), path.join(tmp, proyek, 'node_modules'))
    if (proyek === 'Frontend')
      await jalan('OPENAPI_SPEC=openapi.json bun run gen:client', path.join(tmp, proyek))
    const r = await jalan(
      `bun run test ${berkas.map(kutip).join(' ')} ${TES}`,
      path.join(tmp, proyek),
      proyek === 'Backend' ? CI_ENV : { VITE_API_BASE_URL: 'http://localhost:3000' },
    )
    tulis(`\n── dasar development (${proyek}) ──\n${r.keluaran}`)
    return berkasGagalVitest(r.keluaran)
  } finally {
    await jalan(`git worktree remove --force '${tmp}'`, dir)
    if (existsSync(tmp)) rmSync(tmp, { recursive: true, force: true })
  }
}

/** Jalankan gerbang di worktree v2 `dir`; log lengkap ke `logRel` (relatif ROOT). */
export async function jalankanGerbang(o: {
  dir: string
  tingkat: 'fokus' | 'ci'
  logRel: string
  rinci?: (s: string) => void
}): Promise<HasilGerbang> {
  const mulai = Date.now()
  const logAbs = path.join(ROOT, o.logRel)
  mkdirSync(path.dirname(logAbs), { recursive: true })
  const tulis = (s: string) => appendFileSync(logAbs, `${s}\n`)
  const catatan: string[] = []

  await jalan('git fetch --quiet origin development', o.dir)
  const head = await git(o.dir, 'rev-parse HEAD')
  const base = await git(o.dir, 'merge-base HEAD origin/development')
  const berubahKomit = (await git(o.dir, `diff --name-only ${base} HEAD`))
    .split('\n')
    .filter(Boolean)
  const kotor = (await git(o.dir, 'status --porcelain')).split('\n').filter(Boolean)
  if (kotor.length)
    catatan.push(
      o.tingkat === 'ci'
        ? `${kotor.length} berkas belum di-commit: CI menguji commit, gerbang ini menguji working tree`
        : `${kotor.length} berkas belum di-commit (ikut diuji)`,
    )
  const berubah =
    o.tingkat === 'fokus'
      ? (await git(o.dir, `diff --name-only ${base}`)).split('\n').filter(Boolean)
      : berubahKomit
  if (!berubahKomit.length && !kotor.length)
    catatan.push(
      'Branch tidak berbeda dari development (sudah di-merge?): tidak ada yang diuji oleh tes terkait',
    )
  const yml = path.join(o.dir, '.gitlab-ci.yml')
  if (
    o.tingkat === 'ci' &&
    existsSync(yml) &&
    sidikCi(readFileSync(yml, 'utf8')) !== SIDIK_CI_DIKENAL
  )
    catatan.push(
      '.gitlab-ci.yml v2 berubah sejak langkah gerbang ditulis: tinjau src/core/gerbang.ts',
    )

  const daftar = o.tingkat === 'ci' ? langkahCi(base, berubahKomit) : langkahFokus(base, berubah)
  if (!daftar.length) catatan.push('Tidak ada berkas Backend/Frontend yang berubah')
  tulis(
    `gerbang ${o.tingkat} · ${o.dir} · HEAD ${head} · base ${base}\nberubah: ${berubah.length} berkas\n`,
  )

  const hasil: HasilLangkahGerbang[] = []
  for (const l of daftar) {
    const gagalDulu = (l.butuh ?? []).find(
      (b) =>
        hasil.find((h) => h.id === b)?.hasil === 'gagal' ||
        hasil.find((h) => h.id === b)?.hasil === 'dilewati',
    )
    if (gagalDulu) {
      hasil.push({
        id: l.id,
        judul: l.judul,
        hasil: 'dilewati',
        detik: 0,
        ringkas: `menunggu ${gagalDulu}`,
      })
      continue
    }
    const t0 = Date.now()
    const env = o.tingkat === 'ci' ? { ...CI_ENV, ...(l.env ?? {}) } : (l.env ?? {})
    const r = await jalan(l.cmd, path.join(o.dir, l.proyek), env)
    const detik = Math.round((Date.now() - t0) / 1000)
    tulis(`\n── ${l.id} · ${l.judul} · ${detik}s · kode ${r.kode}\n$ ${l.cmd}\n${r.keluaran}`)
    let h: HasilLangkahGerbang = {
      id: l.id,
      judul: l.judul,
      hasil: r.kode === 0 ? 'lulus' : 'gagal',
      detik,
    }
    if (l.tes) {
      const n = hitungVitest(r.keluaran)
      if (n) h.ringkas = `${n.gagal} gagal · ${n.lulus} lulus`
    }
    if (h.hasil === 'gagal' && l.tes && l.proyek !== '.') {
      const gagal = berkasGagalVitest(r.keluaran)
      const dasar = gagal.length ? await gagalDiDevelopment(o.dir, l.proyek, gagal, tulis) : null
      if (dasar) {
        const baru = gagal.filter((f) => !dasar.includes(f))
        h = baru.length
          ? {
              ...h,
              ringkas: `${h.ringkas ?? ''} · baru gagal: ${baru.slice(0, 3).join(', ')}${baru.length > 3 ? ` (+${baru.length - 3})` : ''}`,
            }
          : {
              ...h,
              hasil: 'peringatan',
              ringkas: `${h.ringkas ?? ''} · ${gagal.length} berkas yang sama juga gagal di development`,
            }
      } else if (gagal.length)
        h.ringkas = `${h.ringkas ?? ''} · ${gagal.length} berkas gagal (tak bisa dibandingkan dengan development)`
    } else if (h.hasil === 'gagal') h.ringkas = ekorGalat(r.keluaran) || `kode keluar ${r.kode}`
    hasil.push(h)
    o.rinci?.(
      `  ${h.hasil === 'lulus' ? '✓' : h.hasil === 'peringatan' ? '!' : '×'} ${l.judul} · ${detik}s`,
    )
  }
  return {
    tingkat: o.tingkat,
    hasil: daftar.length ? simpulkan(hasil) : 'lulus',
    at: new Date().toISOString(),
    head,
    detik: Math.round((Date.now() - mulai) / 1000),
    langkah: hasil,
    log: o.logRel,
    catatan,
  }
}

// Laporan gabungan Markdown satu jalan (runs/<jalan>/laporan.md): KPI, tabel langkah, pelanggaran
// UI dan DB baru dengan lokasinya, diff dokumen, lalu yang sudah ada (ringkas). Murni, diuji
// Vitest dengan snapshot string. Dibaca pekerja tanpa panel.
import { teksDiff } from '../pemeriksaan/banding.ts'
import { terbaruDulu } from './requests.ts'
import type {
  DiffDokumen,
  ItemPemeriksaan,
  KelompokStatis,
  RunResult,
  StepResult,
} from './run-types.ts'

const LABEL_STATUS: Record<string, string> = {
  selesai: 'Selesai',
  gagal: 'Gagal',
  dihentikan: 'Dihentikan',
  lulus: 'lulus',
  dilompati: 'dilompati',
  menunggu: 'tidak dijalankan',
  berjalan: 'terputus',
}
const label = (s: string) => LABEL_STATUS[s] ?? s
const durasi = (ms: number | null | undefined) =>
  ms == null
    ? '–'
    : `${Math.floor(ms / 60000)}:${String(Math.round(ms / 1000) % 60).padStart(2, '0')}`
const sel = (v: unknown) =>
  String(v ?? '')
    .replaceAll('|', '\\|')
    .replaceAll('\n', ' ')
const nilai = (v: unknown) =>
  v == null ? '-' : typeof v === 'object' ? JSON.stringify(v) : String(v)

const BATAS_NILAI = 80
const pendek = (v: unknown) => {
  if (v == null || typeof v !== 'object') return v
  const t = JSON.stringify(v)
  return t.length > BATAS_NILAI ? `${t.slice(0, BATAS_NILAI)}… (lihat result.json)` : v
}
/** Nilai JSON panjang (mis. riwayat serah terima) dipotong supaya laporan tetap terbaca. */
const ringkasDiff = (d: DiffDokumen): DiffDokumen => ({
  ...d,
  perubahan: d.perubahan.map((p) => ({ ...p, dari: pendek(p.dari), ke: pendek(p.ke) })),
})

export interface KpiLaporan {
  langkahLulus: number
  langkahTotal: number
  dbBaru: number
  dbLama: number
  uiBaru: number
  uiLama: number
  dom: number
  durasiMs: number | null
}

/** Angka KPI yang dipakai laporan dan layar Selesai panel. */
export function kpiJalan(r: RunResult): KpiLaporan {
  const db = r.pemeriksaan
  const ui = r.pemeriksaanUi
  return {
    langkahLulus: r.steps.filter((s) => s.status === 'lulus').length,
    langkahTotal: r.steps.length,
    dbBaru: (db?.baru ?? []).reduce((a, i) => a + i.baris.length, 0),
    dbLama: (db?.sudahAda ?? []).reduce((a, i) => a + i.baris.length, 0),
    uiBaru: (ui?.baru ?? []).reduce((a, g) => a + g.baru, 0),
    uiLama:
      (ui?.sudahAda ?? []).reduce((a, g) => a + g.jumlah, 0) +
      (ui?.baru ?? []).reduce((a, g) => a + g.baseline, 0),
    dom: (ui?.dom ?? []).reduce((a, d) => a + d.jumlah, 0),
    durasiMs: r.duration_ms,
  }
}

const selUi = (s: StepResult) => {
  const u = s.ui
  if (!u) return '–'
  if (u.status === 'dilewati') return 'dilewati'
  if (u.status === 'memeriksa') return 'belum selesai'
  const baru = (u.statis?.baru ?? []).reduce((a, g) => a + g.baru, 0)
  const dom = (u.dom?.temuan ?? []).reduce((a, t) => a + t.jumlah, 0)
  const bagian = [
    u.statis ? `${u.statis.berkas} berkas, ${baru} baru` : 'statis gagal',
    u.dom ? `${dom} DOM` : null,
    u.galat.length ? `galat: ${u.galat.join('; ')}` : null,
  ].filter(Boolean)
  return `${u.status === 'pelanggaran' ? '✗' : u.status === 'peringatan' ? '!' : u.status === 'galat' ? '!' : '✓'} ${bagian.join(', ')}`
}
const selDb = (s: StepResult) => {
  const d = s.db
  if (!d) return '–'
  if (d.status === 'memeriksa') return 'belum selesai'
  if (d.status === 'pelanggaran')
    return `✗ ${d.pelanggaran.reduce((a, i) => a + i.baris.length, 0)} baru (${d.pelanggaran.map((i) => i.id).join(', ')})`
  if (d.status === 'galat') return `! galat: ${d.galat[0]?.pesan ?? ''}`
  return `✓ ok${d.sembuh.length ? ` · sembuh ${d.sembuh.map((i) => i.id).join(', ')}` : ''}`
}
const selReq = (s: StepResult) => {
  const rs = s.requests ?? []
  if (!rs.length) return '–'
  const tampil = rs.slice(0, 4).map((r) => `${r.method} ${r.path} ${r.status}`)
  return `${tampil.join('<br>')}${rs.length > 4 ? `<br>… ${rs.length - 4} lagi` : ''}`
}

function kelompokStatis(g: KelompokStatis, v2Dir: string | null) {
  const out = [
    `### ${g.rule} · \`${g.file}\` — ${g.jumlah} pelanggaran, baseline ${g.baseline}, **${g.baru} baru** (langkah ${g.langkah ?? '?'}, DESIGN.md ${g.pasal})`,
    '',
    'Baseline hanya menyimpan jumlah per (berkas, aturan); semua baris pasangan ini ditampilkan supaya yang baru bisa ditemukan.',
    '',
  ]
  for (const b of g.baris) {
    const abs = v2Dir ? `${v2Dir}/Frontend/${b.file}` : b.file
    out.push(
      `- \`${b.file}:${b.line}:${b.col}\` — ${b.message}${v2Dir ? ` ([buka](vscode://file${abs.startsWith('/') ? '' : '/'}${abs}:${b.line}:${b.col}))` : ''}`,
    )
    if (b.cuplikan) out.push(`  \`\`\`tsx\n  ${b.cuplikan}\n  \`\`\``)
  }
  out.push('')
  return out
}

function itemDb(it: ItemPemeriksaan, r: RunResult) {
  const langkah = it.langkah ?? 0
  const step = r.steps[langkah - 1]
  const req = terbaruDulu(step?.requests ?? [])
  const out = [
    `### ${it.id} — ${it.judul} · ${it.baris.length} baris · muncul di langkah ${langkah}${it.sembuh !== undefined ? `, sembuh di langkah ${it.sembuh}` : ''}`,
    '',
    it.keterangan,
    '',
  ]
  if (req.length) {
    out.push(
      `**Transaksi tersangka** (request tulis langkah ${langkah}, terakhir sebelum snapshot paling atas):`,
      '',
      ...req.map(
        (x, i) =>
          `${i + 1}. \`${x.method} ${x.pathAsli}\` → ${x.status}${x.durasiMs != null ? ` (${x.durasiMs} ms)` : ''}${x.sumber === 'api' ? ' · lewat API' : ''}`,
      ),
      '',
    )
  } else if (step) out.push('_Tidak ada request tulis tercatat di langkah ini._', '')
  const kolom = Object.keys(it.baris[0] ?? {})
  if (kolom.length) {
    out.push(`| ${kolom.map(sel).join(' | ')} |`, `| ${kolom.map(() => '---').join(' | ')} |`)
    for (const b of it.baris.slice(0, 10))
      out.push(`| ${kolom.map((k) => sel(nilai(b[k]))).join(' | ')} |`)
    if (it.baris.length > 10) out.push('', `… ${it.baris.length - 10} baris lagi di result.json`)
    out.push('')
  }
  return out
}

/** Susun laporan.md untuk satu jalan. `v2Dir` dipakai untuk tautan editor. */
export function susunLaporan(
  r: RunResult,
  opsi: { v2Dir?: string | null; webUrl?: string } = {},
): string {
  const v2Dir = opsi.v2Dir ?? null
  const k = kpiJalan(r)
  const db = r.pemeriksaan
  const ui = r.pemeriksaanUi
  const out: string[] = [
    `# Laporan jalan: ${r.title}`,
    '',
    `- **Skenario:** \`${r.path}\` (task ${r.task})`,
    `- **Jalan:** \`${r.run_id}\` · ${r.started_at ? r.started_at.slice(0, 16).replace('T', ' ') : '–'} · ${r.headed ? 'headed' : 'headless'}${r.from_step ? ` · mulai di langkah ${r.from_step + 1}` : ''}`,
    `- **Hasil:** **${label(r.status)}**${r.error ? ` — ${r.error}` : ''}${r.cleanup_error ? ` · pembersihan: ${r.cleanup_error}` : ''}`,
    '',
    '## KPI',
    '',
    '| Langkah lulus | Pelanggaran DB | Pelanggaran UI | Temuan DOM | Durasi |',
    '|---|---|---|---|---|',
    `| ${k.langkahLulus}/${k.langkahTotal} | ${db ? (db.status === 'tidak_dikonfigurasi' ? 'tidak dikonfigurasi' : `${k.dbBaru} baru · ${k.dbLama} lama`) : '–'} | ${ui ? (ui.status === 'tidak_dikonfigurasi' ? 'tidak dikonfigurasi' : `${k.uiBaru} baru · ${k.uiLama} lama`) : '–'} | ${ui && ui.status !== 'tidak_dikonfigurasi' ? k.dom : '–'} | ${durasi(k.durasiMs)} |`,
    '',
    '## Langkah',
    '',
    '| # | Langkah | Status | URL | UI | DB | Request tulis |',
    '|---|---|---|---|---|---|---|',
  ]
  for (const s of r.steps) {
    const url = s.ui?.url ? new URL(s.ui.url).pathname : ''
    out.push(
      `| ${s.n} | ${sel(s.title)}${s.error ? `<br>✕ ${sel(s.error)}` : ''} | ${label(s.status)} | ${url ? `\`${sel(url)}\`` : '–'} | ${sel(selUi(s))} | ${sel(selDb(s))} | ${selReq(s)} |`,
    )
  }
  out.push('')

  out.push('## Pelanggaran UI baru', '')
  if (!ui || ui.status === 'tidak_dikonfigurasi')
    out.push(`_Pemeriksaan UI tidak dikonfigurasi${ui?.pesan ? ` (${ui.pesan})` : ''}._`, '')
  else if (!ui.baru.length) out.push('_Tidak ada pelanggaran statis yang melebihi baseline._', '')
  else for (const g of ui.baru) out.push(...kelompokStatis(g, v2Dir))
  if (ui && ui.status !== 'tidak_dikonfigurasi') {
    out.push('### Temuan DOM (peringatan, tidak menggagalkan)', '')
    if (!ui.dom.length) out.push('_Tidak ada._', '')
    else {
      for (const d of ui.dom)
        out.push(`- **${d.aturan}**: ${d.jumlah} elemen · langkah ${d.langkah.join(', ')}`)
      out.push('')
      for (const s of r.steps) {
        const t = s.ui?.dom?.temuan ?? []
        if (!t.length) continue
        out.push(
          `Langkah ${s.n}${s.ui?.shotUi ? ` — screenshot bersorot \`${s.ui.shotUi}\`` : ''}:`,
          '',
        )
        for (const x of t.slice(0, 15))
          out.push(
            `- \`${x.aturan}\` ${x.selector} — ${x.pesan}${x.jumlah > 1 ? ` (×${x.jumlah})` : ''}`,
          )
        if (t.length > 15) out.push(`- … ${t.length - 15} temuan lagi`)
        out.push('')
      }
    }
    if (ui.galat.length)
      out.push('Galat UI:', '', ...ui.galat.map((g) => `- langkah ${g.langkah}: ${g.pesan}`), '')
    if (ui.dilewati.length)
      out.push(
        'Dilewati (abaikanHalaman):',
        '',
        ...ui.dilewati.map((d) => `- langkah ${d.langkah}: \`${d.url}\``),
        '',
      )
  }

  out.push('## Pelanggaran DB baru', '')
  if (!db || db.status === 'tidak_dikonfigurasi')
    out.push(`_Pemeriksaan DB tidak dikonfigurasi${db?.pesan ? ` (${db.pesan})` : ''}._`, '')
  else if (!db.baru.length)
    out.push(
      `_Tidak ada. Semua invarian lulus (${db.diperiksa} diperiksa).${db.status === 'galat' ? ` Galat: ${db.galat.map((g) => `${g.id} ${g.pesan}`).join('; ')}` : ''}_`,
      '',
    )
  else for (const it of db.baru) out.push(...itemDb(it, r))

  out.push('## Diff dokumen per langkah', '')
  let adaDiff = false
  for (const s of r.steps) {
    const d = s.db?.dokumen ?? []
    if (!d.length) continue
    adaDiff = true
    out.push(`- Langkah ${s.n}: ${d.map((x) => teksDiff(ringkasDiff(x))).join('; ')}`)
  }
  if (adaDiff) out.push('')
  else out.push('_Tidak ada dokumen yang diikuti berubah._', '')

  out.push('## Sudah ada sebelumnya (ringkas)', '')
  const lamaUi = ui?.sudahAda ?? []
  const lamaDb = db?.sudahAda ?? []
  if (!lamaUi.length && !lamaDb.length && !(ui?.baru.some((g) => g.baseline) ?? false))
    out.push('_Tidak ada._', '')
  else {
    if (lamaUi.length || ui?.baru.some((g) => g.baseline))
      out.push(
        `UI: ${k.uiLama} pelanggaran statis sudah ada di baseline — ${[...lamaUi.map((g) => `${g.rule} ${g.file} (${g.jumlah})`), ...(ui?.baru ?? []).filter((g) => g.baseline).map((g) => `${g.rule} ${g.file} (${g.baseline} lama)`)].join(', ')}`,
        '',
      )
    if (lamaDb.length)
      out.push(`DB: ${lamaDb.map((i) => `${i.id} (${i.baris.length} baris)`).join(', ')}`, '')
  }
  if (db?.dilewati.length)
    out.push(`Invarian dilewati: ${db.dilewati.map((d) => `${d.id} (${d.alasan})`).join(', ')}`, '')
  if (r.findings.length) {
    out.push('## Temuan yang dicatat', '')
    for (const f of r.findings)
      out.push(`- [${f.jenis}] langkah ${f.step_n ?? '-'}: ${sel(f.note)}`)
    out.push('')
  }
  out.push(
    `_Bukti: \`runs/${r.run_id}/\` (result.json, screenshot per langkah dan *-ui.png bersorot, trace.zip)._`,
    '',
  )
  return out.join('\n')
}

import { describe, expect, it } from 'vitest'
import { susunLaporan } from '../src/core/laporan.ts'
import {
  anonimPath,
  catatanRequest,
  PencatatRequest,
  pathApi,
  terbaruDulu,
} from '../src/core/requests.ts'
import type { RequestTulis, RunResult, UiLangkah } from '../src/core/run-types.ts'
import { SkenarioSchema } from '../src/core/skema.ts'
import { ringkasUi, statusLangkah, teksUiLangkah } from '../src/pemeriksaan/ui.ts'
import {
  normalisasiWarna,
  turunanToken,
  uraiToken,
  uraiWarna,
  warnaSah,
} from '../src/pemeriksaan/ui-dom.ts'
import {
  bandingBaseline,
  jumlahBaru,
  jumlahLama,
  uraiBaseline,
  uraiKeluaran,
} from '../src/pemeriksaan/ui-statis.ts'

const v = (file: string, rule: string, line: number) => ({
  file,
  line,
  col: 3,
  rule,
  message: `${rule} di ${line}`,
})

describe('uraiKeluaran (check:design --json)', () => {
  it('membaca bentuk route', () => {
    const k = uraiKeluaran(
      JSON.stringify({
        mode: 'route',
        route: { pathname: '/x/1', pattern: '/x/$id', page: 'src/X.tsx' },
        files: ['src/X.tsx', 'src/Y.tsx'],
        violations: [v('src/X.tsx', 'sx-tema', 4)],
        totals: { 'sx-tema': 1 },
        elapsed_ms: 120,
      }),
    )
    expect(k.route?.pattern).toBe('/x/$id')
    expect(k.files).toHaveLength(2)
    expect(k.violations[0]).toMatchObject({ file: 'src/X.tsx', line: 4, rule: 'sx-tema' })
  })
  it('rute tidak cocok: pattern null, files kosong', () => {
    const k = uraiKeluaran(
      '{"mode":"route","route":{"pathname":"/zz","pattern":null,"page":null},"files":[],"violations":[],"totals":{},"elapsed_ms":3}',
    )
    expect(k.route?.pattern).toBeNull()
    expect(k.violations).toEqual([])
  })
  it('menolak bukan JSON dan bentuk salah', () => {
    expect(() => uraiKeluaran('$ bun scripts/check-design.ts')).toThrow(/bukan JSON/)
    expect(() => uraiKeluaran('{"mode":"route"}')).toThrow(/tanpa violations/)
    expect(() => uraiKeluaran('{"violations":[{"file":"a","line":"x"}]}')).toThrow(/line/)
  })
})

describe('bandingBaseline', () => {
  const base = uraiBaseline(
    JSON.stringify({ version: 1, files: { 'src/A.tsx': { 'sx-tema': 2, 'hex-mentah': 1 } } }),
  )
  it('jumlah ≤ baseline = sudah ada, kelebihan = baru dengan semua baris', () => {
    const { baru, sudahAda } = bandingBaseline(
      [
        v('src/A.tsx', 'sx-tema', 30),
        v('src/A.tsx', 'sx-tema', 10),
        v('src/A.tsx', 'sx-tema', 20),
        v('src/A.tsx', 'hex-mentah', 5),
        v('src/B.tsx', 'grid2', 1),
      ],
      base,
    )
    expect(sudahAda.map((g) => `${g.file}:${g.rule}`)).toEqual(['src/A.tsx:hex-mentah'])
    expect(baru.map((g) => [g.file, g.rule, g.jumlah, g.baseline, g.baru])).toEqual([
      ['src/A.tsx', 'sx-tema', 3, 2, 1],
      ['src/B.tsx', 'grid2', 1, 0, 1],
    ])
    // Semua baris pasangan ditampilkan, terurut, karena baseline tidak menyimpan posisi.
    expect(baru[0]?.baris.map((b) => b.line)).toEqual([10, 20, 30])
    expect(baru[0]?.pasal).toBe('§1, §7.2')
    expect(jumlahBaru(baru)).toBe(2)
    expect(jumlahLama(sudahAda)).toBe(1)
  })
  it('berkurang dari baseline tetap sudah ada; aturan nonaktif dibuang', () => {
    const { baru, sudahAda } = bandingBaseline(
      [v('src/A.tsx', 'sx-tema', 1), v('src/C.tsx', 'grid2', 1)],
      base,
      ['grid2'],
    )
    expect(baru).toEqual([])
    expect(sudahAda).toHaveLength(1)
  })
  it('tanpa baseline semuanya baru', () => {
    expect(bandingBaseline([v('src/A.tsx', 'sx-tema', 1)], null).baru).toHaveLength(1)
  })
})

describe('warna dan token', () => {
  const token = uraiToken(
    `export const brand = { yellow: '#FFDB0E', ink: '#1A1D21', soft: 'rgba(255,219,14,0.14)' }
     export const status = { error: '#E5484D' }
     export const radius = { sm: 8, md: 12, lg: 16 } as const`,
    `divider: 'rgba(26,29,33,0.10)'`,
  )
  const set = new Set(token.warna)
  it('mengurai token dan radius', () => {
    expect(token.warna).toEqual(
      expect.arrayContaining(['rgb(255,219,14)', 'rgb(26,29,33)', 'rgb(229,72,77)', 'rgb(0,0,0)']),
    )
    expect(token.radius).toEqual([0, 8, 12, 16])
    // palette.light/dark MUI ikut sebagai dasar turunan
    expect(token.basis.length).toBeGreaterThan(token.warna.length)
  })
  it('normalisasi hex/rgb/rgba ke rgb tanpa alpha', () => {
    expect(normalisasiWarna('#ffdb0e')).toBe('rgb(255,219,14)')
    expect(normalisasiWarna('#fd0')).toBe('rgb(255,221,0)')
    expect(normalisasiWarna('rgba(26, 29, 33, 0.5)')).toBe('rgb(26,29,33)')
    expect(normalisasiWarna('rgb(26 29 33 / 50%)')).toBe('rgb(26,29,33)')
    expect(uraiWarna('#11223380')?.a).toBeCloseTo(0.5, 1)
    expect(normalisasiWarna('currentcolor')).toBeNull()
  })
  it('sah: token, token beralpha, hitam/putih beralpha, transparan; tidak sah: warna asing', () => {
    expect(warnaSah('rgb(255, 219, 14)', set)).toBe(true)
    expect(warnaSah('rgba(255, 219, 14, 0.3)', set)).toBe(true)
    expect(warnaSah('rgba(0, 0, 0, 0.04)', set)).toBe(true)
    expect(warnaSah('rgba(0, 0, 0, 0)', set)).toBe(true)
    expect(warnaSah('rgb(156, 39, 176)', set)).toBe(false)
    expect(warnaSah('rgb(25, 118, 210)', set, token.basis)).toBe(false)
  })
  it('turunan lighten/darken satu token diterima, toleransi ±6', () => {
    // Alert standard error: lighten(#E5484D, 0.9) dan darken(#E5484D, 0.6)
    expect(turunanToken([252, 237, 237], [229, 72, 77])).toBe(true)
    expect(turunanToken([92, 29, 31], [229, 72, 77])).toBe(true)
    expect(turunanToken([231, 70, 79], [229, 72, 77])).toBe(true)
    // Koefisien berbeda antar kanal = bukan turunan
    expect(turunanToken([229, 200, 77], [229, 72, 77])).toBe(false)
  })
})

describe('pencatat request', () => {
  it('path API, anonimisasi UUID, filter metode dan auth', () => {
    expect(pathApi('http://localhost:5173/api/v1/inventory/x?y=1')).toBe('/inventory/x')
    expect(pathApi('http://localhost:5173/assets/a.js')).toBeNull()
    expect(anonimPath('/mr/f702f915-7cd5-4f0d-9a5b-4f630c54e5d1/issue')).toBe('/mr/{id}/issue')
    const dasar = { status: 200, durasiMs: 5, sumber: 'browser' as const }
    expect(catatanRequest({ ...dasar, method: 'GET', url: 'http://h/api/v1/x' })).toBeNull()
    expect(
      catatanRequest({ ...dasar, method: 'POST', url: 'http://h/api/v1/auth/refresh' }),
    ).toBeNull()
    expect(
      catatanRequest({
        ...dasar,
        method: 'POST',
        url: 'http://h/api/v1/platform/companies/a/members/b/impersonate',
      }),
    ).toBeNull()
    const r = catatanRequest({
      ...dasar,
      method: 'patch',
      url: 'http://h/api/v1/wo/f702f915-7cd5-4f0d-9a5b-4f630c54e5d1',
    })
    expect(r).toMatchObject({
      method: 'PATCH',
      path: '/wo/{id}',
      pathAsli: '/wo/f702f915-7cd5-4f0d-9a5b-4f630c54e5d1',
    })
  })
  it('mencatat per langkah aktif, urut waktu; tidak mencatat di luar langkah', () => {
    const per = new Map<number, RequestTulis[]>()
    const p = new PencatatRequest((n, r) => per.set(n, [...(per.get(n) ?? []), r]))
    const kirim = (path: string) =>
      p.dariApi({ method: 'POST', url: `http://h/api/v1${path}`, status: 201, durasiMs: 3 })
    kirim('/siapkan')
    p.aktif(1)
    kirim('/a')
    kirim('/b')
    p.aktif(2)
    kirim('/c')
    p.aktif(null)
    kirim('/bersihkan')
    expect([...per.keys()]).toEqual([1, 2])
    expect(per.get(1)?.map((r) => r.path)).toEqual(['/a', '/b'])
    expect(per.get(1)?.[0]?.sumber).toBe('api')
    const t = (w: string, path: string) => ({
      ...(per.get(1)?.[0] as RequestTulis),
      waktu: w,
      path,
    })
    expect(
      terbaruDulu([t('2026-01-01T00:00:01Z', 'x'), t('2026-01-01T00:00:02Z', 'y')]).map(
        (r) => r.path,
      ),
    ).toEqual(['y', 'x'])
  })
})

describe('skema pemeriksaanUi', () => {
  const dasar = SkenarioSchema.shape
  const cek = (pemeriksaanUi: unknown) => dasar.pemeriksaanUi.safeParse(pemeriksaanUi).success
  it('menerima aturan yang dikenal dengan alasan', () => {
    expect(
      cek({
        nonaktif: ['radius-menyimpang', 'sx-tema'],
        alasan: 'Halaman prototipe yang belum direvamp.',
      }),
    ).toBe(true)
    expect(
      cek({
        abaikanHalaman: ['/tires/used'],
        alasan: 'Prototipe dengan data contoh, bukan halaman nyata.',
      }),
    ).toBe(true)
    expect(cek(undefined)).toBe(true)
  })
  it('menolak tanpa alasan, alasan pendek, aturan asing, path tidak sah', () => {
    expect(cek({ nonaktif: ['radius-menyimpang'] })).toBe(false)
    expect(cek({ nonaktif: ['radius-menyimpang'], alasan: 'pendek' })).toBe(false)
    expect(cek({ nonaktif: ['tidak-ada'], alasan: 'alasan yang cukup panjang di sini' })).toBe(
      false,
    )
    expect(
      cek({ abaikanHalaman: ['tires/used'], alasan: 'alasan yang cukup panjang di sini' }),
    ).toBe(false)
  })
})

const uiLangkah = (p: Partial<UiLangkah>): UiLangkah => ({
  status: 'ok',
  url: 'http://localhost:5173/x/1',
  pattern: '/x/$id',
  page: 'src/X.tsx',
  statis: { berkas: 3, baru: [], sudahAda: [], durasiMs: 300, cache: false },
  dom: { temuan: [], evalMs: 4, durasiMs: 40, elemen: 100, terpotong: false },
  shotUi: null,
  galat: [],
  ...p,
})
const kelompokBaru = bandingBaseline([v('src/X.tsx', 'sx-tema', 12)], null).baru

describe('ringkasUi dan status', () => {
  it('statis baru = pelanggaran, DOM saja = peringatan', () => {
    expect(
      statusLangkah(
        uiLangkah({
          statis: { berkas: 1, baru: kelompokBaru, sudahAda: [], durasiMs: 1, cache: false },
        }),
      ),
    ).toBe('pelanggaran')
    const dom = {
      temuan: [
        {
          aturan: 'radius-menyimpang',
          pesan: 'p',
          selector: 'div',
          bbox: { x: 0, y: 0, w: 1, h: 1 },
          nilai: '5px',
          jumlah: 2,
        },
      ],
      evalMs: 1,
      durasiMs: 1,
      elemen: 1,
      terpotong: false,
    }
    expect(statusLangkah(uiLangkah({ dom }))).toBe('peringatan')
    expect(teksUiLangkah(uiLangkah({ status: 'peringatan', dom }))).toMatch(/^! UI 2 temuan DOM/)
    expect(teksUiLangkah(uiLangkah({}))).toBe('✓ UI ok (3 berkas, 0 DOM)')
  })
  it('kelompok statis yang sama di dua langkah dihitung sekali, langkah pertama', () => {
    const statis = { berkas: 1, baru: kelompokBaru, sudahAda: [], durasiMs: 1, cache: false }
    const h = ringkasUi(
      [
        { n: 2, u: uiLangkah({ status: 'pelanggaran', statis: { ...statis, cache: true } }) },
        { n: 1, u: uiLangkah({ status: 'pelanggaran', statis }) },
        { n: 3, u: uiLangkah({ status: 'dilewati' }) },
      ],
      {
        durasiMs: 1,
        statis: { jumlah: 1, rataMs: 1, cache: 1 },
        domWaktu: { jumlah: 2, rataEvalMs: 1, rataMs: 1 },
      },
    )
    expect(h.status).toBe('pelanggaran')
    expect(h.baru).toHaveLength(1)
    expect(h.baru[0]?.langkah).toBe(1)
    expect(h.dilewati).toEqual([{ langkah: 3, url: 'http://localhost:5173/x/1' }])
  })
})

describe('susunLaporan', () => {
  const r: RunResult = {
    run_id: 'contoh/2026-11-13T10-00-00',
    scenario: 'contoh',
    task: 'FMS-1',
    path: 'scenarios/FMS-1/contoh.json',
    title: 'Contoh skenario',
    estimasi: '3 menit',
    file_mtime: '2026-11-13T09:00:00.000Z',
    headed: false,
    status: 'selesai',
    started_at: '2026-11-13T10:00:00.000Z',
    ended_at: '2026-11-13T10:01:05.000Z',
    duration_ms: 65_000,
    from_step: 0,
    data_from: null,
    current_step: null,
    current_aksi: null,
    last_shot: null,
    error: null,
    steps: [
      {
        n: 1,
        id: 'buka',
        title: 'Wati membuka MR',
        expect: 'Detail MR tampil',
        who: 'mbl.storekeeper',
        who_name: 'Wati',
        belakang: false,
        reach: true,
        status: 'lulus',
        ms: 5000,
        error: null,
        shot: '01-1-buka.png',
        aksi: [],
        ui: uiLangkah({
          status: 'pelanggaran',
          statis: {
            berkas: 27,
            baru: bandingBaseline(
              [{ ...v('src/X.tsx', 'sx-tema', 12), cuplikan: "sx={{ color: '#f00' }}" }],
              null,
            ).baru,
            sudahAda: [],
            durasiMs: 300,
            cache: false,
          },
        }),
        db: {
          status: 'pelanggaran',
          pelanggaran: [
            {
              id: 'stok-available',
              judul: 'Stok tersedia',
              keterangan: 'ket',
              baris: [{ gudang: 'WH', sku: 'S1' }],
              langkah: 1,
            },
          ],
          sembuh: [],
          dokumen: [
            {
              label: 'mr',
              tabel: 'material_requests',
              jenis: 'berubah',
              perubahan: [{ kolom: 'status', dari: 'DRAFT', ke: 'PENDING' }],
            },
          ],
          galat: [],
          durasiMs: 120,
        },
        requests: [
          {
            method: 'POST',
            path: '/mr/{id}/submit',
            pathAsli: '/mr/1/submit',
            status: 200,
            durasiMs: 30,
            waktu: '2026-11-13T10:00:03.000Z',
            sumber: 'browser',
          },
          {
            method: 'POST',
            path: '/mr/{id}/issue',
            pathAsli: '/mr/1/issue',
            status: 200,
            durasiMs: 40,
            waktu: '2026-11-13T10:00:04.000Z',
            sumber: 'api',
          },
        ],
      },
    ],
    findings: [],
    pemeriksaan: {
      status: 'pelanggaran',
      baru: [
        {
          id: 'stok-available',
          judul: 'Stok tersedia',
          keterangan: 'ket',
          baris: [{ gudang: 'WH', sku: 'S1' }],
          langkah: 1,
        },
      ],
      sudahAda: [
        { id: 'wo-nilai', judul: 'Total WO', keterangan: 'k', baris: [{ wo_number: 'WO-1' }] },
      ],
      dilewati: [],
      galat: [],
      diperiksa: 9,
      durasiMs: 10,
    },
    pemeriksaanUi: {
      status: 'pelanggaran',
      baru: bandingBaseline([v('src/X.tsx', 'sx-tema', 12)], null).baru.map((g) => ({
        ...g,
        langkah: 1,
      })),
      sudahAda: [],
      dom: [],
      dilewati: [],
      galat: [],
      statis: { jumlah: 1, rataMs: 300, cache: 0 },
      domWaktu: { jumlah: 1, rataEvalMs: 4, rataMs: 40 },
      durasiMs: 5,
    },
  }
  it('menyusun KPI, tabel langkah, pelanggaran UI/DB, tersangka, diff', () => {
    expect(susunLaporan(r, { v2Dir: '/v2' })).toMatchSnapshot()
  })
})

import { describe, expect, test } from 'vitest'
import {
  cincinTarget,
  kartuLangkah,
  petaLangkah,
  pudar,
  relLangkah,
  statusLangkah,
} from '../panel/js/komponen.js'
import { aksiPintasan, sedangMengetik } from '../panel/js/pintasan.js'

type Step = Record<string, unknown>
const langkah = (n: number, status: string, extra: Step = {}): Step => ({
  n,
  title: `Langkah ${n}`,
  expect: `Harus terlihat ${n}`,
  who_name: 'Putri (Planner)',
  deskripsi: null,
  status,
  ms: 7000,
  error: null,
  aksi: [],
  belakang: false,
  perangkat: 'laptop',
  ...extra,
})

describe('rel langkah', () => {
  const steps = [
    langkah(1, 'lulus'),
    langkah(2, 'berjalan'),
    langkah(3, 'gagal'),
    langkah(4, 'dihentikan'),
    langkah(5, 'dilompati'),
    langkah(6, 'menunggu'),
    langkah(7, 'menunggu'),
  ]

  test('semua status punya kelas dan label teks (bukan warna saja)', () => {
    const h = relLangkah(steps)
    for (const [n, s] of [
      [1, 'lulus'],
      [2, 'aktif-jalan'],
      [3, 'gagal'],
      [4, 'dihentikan'],
      [5, 'dilewati'],
      [6, 'menunggu'],
    ])
      expect(h).toContain(`s-${s}" data-n="${n}"`)
    expect(h).toContain('aria-label="Langkah 1, lulus"')
    expect(h).toContain('aria-label="Langkah 2, berjalan"')
    expect(h).toContain('aria-label="Langkah 3, gagal"')
  })

  test('aktif oranye saat jeda, putih saat berjalan', () => {
    expect(relLangkah(steps, { jeda: true })).toContain('s-aktif-jeda" data-n="2"')
    expect(statusLangkah({ status: 'berjalan' })).toBe('aktif-jalan')
    expect(relLangkah(steps, { jeda: true })).toContain('aria-label="Langkah 2, dijeda"')
  })

  test('yang menunggu makin pudar ke bawah (0,85 → 0,58)', () => {
    expect(pudar(0, 5)).toBe(0.85)
    expect(pudar(4, 5)).toBe(0.58)
    const h = relLangkah([langkah(1, 'menunggu'), langkah(2, 'menunggu'), langkah(3, 'menunggu')])
    expect(h.match(/opacity:([\d.]+)/g)).toEqual(['opacity:0.85', 'opacity:0.72', 'opacity:0.58'])
  })

  test('laporan: hasil kustom dan langkah terpilih', () => {
    const h = relLangkah(steps, { pilih: 3, hasil: (s: Step) => (s.n === 3 ? 'gagal' : 'lulus') })
    expect(h).toContain('s-gagal pilih" data-n="3"')
    expect(h).not.toContain('s-menunggu')
  })

  test('peta langkah: judul, status, daftar aksi langkah aktif', () => {
    const s2 = langkah(2, 'berjalan', {
      aksi: [
        { teks: 'Buka /x', status: 'selesai' },
        { teks: 'Klik tombol “Ajukan”', status: 'berjalan' },
      ],
    })
    const h = petaLangkah([langkah(1, 'lulus'), s2, langkah(3, 'menunggu')], {
      jeda: true,
      aksi: { teks: 'Klik tombol “Ajukan”' },
    })
    expect(h).toContain('Peta langkah')
    expect(h).toContain('Lulus · 7 dtk')
    expect(h).toContain('Dijeda · sebelum klik tombol “Ajukan”')
    expect(h).toContain('peta-aksi')
  })
})

describe('kartu deskripsi langkah per keadaan jalan', () => {
  const run = (status: string, extra: Step = {}) => ({
    run_id: 'x/1',
    title: 'Permintaan barang',
    status,
    started_at: '2026-11-14T10:00:00Z',
    duration_ms: 252_000,
    from_step: 0,
    current_step: null as number | null,
    current_aksi: null as number | null,
    findings: [],
    steps: [langkah(1, 'lulus'), langkah(2, 'menunggu'), langkah(3, 'menunggu')],
    ...extra,
  })
  const aktif = (status: string) =>
    run(status, {
      current_step: 1,
      current_aksi: 0,
      steps: [
        langkah(1, 'lulus'),
        langkah(2, 'berjalan', {
          deskripsi: 'Wati menekan Ajukan.',
          aksi: [{ teks: 'Klik tombol “Ajukan”', status: 'berjalan' }],
        }),
        langkah(3, 'menunggu', { belakang: true }),
      ],
    })

  test('berjalan: chip Berjalan, aksi yang sedang jalan, kartu berikutnya', () => {
    const h = kartuLangkah(aktif('berjalan'))
    expect(h).toContain('st-chip run">Berjalan')
    expect(h).toContain('Langkah 2 · Putri (Planner)')
    expect(h).toContain('<p>Wati menekan Ajukan.</p>')
    expect(h).toContain('Harus terlihat 2')
    expect(h).toContain('Sedang: klik tombol “Ajukan”')
    expect(h).toContain('Berikutnya: Langkah 3')
    expect(h).toContain('>API<')
  })

  test('dijeda: chip Dijeda dan aksi berikutnya + Spasi', () => {
    const h = kartuLangkah(aktif('jeda'))
    expect(h).toContain('st-chip warn">Dijeda')
    expect(h).toContain('Aksi berikutnya: klik tombol “Ajukan”')
    expect(h).toContain('<kbd>Spasi</kbd>')
  })

  test('satu aksi: chip Satu aksi sesaat', () => {
    expect(kartuLangkah(aktif('jeda'), { satuAksi: true })).toContain('st-chip info">Satu aksi')
  })

  test('tanpa deskripsi: paragraf tidak ditampilkan (kosong rapi)', () => {
    const h = kartuLangkah(run('berjalan', { current_step: 1 }))
    expect(h).not.toContain('<p>')
  })

  test('gagal: pesan galat dan tautan laporan', () => {
    const h = kartuLangkah(
      run('gagal', {
        steps: [
          langkah(1, 'lulus'),
          langkah(2, 'gagal', {
            error: 'aksi 3: tidak terpenuhi',
            aksi: [{ teks: 'Periksa x', status: 'gagal' }],
          }),
          langkah(3, 'menunggu'),
        ],
      }),
      { hrefLaporan: '#/laporan/x/1' },
    )
    expect(h).toContain('st-chip bad">Gagal')
    expect(h).toContain('Gagal di langkah 2')
    expect(h).toContain('aksi 3: tidak terpenuhi')
    expect(h).toContain('href="#/laporan/x/1"')
    expect(h).not.toContain('Berikutnya:')
  })

  test('selesai: ringkasan singkat dan tautan laporan', () => {
    const h = kartuLangkah(
      run('selesai', { steps: [langkah(1, 'lulus'), langkah(2, 'lulus'), langkah(3, 'lulus')] }),
      { hrefLaporan: '#/laporan/x/1' },
    )
    expect(h).toContain('st-chip ok">Selesai')
    expect(h).toContain('Lulus 3/3 langkah')
    expect(h).toContain('4 mnt 12 dtk')
    expect(h).toContain('Lihat laporan')
  })

  test('menyiapkan dan siap', () => {
    expect(
      kartuLangkah(run('menyiapkan', { started_at: null }), { logTerakhir: 'Siapkan: x' }),
    ).toContain('Siapkan: x')
    expect(kartuLangkah(run('siap', { started_at: null }))).toContain('Data siap')
  })
})

describe('cincin target', () => {
  test('bbox relatif → persen; pil untuk sasaran pendek', () => {
    const c = cincinTarget({
      bbox: { x: 0.5, y: 0.25, w: 0.1, h: 0.05 },
      viewport: { w: 1280, h: 800 },
    })
    expect(c).toEqual({ left: '50%', top: '25%', width: '10%', height: '5%', radius: '999px' })
    expect(cincinTarget(null)).toBeNull()
    expect(cincinTarget({ bbox: { x: 0, y: 0, w: 0, h: 0 } })).toBeNull()
  })
})

describe('pintasan keyboard', () => {
  const tombol = (key: string, target: Step = { tag: 'BODY' }, mod: Step = {}) => ({
    key,
    ctrl: false,
    meta: false,
    alt: false,
    shift: false,
    target,
    ...mod,
  })
  const k = { halaman: 'jalan', peta: false, fokus: false }

  test('pemetaan pintasan', () => {
    expect(aksiPintasan(tombol(' '), k)).toBe('jeda-lanjut')
    expect(aksiPintasan(tombol('ArrowRight'), k)).toBe('satu-aksi')
    expect(aksiPintasan(tombol('t'), k)).toBe('fokus-temuan')
    expect(aksiPintasan(tombol('F'), k)).toBe('fokus-layar')
    expect(aksiPintasan(tombol('['), k)).toBe('peta')
  })

  test('Esc menutup peta atau keluar fokus, bukan Hentikan', () => {
    expect(aksiPintasan(tombol('Escape'), { ...k, peta: true })).toBe('tutup-peta')
    expect(aksiPintasan(tombol('Escape'), { ...k, fokus: true })).toBe('keluar-fokus')
    expect(aksiPintasan(tombol('Escape'), k)).toBeNull()
    expect(aksiPintasan(tombol('Escape', { tag: 'BODY' }, { shift: true }), k)).toBeNull()
  })

  test('tidak aktif saat mengetik', () => {
    for (const target of [
      { tag: 'INPUT', id: 'temuan' },
      { tag: 'TEXTAREA' },
      { tag: 'SELECT' },
      { tag: 'DIV', editable: true },
    ]) {
      expect(sedangMengetik(target)).toBe(true)
      for (const key of [' ', 'ArrowRight', 't', 'f', '['])
        expect(aksiPintasan(tombol(key, target), k)).toBeNull()
    }
  })

  test('Ctrl/⌘↩ menyimpan hanya di input temuan; Esc melepas isian', () => {
    const inp = { tag: 'INPUT', id: 'temuan' }
    expect(aksiPintasan(tombol('Enter', inp, { ctrl: true }), k)).toBe('simpan-temuan')
    expect(aksiPintasan(tombol('Enter', inp, { meta: true }), k)).toBe('simpan-temuan')
    expect(aksiPintasan(tombol('Enter', inp), k)).toBeNull()
    expect(aksiPintasan(tombol('Enter', { tag: 'INPUT', id: 'q' }, { ctrl: true }), k)).toBeNull()
    expect(aksiPintasan(tombol('Escape', inp), k)).toBe('lepas-isian')
  })

  test('Spasi di tombol dibiarkan; pintasan hanya di layar jalan; tanpa modifier', () => {
    expect(aksiPintasan(tombol(' ', { tag: 'BUTTON' }), k)).toBeNull()
    expect(aksiPintasan(tombol(' '), { ...k, halaman: 'riwayat' })).toBeNull()
    expect(aksiPintasan(tombol('f', { tag: 'BODY' }, { ctrl: true }), k)).toBeNull()
  })
})

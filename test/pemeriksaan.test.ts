import { describe, expect, it } from 'vitest'
import { cariDbUrl, hostDbUrl, pastikanDbLokal } from '../src/core/db.ts'
import { SkenarioSchema } from '../src/core/skema.ts'
import { bandingkan, barisBaru, barisNaik, kunciBaris, sekali } from '../src/pemeriksaan/banding.ts'
import { INVARIAN, INVARIAN_IDS, type Invarian } from '../src/pemeriksaan/invarian.ts'

const inv: Invarian = {
  id: 'uji',
  judul: 'Uji',
  keterangan: 'uji',
  sql: 'SELECT 1',
  kolomKunci: ['gudang', 'sku'],
  tabel: [],
}
const naik: Invarian = {
  ...inv,
  id: 'naik',
  mode: 'kenaikan',
  kolomKunci: ['tabel'],
  kolomAngka: ['n_tup_upd', 'n_tup_del'],
}
const snap = (
  hasil: { id: string; baris?: Record<string, unknown>[]; dilewati?: string; galat?: string }[],
) => ({
  waktu: '2026-01-01T00:00:00Z',
  hasil,
})

describe('kunciBaris', () => {
  it('identitas dari kolomKunci saja, nilai lain diabaikan', () => {
    expect(kunciBaris({ gudang: 'A', sku: 'X', on_hand: '1' }, inv.kolomKunci)).toBe(
      kunciBaris({ gudang: 'A', sku: 'X', on_hand: '9' }, inv.kolomKunci),
    )
    expect(kunciBaris({ gudang: 'A', sku: 'X' }, inv.kolomKunci)).not.toBe(
      kunciBaris({ gudang: 'A', sku: 'Y' }, inv.kolomKunci),
    )
  })
  it('kolom hilang dan angka vs teks dibedakan dengan aman', () => {
    expect(kunciBaris({ gudang: 'A' }, inv.kolomKunci)).toBe(
      kunciBaris({ gudang: 'A', sku: undefined }, inv.kolomKunci),
    )
    expect(kunciBaris({ gudang: 'A', sku: 1 }, inv.kolomKunci)).toBe(
      kunciBaris({ gudang: 'A', sku: '1' }, inv.kolomKunci),
    )
  })
})

describe('barisBaru', () => {
  it('memisahkan pelanggaran baru dari yang sudah ada di baseline', () => {
    const baseline = [{ gudang: 'A', sku: 'X', on_hand: '1' }]
    const akhir = [
      { gudang: 'A', sku: 'X', on_hand: '2' },
      { gudang: 'A', sku: 'Y', on_hand: '3' },
    ]
    const r = barisBaru(inv, baseline, akhir)
    expect(r.sudahAda).toEqual([{ gudang: 'A', sku: 'X', on_hand: '2' }])
    expect(r.baru).toEqual([{ gudang: 'A', sku: 'Y', on_hand: '3' }])
  })
  it('pelanggaran yang hilang di akhir tidak dilaporkan', () => {
    const r = barisBaru(inv, [{ gudang: 'A', sku: 'X' }], [])
    expect(r).toEqual({ baru: [], sudahAda: [] })
  })
})

describe('barisNaik', () => {
  it('hanya kenaikan penghitung yang dilaporkan, dengan ringkasan kenaikan', () => {
    const baseline = [
      { tabel: 'ledger_entries', n_tup_upd: '0', n_tup_del: '0' },
      { tabel: 'audit_logs', n_tup_upd: '5', n_tup_del: '1' },
    ]
    const akhir = [
      { tabel: 'ledger_entries', n_tup_upd: '0', n_tup_del: '2' },
      { tabel: 'audit_logs', n_tup_upd: '5', n_tup_del: '1' },
    ]
    const r = barisNaik(naik, baseline, akhir)
    expect(r).toHaveLength(1)
    expect(r[0]?.tabel).toBe('ledger_entries')
    expect(r[0]?.kenaikan).toBe('n_tup_del 0 → 2')
  })
  it('tabel tanpa baseline dibandingkan dengan 0', () => {
    expect(barisNaik(naik, [], [{ tabel: 't', n_tup_upd: '0', n_tup_del: '0' }])).toEqual([])
    expect(barisNaik(naik, [], [{ tabel: 't', n_tup_upd: '1', n_tup_del: '0' }])).toHaveLength(1)
  })
})

describe('bandingkan', () => {
  const daftar = [inv, naik]
  it('lulus bila tidak ada baris baru; sudahAda dipisah', () => {
    const b0 = snap([
      { id: 'uji', baris: [{ gudang: 'A', sku: 'X' }] },
      { id: 'naik', baris: [] },
    ])
    const b1 = snap([
      { id: 'uji', baris: [{ gudang: 'A', sku: 'X' }] },
      { id: 'naik', baris: [] },
    ])
    const h = bandingkan(daftar, b0, b1, { durasiMs: 10 })
    expect(h.status).toBe('lulus')
    expect(h.diperiksa).toBe(2)
    expect(h.baru).toEqual([])
    expect(h.sudahAda.map((i) => [i.id, i.baris.length])).toEqual([['uji', 1]])
  })
  it('pelanggaran bila ada baris baru, termasuk kenaikan penghitung', () => {
    const b0 = snap([
      { id: 'uji', baris: [] },
      { id: 'naik', baris: [{ tabel: 't', n_tup_upd: '0', n_tup_del: '0' }] },
    ])
    const b1 = snap([
      { id: 'uji', baris: [{ gudang: 'B', sku: 'Z' }] },
      { id: 'naik', baris: [{ tabel: 't', n_tup_upd: '1', n_tup_del: '0' }] },
    ])
    const h = bandingkan(daftar, b0, b1, { durasiMs: 10 })
    expect(h.status).toBe('pelanggaran')
    expect(h.baru.map((i) => i.id)).toEqual(['uji', 'naik'])
  })
  it('nonaktif, dilewati, dan galat tidak dihitung sebagai diperiksa', () => {
    const b0 = snap([
      { id: 'uji', dilewati: 'tabel tidak ada' },
      { id: 'naik', baris: [] },
    ])
    const b1 = snap([
      { id: 'uji', dilewati: 'tabel tidak ada' },
      { id: 'naik', galat: 'rusak' },
    ])
    const h = bandingkan(daftar, b0, b1, { durasiMs: 1 })
    expect(h.status).toBe('galat')
    expect(h.diperiksa).toBe(0)
    expect(h.dilewati).toEqual([{ id: 'uji', judul: 'Uji', alasan: 'tabel tidak ada' }])
    expect(h.galat).toEqual([{ id: 'naik', judul: 'Uji', pesan: 'rusak' }])
    const h2 = bandingkan(daftar, b0, b1, { durasiMs: 1, nonaktif: ['naik'] })
    expect(h2.status).toBe('lulus')
    expect(h2.dilewati.map((d) => d.alasan)).toEqual(['tabel tidak ada', 'dinonaktifkan skenario'])
  })
  it('sekali (tanpa baseline) tidak pernah melaporkan pelanggaran baru', () => {
    const s = snap([
      { id: 'uji', baris: [{ gudang: 'A', sku: 'X' }] },
      { id: 'naik', baris: [{ tabel: 't', n_tup_upd: '3', n_tup_del: '0' }] },
    ])
    const h = sekali(daftar, s, { durasiMs: 1 })
    expect(h.status).toBe('lulus')
    expect(h.baru).toEqual([])
    expect(h.sudahAda.map((i) => [i.id, i.baris.length])).toEqual([
      ['uji', 1],
      ['naik', 1],
    ])
  })
})

describe('definisi invarian', () => {
  it('id unik, kolomKunci terisi, SQL hanya SELECT/WITH', () => {
    expect(new Set(INVARIAN_IDS).size).toBe(INVARIAN.length)
    for (const i of INVARIAN) {
      expect(i.kolomKunci.length).toBeGreaterThan(0)
      const q = (typeof i.sql === 'string' ? i.sql : i.sql(new Set(i.tabel))).trim()
      expect(q, i.id).toMatch(/^(SELECT|WITH)\b/i)
      expect(q, i.id).not.toMatch(/\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|CREATE|GRANT)\b/i)
      if (i.mode === 'kenaikan') expect(i.kolomAngka?.length).toBeGreaterThan(0)
    }
  })
  it('approval-yatim hanya memuat cabang yang tabelnya ada', () => {
    const y = INVARIAN.find((i) => i.id === 'approval-yatim')
    if (!y || typeof y.sql === 'string') throw new Error('approval-yatim harus SQL dinamis')
    const kosong = y.sql(new Set(['approval_requests']))
    expect(kosong).toContain('WHERE false')
    const satu = y.sql(new Set(['approval_requests', 'material_requests']))
    expect(satu).toContain("'MATERIAL_REQUEST'")
    expect(satu).not.toContain("'PURCHASE_ORDER'")
  })
})

describe('pagar host DB', () => {
  it('menerima localhost dan 127.0.0.1, membuang ?schema', () => {
    expect(pastikanDbLokal('postgresql://u:p@localhost:5432/fleetify?schema=public')).toBe(
      'postgresql://u:p@localhost:5432/fleetify',
    )
    expect(hostDbUrl('postgres://u:p@127.0.0.1/fleetify')).toBe('127.0.0.1')
  })
  it('menolak host lain dan URL bukan postgres', () => {
    expect(() => pastikanDbLokal('postgresql://u:p@db.staging.fleetify.id:5432/x')).toThrow(
      /ditolak/,
    )
    expect(() => pastikanDbLokal('postgresql://u:p@10.0.0.5:5432/x')).toThrow(/ditolak/)
    expect(() => pastikanDbLokal('mysql://localhost/x')).toThrow(/postgresql/)
    expect(() => pastikanDbLokal('bukan url')).toThrow(/tidak sah/)
  })
  it('cariDbUrl: V2_DATABASE_URL menang, tanpa apa pun = null, host asing tetap ditolak', () => {
    expect(cariDbUrl({ dbUrl: 'postgresql://u:p@localhost/a', backendDir: '/tidak/ada' })).toBe(
      'postgresql://u:p@localhost/a',
    )
    expect(cariDbUrl({ dbUrl: null, backendDir: '/tidak/ada' })).toBeNull()
    expect(cariDbUrl({})).toBeNull()
    expect(() => cariDbUrl({ dbUrl: 'postgresql://u:p@staging:5432/a' })).toThrow(/ditolak/)
  })
})

describe('skema: pemeriksaan di skenario', () => {
  const dasar = {
    slug: 'contoh',
    judul: 'Contoh skenario',
    tujuan: 'Membuktikan sesuatu yang terlihat di layar.',
    modul: 'pengadaan',
    tiket: ['FMS-1'],
    estimasi: '3 menit',
    persona: [{ siapa: 'mbl.storekeeper', peran: 'membuka halaman' }],
    data: ['Satu barang baru'],
    setelan: [],
    prasyarat: [],
    catatan: [],
    siapkan: [],
    langkah: [
      {
        id: 'buka',
        judul: 'Wati membuka barang',
        harusTerlihat: 'Detail barang tampil',
        aksi: [{ buka: '/inventory/items' }],
      },
    ],
  }
  it('opsional; sah bila nonaktif berisi id yang dikenal dan alasan ≥ 20 huruf', () => {
    expect(SkenarioSchema.safeParse(dasar).success).toBe(true)
    const r = SkenarioSchema.safeParse({
      ...dasar,
      pemeriksaan: {
        nonaktif: ['approval-yatim'],
        alasan: 'Skenario ini sengaja membatalkan dokumen saat request masih menunggu.',
      },
    })
    expect(r.success).toBe(true)
    expect(r.data?.pemeriksaan?.nonaktif).toEqual(['approval-yatim'])
  })
  it('ditolak: id tidak dikenal, nonaktif kosong, alasan hilang/pendek, field asing', () => {
    const alasan = 'Alasan yang cukup panjang untuk lolos validasi.'
    expect(
      SkenarioSchema.safeParse({ ...dasar, pemeriksaan: { nonaktif: ['tidak-ada'], alasan } })
        .success,
    ).toBe(false)
    expect(
      SkenarioSchema.safeParse({ ...dasar, pemeriksaan: { nonaktif: [], alasan } }).success,
    ).toBe(false)
    expect(
      SkenarioSchema.safeParse({ ...dasar, pemeriksaan: { nonaktif: ['wo-nilai'] } }).success,
    ).toBe(false)
    expect(
      SkenarioSchema.safeParse({
        ...dasar,
        pemeriksaan: { nonaktif: ['wo-nilai'], alasan: 'pendek' },
      }).success,
    ).toBe(false)
    expect(
      SkenarioSchema.safeParse({
        ...dasar,
        pemeriksaan: { nonaktif: ['wo-nilai'], alasan, ekstra: 1 },
      }).success,
    ).toBe(false)
  })
})

// Butuh DB nyata: hanya jalan bila V2_DATABASE_URL terisi (Vitest berjalan di Node, Bun.sql tidak ada,
// jadi yang diuji di sini adalah SQL tiap invarian lewat psql: harus bisa dieksekusi dalam READ ONLY).
describe.skipIf(!process.env.V2_DATABASE_URL)(
  'invarian terhadap DB nyata (V2_DATABASE_URL)',
  () => {
    it('semua SQL invarian dapat dieksekusi dalam transaksi READ ONLY', async () => {
      const { execFileSync } = await import('node:child_process')
      const url = pastikanDbLokal(process.env.V2_DATABASE_URL ?? '')
      const slug = process.env.TENANT_SLUG ?? 'mbl'
      const tabel = new Set(
        execFileSync(
          'psql',
          [
            url,
            '-At',
            '-c',
            "SELECT table_name FROM information_schema.tables WHERE table_schema='public'",
          ],
          {
            encoding: 'utf8',
          },
        )
          .trim()
          .split('\n'),
      )
      const cid = execFileSync(
        'psql',
        [url, '-At', '-c', `SELECT id FROM companies WHERE slug='${slug}'`],
        {
          encoding: 'utf8',
        },
      ).trim()
      expect(cid).toMatch(/^[0-9a-f-]{36}$/)
      for (const i of INVARIAN) {
        if (i.tabel.some((t) => !tabel.has(t))) continue
        const q = (typeof i.sql === 'string' ? i.sql : i.sql(tabel)).replaceAll('$1', `'${cid}'`)
        const out = execFileSync(
          'psql',
          [url, '-At', '-v', 'ON_ERROR_STOP=1', '-c', `BEGIN READ ONLY; ${q}; ROLLBACK;`],
          {
            encoding: 'utf8',
          },
        )
        expect(out, i.id).toContain('ROLLBACK')
      }
    })
  },
)

describe('atribusi per langkah', () => {
  const daftar = [inv, naik]
  const b = (rows: Record<string, unknown>[]) =>
    snap([
      { id: 'uji', baris: rows },
      { id: 'naik', baris: [] },
    ])
  it('pelanggaran diatribusikan ke langkah pertama muncul, yang sembuh dicatat, ringkasan akhir memuat keduanya', async () => {
    const { atribusiLangkah, hasilAtribusi, mulaiAtribusi } = await import(
      '../src/pemeriksaan/banding.ts'
    )
    const k = mulaiAtribusi(b([{ gudang: 'A', sku: 'LAMA' }]))
    const l1 = atribusiLangkah(k, daftar, 1, b([{ gudang: 'A', sku: 'LAMA' }]))
    expect(l1.pelanggaran).toEqual([])
    const l2 = atribusiLangkah(
      k,
      daftar,
      2,
      b([
        { gudang: 'A', sku: 'LAMA' },
        { gudang: 'A', sku: 'X' },
      ]),
    )
    expect(l2.pelanggaran.map((p) => [p.id, p.langkah, p.baris.length])).toEqual([['uji', 2, 1]])
    const l3 = atribusiLangkah(
      k,
      daftar,
      3,
      b([
        { gudang: 'A', sku: 'LAMA' },
        { gudang: 'A', sku: 'X' },
        { gudang: 'B', sku: 'Y' },
      ]),
    )
    expect(l3.pelanggaran.map((p) => p.baris)).toEqual([[{ gudang: 'B', sku: 'Y' }]])
    const l4 = atribusiLangkah(
      k,
      daftar,
      4,
      b([
        { gudang: 'A', sku: 'LAMA' },
        { gudang: 'B', sku: 'Y' },
      ]),
    )
    expect(l4.pelanggaran).toEqual([])
    expect(l4.sembuh.map((p) => [p.id, p.langkah, p.sembuh, p.baris])).toEqual([
      ['uji', 2, 4, [{ gudang: 'A', sku: 'X' }]],
    ])
    const h = hasilAtribusi(k, daftar, { durasiMs: 1 })
    expect(h.status).toBe('pelanggaran')
    expect(h.baru.map((i) => [i.langkah, i.sembuh, i.baris.length])).toEqual([
      [2, 4, 1],
      [3, undefined, 1],
    ])
    expect(h.sudahAda.map((i) => i.baris)).toEqual([[{ gudang: 'A', sku: 'LAMA' }]])
  })
  it('baris yang sudah ada di baseline tidak pernah diatribusikan; nonaktif dilewati', async () => {
    const { atribusiLangkah, mulaiAtribusi } = await import('../src/pemeriksaan/banding.ts')
    const k = mulaiAtribusi(b([{ gudang: 'A', sku: 'LAMA' }]))
    const l1 = atribusiLangkah(
      k,
      daftar,
      1,
      b([
        { gudang: 'A', sku: 'LAMA' },
        { gudang: 'Z', sku: 'Z' },
      ]),
      ['uji'],
    )
    expect(l1.pelanggaran).toEqual([])
    const l2 = atribusiLangkah(k, daftar, 2, b([{ gudang: 'A', sku: 'LAMA' }]))
    expect(l2.pelanggaran).toEqual([])
    expect(l2.sembuh).toEqual([])
  })
  it('galat SQL di satu langkah dilaporkan tanpa menggugurkan invarian lain', async () => {
    const { atribusiLangkah, mulaiAtribusi } = await import('../src/pemeriksaan/banding.ts')
    const k = mulaiAtribusi(b([]))
    const l = atribusiLangkah(
      k,
      daftar,
      1,
      snap([
        { id: 'uji', galat: 'rusak' },
        { id: 'naik', baris: [{ tabel: 't', n_tup_upd: '1', n_tup_del: '0' }] },
      ]),
    )
    expect(l.galat).toEqual([{ id: 'uji', pesan: 'rusak' }])
    expect(l.pelanggaran.map((p) => p.id)).toEqual(['naik'])
  })
})

describe('diff dokumen', () => {
  it('kolom berubah, baris dibuat (ringkas), baris dihapus; updated_at diabaikan', async () => {
    const { diffDokumen, teksDiff } = await import('../src/pemeriksaan/banding.ts')
    const sebelum = {
      mr: {
        tabel: 'material_requests',
        baris: { id: '1', status: 'APPROVED', updated_at: 'a', note: null },
      },
      hilang: { tabel: 'x', baris: { id: '9' } },
    }
    const sesudah = {
      mr: {
        tabel: 'material_requests',
        baris: { id: '1', status: 'ISSUED', updated_at: 'b', note: 'ok' },
      },
      hilang: { tabel: 'x', baris: null },
      'wrench · stok': {
        tabel: 'warehouse_stock',
        baris: { id: '2', quantity_on_hand: '2.000', quantity_reserved: '0.000', rack: null },
      },
    }
    const d = diffDokumen(sebelum, sesudah)
    expect(d.map((x) => [x.label, x.jenis])).toEqual([
      ['mr', 'berubah'],
      ['hilang', 'dihapus'],
      ['wrench · stok', 'dibuat'],
    ])
    expect(d[0]?.perubahan).toEqual([
      { kolom: 'note', dari: null, ke: 'ok' },
      { kolom: 'status', dari: 'APPROVED', ke: 'ISSUED' },
    ])
    expect(teksDiff(d[0] as never)).toBe('mr: note ∅ → ok, status APPROVED → ISSUED')
    expect(d[2]?.perubahan.map((p) => p.kolom)).toEqual(['quantity_on_hand', 'quantity_reserved'])
    expect(diffDokumen(sesudah, sesudah)).toEqual([])
  })
})

describe('antrean snapshot', () => {
  it('berurutan, tidak paralel, tidak melewati; dimulai resolve saat snapshot terkunci; galat tidak memutus', async () => {
    const { AntreanSnapshot } = await import('../src/pemeriksaan/jalankan.ts')
    const q = new AntreanSnapshot<number>()
    const urutan: string[] = []
    let aktif = 0
    let maksAktif = 0
    const kerja =
      (n: number, ms: number, gagal = false) =>
      async (mulai: () => void) => {
        aktif++
        maksAktif = Math.max(maksAktif, aktif)
        urutan.push(`mulai ${n}`)
        // Kerja yang gagal tidak sempat memberi sinyal: dimulai tetap resolve (di finally).
        if (!gagal) mulai()
        await new Promise((r) => setTimeout(r, ms))
        aktif--
        urutan.push(`selesai ${n}`)
        if (gagal) throw new Error(`gagal ${n}`)
        return n
      }
    const a = q.tambah(kerja(1, 30))
    const b = q.tambah(kerja(2, 5, true))
    const c = q.tambah(kerja(3, 5))
    expect(q.sisa).toBe(3)
    await a.dimulai
    expect(urutan).toEqual(['mulai 1'])
    // Kerja 2 gagal sebelum memberi sinyal: dimulai baru resolve saat kerjanya berakhir.
    await b.dimulai
    expect(urutan).toEqual(['mulai 1', 'selesai 1', 'mulai 2', 'selesai 2'])
    await expect(b.selesai).rejects.toThrow('gagal 2')
    expect(await c.selesai).toBe(3)
    await q.tunggu()
    expect(urutan).toEqual(['mulai 1', 'selesai 1', 'mulai 2', 'selesai 2', 'mulai 3', 'selesai 3'])
    expect(maksAktif).toBe(1)
    expect(q.sisa).toBe(0)
  })
})

describe('antrean snapshot: dimulai menunggu snapshot terkunci', () => {
  it('pemutaran baru lanjut sesudah kerja memanggil mulai(), bukan saat kerja baru dijadwalkan', async () => {
    const { AntreanSnapshot } = await import('../src/pemeriksaan/jalankan.ts')
    const q = new AntreanSnapshot<number>()
    const urutan: string[] = []
    const x = q.tambah(async (mulai) => {
      urutan.push('buka koneksi')
      await new Promise((r) => setTimeout(r, 20))
      urutan.push('SELECT pertama')
      mulai()
      await new Promise((r) => setTimeout(r, 20))
      urutan.push('jejak')
      return 1
    })
    await x.dimulai
    urutan.push('langkah berikutnya')
    await x.selesai
    expect(urutan).toEqual(['buka koneksi', 'SELECT pertama', 'langkah berikutnya', 'jejak'])
  })
})

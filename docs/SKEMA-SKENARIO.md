# Skema skenario JSON

Untuk AI dan developer yang **menulis** skenario. Satu skenario = satu berkas JSON berisi langkah dan aksi sederhana; hal yang rumit (membuat data, approval berlapis, serah terima, dialog panjang) dipanggil **dengan nama** dari pustaka TypeScript di `src/pustaka/`. Panel dan `bun run check:scenarios` memvalidasi berkas dengan skema zod (`src/core/skema.ts`) dan aturan di `src/core/rules.ts`; berkas yang tidak valid ditandai di panel dan tidak bisa diputar.

Cara kerja dan alur: [MENULIS-SKENARIO.md](MENULIS-SKENARIO.md). Konteks dan larangan: [BRIEF.md](BRIEF.md).

## Lokasi dan nama

```
scenarios/<modul>/<slug>.json      mis. scenarios/material/pinjaman-alat.json
```

- `<modul>` = folder modul (Project › Modul › Skenario di panel) dan **harus sama dengan field `modul`** (aturan
  `modul-folder`). Nama tampilan dan urutan modul diatur di `src/core/project.ts`. Tiket Plane ditulis di field `tiket`,
  bukan lewat nama folder.
- `<slug>` kebab-case, sama dengan field `slug`, dan **unik di semua modul** (riwayat disimpan di `runs/<slug>/`).
- Kerangka baru: `bun run new <modul> <slug> [FMS-123]` (dari `templates/skenario.json`).

## Contoh minimal

```json
{
  "slug": "buka-barang",
  "judul": "Wati membuka barang baru",
  "tujuan": "Membuktikan barang baru tampil dengan SKU-nya di detail barang.",
  "modul": "material",
  "tiket": ["FMS-0"],
  "estimasi": "2 menit",
  "persona": [{ "siapa": "mbl.storekeeper", "peran": "membuka barang" }],
  "data": ["Satu barang baru \"Uji SR Contoh <stempel>\" dengan saldo awal 5 di WH-ALPHA"],
  "setelan": [],
  "prasyarat": [],
  "catatan": [],
  "siapkan": [
    { "siapkan": "barang", "simpan": "barang", "gudang": "WH-ALPHA", "kode": "SR-CTH", "nama": "Uji SR Contoh", "jumlah": 5 }
  ],
  "langkah": [
    {
      "id": "buka-barang",
      "judul": "Wati membuka barang yang baru dibuat",
      "sebagai": "mbl.storekeeper",
      "harusTerlihat": "Detail barang tampil dengan SKU-nya",
      "aksi": [
        { "buka": "/inventory/items/{barang.id}" },
        { "banner": "Wati membuka {barang.nama}", "tahan": 3000 },
        { "pastikanTerlihat": "{barang.sku}" }
      ]
    }
  ]
}
```

Contoh lengkap: `scenarios/material/pinjaman-alat.json`.

## Field tingkat atas

Field yang tidak tercantum ditolak (salah ketik ketahuan).

| Field | Wajib | Isi |
|---|---|---|
| `slug` | ya | Sama dengan nama berkas |
| `judul` | ya | Judul singkat |
| `tujuan` | ya | Satu kalimat "Membuktikan …" (min. 20 huruf) |
| `modul` | ya | `material`, `approval`, `wo`, `pb`, `akses`, `lingkungan`; sama dengan nama folder |
| `tiket` | ya | `["FMS-63"]`, boleh kosong. Tampil sebagai chip Plane bertautan `TICKET_URL` + kunci (tanpa sinkron) |
| `pemilik` | | Nama pemilik skenario (filter Pemilik di panel) |
| `status` | | `draf` atau `siap` (bawaan). Status `Ada kegagalan` dihitung dari jalan terakhir |
| `estimasi` | ya | `"<n> menit"` |
| `persona` | ya | `[{ "siapa": "mbl.storekeeper", "peran": "…" }]`: **semua** persona yang terlibat, termasuk yang hanya lewat API |
| `data` | ya | Uraian data yang disiapkan (untuk ringkasan) |
| `setelan` | ya | Setelan yang diubah skenario; `[]` bila tidak ada |
| `setelanMenetap` | | Alasan bila setelan sengaja tidak dikembalikan |
| `prasyarat`, `catatan` | ya | Daftar teks, boleh kosong |
| `pengecualian` | | `[{ "aturan": "db-lewat-api", "alasan": "…" }]`, wajib bila memakai aksi pustaka yang menyentuh DB |
| `siapkan` | ya | Aksi API sebelum putar (lihat di bawah); boleh `[]` |
| `langkah` | ya | Minimal satu langkah |
| `bersihkan` | | Aksi API yang selalu berjalan di akhir, juga saat gagal atau dihentikan |
| `pemeriksaan` | | `{ "nonaktif": ["approval-yatim"], "alasan": "…" }`: mematikan invarian DB tertentu untuk skenario ini (id dari [PEMERIKSAAN.md](PEMERIKSAAN.md)); `alasan` wajib (min. 20 huruf) |
| `pemeriksaanUi` | | `{ "nonaktif": ["radius-menyimpang"], "abaikanHalaman": ["/tires/used"], "alasan": "…" }`: mematikan aturan Pemeriksaan UI (statis `check:design` atau DOM) dan/atau melewati halaman (awalan pathname) untuk skenario ini ([PEMERIKSAAN.md](PEMERIKSAAN.md), bagian UI); `alasan` wajib (min. 20 huruf) bila ada yang diisi |

Persona yang dikenal: `mbl.superintendent` (Bagus), `mbl.plant-superintendent` (Andi), `mbl.planner` (Putri), `mbl.foreman` (Fajar), `mbl.foreman.beta` (Bima), `mbl.supervisor` (Surya), `mbl.mechanic` (Made), `mbl.storekeeper` (Wati), `mbl.purchasing` (Purnomo), `mbl.dispatcher` (Dedi), `mbl.mcr` (Mira). Sumber: `src/core/personas.ts`.

## Langkah

| Field | Wajib | Isi |
|---|---|---|
| `id` | ya | kebab-case, unik dalam skenario |
| `judul` | ya | Kalimat aktif: siapa melakukan apa |
| `deskripsi` | | Paragraf penjelasan untuk kartu deskripsi runner dan Ringkasan: apa yang dilakukan dan dibuktikan |
| `harusTerlihat` | ya | Yang harus terlihat di layar setelah langkah (tampil besar di panel). Ini teks untuk penonton; pemeriksaan otomatisnya ditulis sebagai aksi `pastikanTerlihat` |
| `sebagai` | | Persona jendela untuk langkah ini. Bila berbeda dari langkah sebelumnya, runner berganti akun di jendela yang sama (banner "Ganti akun") |
| `diBelakangLayar` | | `true` bila inti langkah terjadi lewat API |
| `capai` | | Aksi API yang membawa data ke awal langkah ini, supaya panel bisa **mulai dari langkah ini**. `[]` = data `siapkan` sudah cukup. Tanpa `capai`, langkah hanya bisa dimulai dengan data jalan yang berhenti tepat sebelumnya |
| `aksi` | ya | Daftar aksi, dijalankan berurutan |
| `cek` | | Pemeriksaan UI terstruktur sesudah aksi: tiap butir tepat satu dari `terlihat`, `tidakTerlihat`, atau `nilai` (+ `diharapkan`: teks sama persis tanpa beda huruf/spasi, atau `"/regex/"`); opsional `id` (`"5.2"`), `judul`, `lunak`, `batas`. Gagal = langkah gagal, kecuali `lunak` |
| `pernyataanData` | | Pernyataan data di snapshot DB baca-saja sesudah langkah, dibatasi `company_id` tenant: `{ "judul", "tabel", "cocok": { kolom: nilai/placeholder }, "kolom" + "diharapkan" }` atau `{ …, "jumlah": n }`. Tampil di Laporan › Transaksi database |

Aksi `pastikanTerlihat` / `pastikanTidakTerlihat` / `pastikanNonaktif` di `aksi` ikut tercatat sebagai cek UI (nomor `n.k`).
"Harus terlihat" tanpa cek otomatis tampil sebagai *tidak diperiksa otomatis* dan tidak dihitung di UI x/y laporan.

Tiap langkah membuka sendiri halaman yang dipakainya (`buka`), supaya bisa diputar mulai dari langkah itu.

## Aksi

Satu aksi = satu objek; jenisnya ditentukan kuncinya. Semua aksi layar melewati gerbang jeda, satu aksi, kecepatan, dan hentikan.

| Aksi | Bentuk | Keterangan |
|---|---|---|
| `buka` | `{ "buka": "/rute/{data.id}" }` | Buka rute web (diawali `/`) |
| `banner` | `{ "banner": "teks", "tahan": 3000 }` | Banner bernomor `n/total` di atas halaman, lalu tahan (bawaan 4000 ms) |
| `tahan` | `{ "tahan": 2000 }` | Tahan, ikut jeda/kecepatan/headless |
| `klik` | `{ "klik": <sasaran>, "tahan"?, "opsional"?, "tangkap"? }` | Kursor, bingkai, tahan (bawaan 3000), klik. `opsional: true` = lewati bila tidak muncul dalam ±2,5 dtk (dialog konfirmasi yang kadang ada). `tangkap: { "url": "/regex/", "metode"?: "POST", "simpan": { "po_id": "id" } }` = simpan field dari respons JSON permintaan yang dipicu klik |
| `isi` | `{ "isi": <sasaran>, "nilai": "teks", "tahan"?, "opsional"? }` | Isi isian; `""` mengosongkan. `opsional` = lewati bila tidak ada atau tidak bisa diisi |
| `pilih` | `{ "pilih": <sasaran combobox>, "opsi": "Teks", "tahan"? }` | Buka combobox lalu pilih opsi. Dengan `tahan`: klik cepat tanpa tahanan panjang di daftar |
| `cari` | `{ "cari": <sasaran>, "ketik": "Fajar", "opsi": "Fajar" }` | Ketik di autocomplete, pilih opsi pertama yang memuat `opsi` |
| `tunggu` | `{ "tunggu": <sasaran>, "hilang"?, "batas"?, "opsional"? }` | Tunggu tampil (atau hilang), bawaan 15000 ms |
| `tungguUrl` | `{ "tungguUrl": "/regex/", "batas"?, "opsional"? }` | Tunggu alamat halaman cocok |
| `gulir` | `{ "gulir": <sasaran>, "opsional"? }` | Gulir sampai terlihat |
| `pastikanTerlihat` | `{ "pastikanTerlihat": "teks" \| <sasaran>, "lunak"?, "batas"? }` | Gagalkan langkah bila tidak terlihat. `lunak: true` = hanya dicatat di hasil langkah |
| `pastikanTidakTerlihat` | `{ "pastikanTidakTerlihat": "teks" \| <sasaran>, "lunak"? }` | Gagal bila masih terlihat setelah 3 dtk |
| `pastikanNonaktif` | `{ "pastikanNonaktif": <sasaran>, "lunak"? }` | Gagal bila elemen masih aktif |
| `sebagai` | `{ "sebagai": "mbl.foreman" }` | Ganti akun di tengah langkah (biasanya cukup `sebagai` di langkah) |
| `screenshot` | `{ "screenshot": "nama-kebab" }` | Screenshot tambahan ke folder jalan |
| `simpan` | `{ "simpan": "adj_id", "dariUrl": "/adjustments\\/(\\w+)/" }` atau `"dariTeks"`, `"batas"`? | Simpan grup 1 regex (atau seluruh cocokan) dari alamat atau teks halaman; dicoba ulang sampai batas (bawaan 10000 ms) selama halaman memuat |
| `dokumen` | `{ "dokumen": { "label", "nomor", "url" } }` | Tambah dokumen ke daftar "dokumen yang dibuat" di panel |
| `api` | `{ "api": "nama", ...argumen, "simpan"? }` | Aksi pustaka tanpa jendela (lewat API persona) |
| `layar` | `{ "layar": "nama", ...argumen, "simpan"? }` | Aksi pustaka di jendela (rangkaian klik/isian) |
| `siapkan` | `{ "siapkan": "nama", ...argumen, "simpan"? }` | Sama dengan `api`, khusus bagian `siapkan` |

Bagian yang boleh memuat apa: `siapkan` → `siapkan` dan `dokumen`; `capai` dan `bersihkan` → `api` dan `dokumen`; `aksi` langkah → semua kecuali `siapkan`.

## Sasaran (selector)

Sasaran berbasis peran, label, dan teks yang terlihat, dengan teks bahasa Indonesia dari `Frontend/src/shared/i18n/locales/id.json` repo v2. Tepat **satu** kunci jenis:

| Kunci | Playwright | Contoh |
|---|---|---|
| `tombol` | `getByRole('button', { name })` | `{ "tombol": "Ajukan", "persis": true }` |
| `tautan` | `getByRole('link')` | |
| `combobox` | `getByRole('combobox')` | `{ "combobox": "/^Bengkel/" }` |
| `kotakCentang` | `getByRole('checkbox')` | |
| `opsi` | `getByRole('option')` | |
| `label` | `getByLabel` | `{ "label": "Jumlah diterima" }` |
| `teks` | `getByText` | `{ "teks": "{adj_nomor}" }` |
| `placeholder` | `getByPlaceholder` | |
| `peran` (+ `nama`) | `getByRole(peran, { name })` | `{ "peran": "textbox", "nama": "/^Qty/" }` |
| `dialog` | `getByRole('dialog')`, `true` atau teks yang dimuat | `{ "dialog": "Ubah alur" }` |
| `baris` | `tr` yang memuat teks | `{ "baris": "{kampas.nama}" }` |
| `blok` | `div, li, tr` terkecil yang memuat semua teks | `{ "blok": ["Peminjam: Made", "dipinjam 2"] }` |
| `kartuPersetujuan` | kartu panel "Persetujuan" | `{ "kartuPersetujuan": true }` |

Pengubah: `dalam` (sasaran pembungkus, bisa bertingkat), `persis` (cocok persis), `ke` (indeks 0-based atau `"terakhir"`; bawaan elemen terlihat pertama, untuk `blok` yang terakhir). Hanya elemen yang terlihat yang dihitung.

**Teks:** teks biasa cocok sebagian tanpa beda huruf besar; `"/pola/flags"` adalah regex (escape `\` ganda di JSON: `"/Batas waktu \\(SLA\\)/"`).

## Data dan placeholder

- Data jalan dimulai dengan `stempel` (stempel waktu pendek, sama untuk seluruh jalan) dan `docs`.
- `"simpan": "kunci"` pada aksi pustaka menyimpan hasilnya; aksi `simpan` dan `klik … tangkap` juga menyimpan.
- Rujuk dengan `{kunci}`, `{kunci.field}`, `{kunci.daftar.0}`. String yang **hanya** berisi satu placeholder menghasilkan nilai aslinya (objek, daftar), mis. `"barang": "{wrench}"` atau `"seri": "{wrench.seri}"`; selain itu diinterpolasi sebagai teks.
- Kunci diawali huruf, jadi kuantifier regex `\\d{6}` tidak terbaca placeholder.
- `check:scenarios` menolak placeholder yang dirujuk sebelum disimpan (urutan berkas). Saat mulai dari langkah tengah, `capai` harus menyimpan ulang data yang dibutuhkan langkah itu bila data itu dibuat di langkah sebelumnya.
- Data disimpan ke `runs/<slug>/<waktu>/data.json` setelah tiap langkah, supaya jalan berikutnya bisa mulai dari langkah yang gagal.
- **Jangan menulis id dari DB tertentu** (UUID ditolak). Cari master lewat aksi pustaka (`barang`, `wo-dirilis` mencari gudang, unit, bengkel berdasar nama/kode).

## Aturan yang diperiksa otomatis

`bun run check:scenarios` dan panel menolak berkas bila: JSON tidak sah; field asing atau wajib hilang; aksi atau sasaran tidak dikenal; nama/argumen aksi pustaka salah (argumen yang memuat placeholder diperiksa ulang saat jalan); slug tidak sama dengan nama berkas atau dipakai di dua task; id langkah ganda; persona (di langkah, `sebagai`, atau argumen pustaka) belum dideklarasikan; placeholder dirujuk sebelum disimpan; UUID tertulis; `setelan` terisi tanpa `bersihkan` atau `setelanMenetap`; aksi pustaka bertanda DB dipakai tanpa `pengecualian` db-lewat-api.

## Keputusan skema (Pertanyaan terbuka 1–3)

Diambil untuk mode lokal, memilih yang paling sederhana:

1. **Jenis aksi, selector, harus terlihat, rujukan data.** Aksi = objek satu kunci dari daftar tetap di atas, ditambah tiga pintu ke pustaka (`api`, `layar`, `siapkan`). Selector = sasaran berbasis peran/label/teks, tanpa CSS; satu-satunya jalan keluar untuk DOM yang sulit adalah aksi pustaka `layar`. "Harus terlihat" ada dua: `harusTerlihat` di langkah (teks untuk penonton) dan aksi `pastikanTerlihat` (pemeriksaan). Data dirujuk dengan placeholder `{kunci.jalur}` dari nilai yang di-`simpan`.
2. **Penyiapan data.** Bagian `siapkan` berisi aksi pustaka API yang membuat data segar tiap jalan; tidak ada data tetap di JSON. Untuk mulai dari tengah, langkah membawa `capai` sendiri. Apakah server boleh membuat data di staging tiap jalan belum diputuskan (mode server belum dibangun).
3. **Langkah di belakang layar.** Langkah biasa dengan `diBelakangLayar: true`, berisi aksi `api` (persona API tanpa jendela, `sebagai` di argumen pustaka) diikuti `buka`/`banner` untuk menunjukkan hasilnya di layar.

Juga: skenario JSON tidak punya percabangan atau perulangan. Bila perlu kondisi ("klik konfirmasi bila ada"), pakai `opsional`; selebihnya tulis aksi pustaka.

## Menambah aksi pustaka

1. Tulis di `src/pustaka/<domain>.ts` dengan `api({...})` (tanpa jendela, `ctx: BaseCtx`) atau `layar({...})` (jendela, `ctx: StepCtx`): `ringkasan`, `argumen` (zod `.strict()`, pakai `.describe()` dan `.default()`), `hasil` bila mengembalikan nilai, `urai` (teks untuk "Aksi di langkah ini"), `jalankan`, dan `dokumen(hasil)` bila hasilnya mewakili baris DB yang layak diikuti Pemeriksaan (`[{ tabel, where: { id } }]`, lihat [PEMERIKSAAN.md](PEMERIKSAAN.md)).
2. Aksi `layar` memakai `ctx.k.click/fill/pick/search` dan `ctx.wait` (bukan aksi Playwright mentah atau `waitForTimeout`) supaya bisa dijeda.
3. Aksi yang menyentuh DB atau proses luar diberi `pengecualianDb: true` dan disepakati tim dulu.
4. Daftarkan di `src/pustaka/index.ts`, lalu `bun run docs:pustaka` untuk memperbarui daftar di bawah.

## Daftar aksi pustaka

Dibuat oleh `bun run docs:pustaka` dari `src/pustaka/`. Jangan diedit tangan.

<!-- pustaka:mulai -->
### `barang` (`api` / `siapkan`)

Buat barang baru dengan saldo awal di satu gudang. SKU = <kode>-<stempel>, nama = <nama> <stempel>; nomor seri = <kode>-<stempel>-<n>.

| Argumen | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `sebagai` | persona |  | bawaan `"mbl.storekeeper"` |
| `gudang` | string | ya | Nama atau kode gudang, mis. "WH-ALPHA" |
| `kode` | string | ya |  |
| `nama` | string | ya |  |
| `jenis` | `SPAREPART` \| `CONSUMABLE` \| `TOOL` |  | bawaan `"SPAREPART"` |
| `jumlah` | number |  | Untuk barang tanpa nomor seri |
| `seri` | number |  | Banyak nomor seri (barang SERIAL) |
| `harga` | string |  | bawaan `"100000"` |

Hasil (untuk `simpan`): `{ id, sku, nama, seri: string[], gudang_id }`

### `tambah-foto` (`layar`)

Lampirkan satu foto lewat jalur "tempel URL" di dalam sasaran (penyimpanan media lokal biasanya tidak dikonfigurasi).

| Argumen | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `dalam` | sasaran | ya |  |
| `nama` | string |  | nama foto contoh (URL contoh dibuat dari nama); bawaan `"foto"` |
| `url` | string |  | URL foto apa adanya; menggantikan nama |

### `pilih-mekanik` (`layar`)

Pilih satu mekanik di multi-select "Mekanik" dalam dialog, dan pastikan tercatat.

| Argumen | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `dalam` | sasaran | ya |  |
| `nama` | string |  | bawaan `"/Made Mekanik/"` |

### `mr-mandiri` (`api` / `siapkan`)

Buat MR mandiri (draf) di satu gudang dengan baris barang ber-part.

| Argumen | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `sebagai` | persona |  | bawaan `"mbl.storekeeper"` |
| `gudang` | string | ya |  |
| `keterangan` | string | ya |  |
| `baris` | objek[] | ya |  |

Hasil (untuk `simpan`): `{ id, nomor, gudang_id, baris: string[] } (id baris MR, urut sama dengan argumen baris)`

### `ajukan-mr` (`api` / `siapkan`)

Ajukan MR bila masih draf.

| Argumen | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `sebagai` | persona |  | bawaan `"mbl.storekeeper"` |
| `mr` | string | ya |  |

### `setujui-semua` (`api` / `siapkan`)

Setujui request approval sebuah dokumen tahap demi tahap oleh persona yang dicoba berurutan, sampai tidak menunggu lagi; gagal bila hasil akhirnya bukan Disetujui.

| Argumen | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `dokumen` | string | ya |  |
| `id` | string | ya |  |
| `persetuju` | persona[] | ya |  |
| `pembaca` | persona |  | bawaan `"mbl.storekeeper"` |

### `serah-alat` (`api` / `siapkan`)

Serahkan baris alat MR ke satu penerima (dicari dari daftar penerima MR) beserta nomor serinya.

| Argumen | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `sebagai` | persona |  | bawaan `"mbl.storekeeper"` |
| `mr` | string | ya |  |
| `gudang` | string | ya | id gudang |
| `penerima` | string | ya | potongan nama penerima, mis. "Made" |
| `baris` | objek[] | ya |  |

### `kembalikan-alat` (`api` / `siapkan`)

Terima kembali alat dari pinjaman terbuka pertama di satu baris MR.

| Argumen | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `sebagai` | persona |  | bawaan `"mbl.storekeeper"` |
| `mr` | string | ya |  |
| `gudang` | string | ya |  |
| `baris` | string | ya |  |
| `seri` | string | ya |  |
| `jumlah` | number |  | bawaan `1` |

### `periksa-pinjaman` (`api` / `siapkan`)

Periksa pinjaman pertama di satu baris MR lewat API: jumlah kembali dan tidak kembali harus sama dengan yang diharapkan.

| Argumen | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `sebagai` | persona |  | bawaan `"mbl.storekeeper"` |
| `mr` | string | ya |  |
| `baris` | string | ya |  |
| `kembali` | number | ya |  |
| `tidakKembali` | number | ya |  |

### `mr-disetujui-wo` (`api` / `siapkan`)

Cari MR berstatus Disetujui milik sebuah WO.

| Argumen | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `sebagai` | persona |  | bawaan `"mbl.storekeeper"` |
| `wo` | string | ya |  |

Hasil (untuk `simpan`): `{ id, nomor }`

### `serah-mr-wo` (`api` / `siapkan`)

Keluarkan seluruh MR Disetujui milik WO ke seorang persona (dengan foto bukti lewat URL).

| Argumen | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `sebagai` | persona |  | bawaan `"mbl.storekeeper"` |
| `wo` | string | ya |  |
| `gudang` | string | ya |  |
| `penerima` | persona | ya |  |

Hasil (untuk `simpan`): `{ id, nomor } MR yang dikeluarkan`

### `retur-wo` (`api` / `siapkan`)

Cari permintaan retur material milik sebuah WO (yang belum selesai diterima bila ada).

| Argumen | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `sebagai` | persona |  | bawaan `"mbl.storekeeper"` |
| `nomorWo` | string | ya |  |

Hasil (untuk `simpan`): `{ id }`

### `wo-dirilis` (`api` / `siapkan`)

Buat WO langsung (bengkel internal) dengan baris part, lalu rilis sehingga MR awal Disetujui.

| Argumen | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `pembuat` | persona |  | bawaan `"mbl.planner"` |
| `perilis` | persona |  | bawaan `"mbl.supervisor"` |
| `unit` | string | ya | nomor lambung atau pelat, mis. "DT-014" |
| `bengkel` | string | ya |  |
| `gudang` | string | ya | id gudang sumber |
| `baris` | objek[] | ya |  |

Hasil (untuk `simpan`): `{ id, nomor }`

### `buka-sesi` (`api` / `siapkan`)

Buka sesi kerja di WO untuk satu mekanik lalu mulai pengerjaan.

| Argumen | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `sebagai` | persona |  | bawaan `"mbl.foreman"` |
| `wo` | string | ya |  |
| `nama` | string | ya | nama sesi, mis. "Sesi 1" |
| `mekanik` | persona |  | bawaan `"mbl.mechanic"` |

### `dokumentasi-kerja` (`layar`)

Mekanik membuka WO, menekan Mulai bila perlu, mengisi catatan pengerjaan item (dan satu foto), lalu mengirim dokumentasi.

| Argumen | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `wo` | string | ya |  |
| `item` | string | ya | nama barang di WO |
| `catatan` | string | ya |  |
| `foto` | string |  | nama foto contoh; tanpa ini tidak menambah foto |
| `catatanLamaWajib` | boolean |  | catat di hasil langkah bila catatan awal kosong; bawaan `false` |

Hasil (untuk `simpan`): `{ catatanAwal } isi catatan sebelum diubah (kosong bila belum ada)`

### `akhiri-sesi` (`layar`)

Isi catatan serah terima, tekan Akhiri sesi, dan konfirmasi.

| Argumen | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `wo` | string | ya |  |
| `catatan` | string | ya |  |

### `putuskan-sesi` (`layar`)

Isi catatan pemeriksaan sesi (dan foto), lalu Tolak sesi atau Setujui sesi.

| Argumen | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `wo` | string | ya |  |
| `keputusan` | `tolak` \| `setujui` | ya |  |
| `catatan` | string | ya |  |
| `foto` | string |  |  |

### `alur-persetujuan` (`api` / `siapkan`)

Cari alur persetujuan berdasarkan nama; mencatat peringatan bila alur sudah punya SLA atau eskalasi.

| Argumen | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `sebagai` | persona |  | bawaan `"mbl.plant-superintendent"` |
| `nama` | string | ya |  |

Hasil (untuk `simpan`): `{ id, nama }`

### `periksa-alur-kosong` (`api` / `siapkan`)

Gagal bila alur persetujuan masih punya SLA, pengingat, atau peran eskalasi.

| Argumen | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `sebagai` | persona |  | bawaan `"mbl.plant-superintendent"` |
| `alur` | string | ya |  |

### `buka-ubah-alur` (`layar`)

Buka /config/approval-flows dan tekan Ubah pada baris alur; dialog "Ubah alur" terbuka.

| Argumen | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `nama` | string | ya |  |

### `simpan-alur` (`layar`)

Tekan Simpan di dialog "Ubah alur", konfirmasi bila diminta, dan tunggu dialog tertutup.

### `po` (`api` / `siapkan`)

Baca Purchase Order lewat API.

| Argumen | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `sebagai` | persona |  | bawaan `"mbl.plant-superintendent"` |
| `id` | string | ya |  |

Hasil (untuk `simpan`): `{ id, nomor, status }`

### `majukan-tenggat-sla` (`api` / `siapkan`)

PENGECUALIAN DB: majukan tenggat tahap approval yang sedang berjalan untuk satu request (berdasar judul) lewat SQL, lalu jalankan pemindaian SLA backend (scripts/run-approval-sla-scan.ts). Butuh V2_BACKEND_DIR dan psql. **Wajib `pengecualian` db-lewat-api.**

| Argumen | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `judulRequest` | string | ya | judul request, mis. nomor PO |

### `tiket` (`api` / `siapkan`)

Laporkan tiket kerusakan baru untuk satu unit (dengan satu foto lewat URL).

| Argumen | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `sebagai` | persona |  | bawaan `"mbl.mcr"` |
| `unit` | string | ya |  |
| `judul` | string | ya |  |
| `deskripsi` | string | ya |  |
| `lokasi` | string |  | bawaan `"Workshop Site Alpha"` |

Hasil (untuk `simpan`): `{ id, nomor, status }`

### `order` (`api` / `siapkan`)

Baca Order lewat API.

| Argumen | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `sebagai` | persona |  | bawaan `"mbl.planner"` |
| `id` | string | ya |  |

Hasil (untuk `simpan`): `{ id, nomor }`

### `pemeriksaan-order` (`api` / `siapkan`)

Cari pemeriksaan (DGN) Order yang tidak dibatalkan, selain id tertentu bila diisi.

| Argumen | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `sebagai` | persona |  | bawaan `"mbl.planner"` |
| `order` | string | ya |  |
| `selain` | string |  |  |

Hasil (untuk `simpan`): `{ id, nomor, status }`

### `isi-pemeriksaan` (`layar`)

Mekanik membuka pemeriksaan dari daftar, mulai inspeksi, mengisi odometer, perlu perbaikan, temuan, satu RPL jasa "Servis rem", menyimpan, lalu Submit.

| Argumen | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `nomor` | string | ya | nomor DGN |
| `odometer` | string | ya |  |
| `temuan` | string | ya |  |

### `zona-waktu` (`api` / `siapkan`)

Baca setelan zona waktu perusahaan.

| Argumen | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `sebagai` | persona |  | bawaan `"mbl.superintendent"` |

Hasil (untuk `simpan`): `{ default_time_zone, confirmation_status, configuration_version }`

### `konfirmasi-zona-waktu` (`api` / `siapkan`)

Konfirmasi zona waktu perusahaan bila belum terkonfirmasi; gagal bila sesudahnya belum CONFIRMED.

| Argumen | Tipe | Wajib | Keterangan |
|---|---|---|---|
| `sebagai` | persona |  | bawaan `"mbl.superintendent"` |
| `zona` | string |  | bawaan `"Asia/Jakarta"` |

Hasil (untuk `simpan`): `{ default_time_zone, confirmation_status }`

<!-- pustaka:akhir -->

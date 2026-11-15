# Fleetify Scenario Runner

Pemutar **skenario uji layar** Fleetify v2. Skenario adalah berkas **JSON** (`scenarios/<modul>/<slug>.json`) yang ditulis AI atau developer; hal yang rumit dipanggil dengan nama dari pustaka TypeScript. Skenario diputar dengan Playwright di satu jendela browser dengan tempo lambat. Panel kontrol (http://127.0.0.1:4800) menampilkan skenario per **Project › Modul**, ringkasan sebelum putar, **tampilan langsung** (screencast CDP) dengan cincin target, kontrol jeda/satu aksi/kecepatan/jeda tiap langkah, catat temuan, riwayat (dengan hapus dan retensi), dan **laporan** (Pemeriksaan UI | Transaksi database).

Mode server (skenario paten, unggah) belum tersedia; pengalihnya tampil nonaktif di panel.

Alat ini dijalankan **di mesin masing-masing** terhadap server v2 lokal. Persona yang dipakai adalah tenant MBL dari seed v2.

> **Keamanan.** Skenario membuat data dan mengubah setelan lewat API aplikasi. Alat ini hanya menerima URL `localhost`; jangan arahkan ke staging atau produksi.

## Prasyarat

- Server v2 lokal menyala: web http://localhost:5173 dan API http://localhost:3000, dengan seed MBL (`tenant mbl`, PT Mining Corp). Lihat `how-to-run.md` di repo v2.
- Akun admin platform v2 lokal (email dan password). Runner login sekali, menyimpan sesinya di `.cache/`, lalu meng-impersonasi persona MBL.
- [Bun](https://bun.sh) 1.3 atau lebih baru, dan Node 20 (dipakai Vitest).

## Pemasangan

```bash
bun install
bunx playwright install chromium
cp .env.example .env      # isi OWNER_EMAIL dan OWNER_PASSWORD
bun run scenario siapkan-zona   # sekali per DB: konfirmasi zona waktu MBL (scenarios/lingkungan/)
```

`bun install` juga menerapkan tambalan kecil Playwright di `patches/` (penanganan cookie di bawah Bun). Jangan hapus `patchedDependencies` di `package.json`.

## Menjalankan

```bash
bun run panel                       # panel → http://localhost:4800, jendela skenario headed
HEADLESS=1 bun run panel            # panel tanpa jendela browser (tampilan langsung tetap jalan)
bun run scenario --list             # daftar skenario dan status skema
bun run scenario pinjaman-alat      # CLI, headless
bun run scenario pinjaman-alat --headed --speed 1.5
bun run scenario pinjaman-alat --from 5                                  # mulai di langkah 5 (pakai capai)
bun run scenario pinjaman-alat --from 5 --data pinjaman-alat/2026-11-13T07-54-22   # pakai data jalan lain
bun run scenario pinjaman-alat --tanpa-pemeriksaan                       # lewati Pemeriksaan invarian DB
bun run scenario pinjaman-alat --tanpa-ui                                # lewati Pemeriksaan UI (DESIGN.md)
bun run pemeriksaan                 # semua invarian DB sekali, tanpa skenario
```

Bukti tiap jalan ada di `runs/<slug>/<waktu>/`: `data.json`, `result.json`, screenshot per langkah (dan `*-ui.png` bersorot bila ada temuan DOM), `laporan.md` (laporan gabungan UI + DB), dan `trace.zip` (`bunx playwright show-trace runs/<…>/trace.zip`). Folder `runs/` tidak di-commit.

Tiap jalan juga melewati **Pemeriksaan**: serangkaian SQL hanya-SELECT ke DB lokal v2 — baseline sebelum siapkan data, lalu snapshot setelah tiap langkah (asinkron, diantre) — yang melaporkan **pelanggaran invarian baru per langkah** (stok vs ledger movement, saldo akun vs ledger, total WO, request approval yatim, pinjaman alat, tabel append-only) dan **kolom dokumen yang berubah** antar langkah (MR, WO, stok barang, …). Butuh `V2_DATABASE_URL`; tanpa itu dilewati. Hasil tampil langsung di baris langkah, di layar Selesai/Gagal, di Riwayat, dan di CLI (pelanggaran baru = exit code ≠ 0). Rincian: [docs/PEMERIKSAAN.md](docs/PEMERIKSAAN.md).

Setiap langkah juga melewati **Pemeriksaan UI**: halaman yang tampil diperiksa kepatuhannya ke `DESIGN.md` v2 dengan dua cara — pemeriksa **statis** (skrip v2 `check:design --route <pathname>`, dibandingkan dengan `design-baseline.json`: kelebihan = pelanggaran baru dengan berkas:baris) dan pemeriksa **DOM** langsung di halaman (warna di luar token, radius, bayangan kartu, font, kontras kuning; temuan disorot kotak merah di screenshot `*-ui.png`). Runner juga mencatat **request tulis** per langkah, yang ditampilkan sebagai *transaksi tersangka* di pelanggaran DB. Butuh `V2_DIR`; tanpa itu dilewati. Pelanggaran statis baru = exit ≠ 0; temuan DOM hanya peringatan. Di akhir tiap jalan ditulis **`laporan.md`** gabungan (KPI, tabel langkah, pelanggaran UI dan DB beserta lokasinya) — panel punya tombol **Unduh laporan**.

## Panel

1. **Skenario** (`#/`, `#/modul/<modul>`): sidebar **Project › Uji per modul** (modul = folder, dengan jumlah), navigasi Skenario / Sedang berjalan / Riwayat & laporan, dan blok **Sasaran** (server v2 lokal + tenant, status Pemeriksaan DB/UI — diatur di `.env`, tidak bisa diganti dari panel). Sidebar bisa diciutkan jadi rel ikon (tombol atau `\`), tiap grup dibuka-tutup (diingat); di layar sempit jadi laci. Daftar berkelompok per modul (dilipat, **Ciutkan/Buka semua**, **Putar semua** per modul) dengan ikon hasil terakhir, judul, waktu · langkah · perkiraan (gagal: di langkah n · lihat laporan), chip tiket Plane (`tiket`, tertaut `TICKET_URL`), status (*Siap*, *Draf*, *Ada kegagalan*), Putar / Sunting / Lainnya (ringkasan, laporan terakhir, riwayat, pratinjau JSON, salin path). Bar filter chip (Status jalan, Sumber tiket, Pemilik, Status skenario) dan cari; tampilan Daftar/Papan; tab **Rencana uji**. *Tugas saya* dan sumber tugas Plane/Jira tampil nonaktif *belum tersedia*. *Catatan untuk AI* muncul bila ada temuan "Skenario salah".
2. **Ringkasan** (dua kolom): kolom utama untuk membaca — judul, chip modul/setelan/tiket, Tujuan, **Alur langkah** (persona, di layar / di belakang layar, *Harus terlihat* utuh, `deskripsi`, "Mulai di sini"), Persona, bagian lipat Data/Prasyarat/Setelan/Catatan. Kolom kanan menempel: kartu **Putar** (kecepatan, Jeda tiap langkah, Tampilan aplikasi, Mutu gambar, **Siapkan data** → **Putar**), jalan terakhir, Sunting.
3. **Runner**: toolbar dengan pil **Lanjut/Jeda · Satu aksi · Hentikan** (dua klik), menu kecepatan **0,25×–3×** (diingat) dengan sakelar **Jeda tiap langkah**, **Fokus layar**; tampilan langsung sebesar mungkin dengan **cincin oranye** di sasaran aksi berikutnya saat dijeda; **rel langkah** yang bisa dibuka jadi **peta langkah**; **kartu deskripsi** (status, langkah · persona, `deskripsi`, keterangan dari aksi `banner`, *Harus terlihat*, aksi berikutnya). Aksi `banner` **tidak lagi digambar di halaman aplikasi** — teksnya tampil di kartu, screenshot bersih. Gagal/Selesai: **Ulang dari langkah N**, **Lihat laporan**.
   **Tampilan aplikasi**: ukuran layar 1400×900 (bawaan, ukuran tempat skenario ditulis) · 1280×800 · 1600×1000 · 1920×1080 dan skala 100 % · 90 % · 80 % · 67 % ("zoom out" tanpa merusak koordinat klik). CLI: `--ukuran 1280x800 --skala 0.8`. **Mutu gambar** (tampilan langsung saja): *Tajam* (bawaan panel) atau *Hemat*; CLI `--mutu tajam`.
4. **Catat temuan**: satu baris di bawah layar (`T`), jenis Bug aplikasi / Skenario salah / Catatan; screenshot otomatis; fokus ke isian menjeda jalan.
5. **Riwayat**: semua jalan dengan ukuran dan total disk; linimasa langkah dengan galat, Pemeriksaan UI (statis `check:design` berkas:baris + DOM bersorot) dan DB, temuan; **Buka laporan**, **Unduh laporan**. Hapus satu/terpilih/semua jalan satu skenario/lebih lama dari N hari, atau **hapus trace saja** — selalu lewat dialog. **Retensi otomatis** (bawaan: simpan 10 jalan per skenario, trace 3 terakhir + jalan gagal) sesudah tiap jalan; setelan di `.cache/riwayat-retensi.json`. CLI: `bun run riwayat --daftar | --hapus-lebih-lama <hari> | --simpan <n> | --hapus-trace [--ya]`.
6. **Laporan** (`#/laporan/<jalan>`): tab **Pemeriksaan UI** (screenshot saat cek gagal dengan kotak merah, kartu per langkah, ringkasan UI x/y · Database · Temuan, Diharapkan vs Terlihat, kepatuhan DESIGN.md langkah itu) dan tab **Transaksi database** (jejak baris tenant per langkah: filter Semua/Dari layar/Lewat API, cari tabel/kolom, diff kolom lama → baru, pernyataan data, silang "Data benar, tampilan salah"). Jejak baris dibaca dari snapshot READ ONLY yang sama dengan invarian, kolom `company_id`; dilewati bila tenant > 60.000 baris.

Pintasan (runner): `Spasi` jeda/lanjut · `→` satu aksi · `T` catat temuan · `Ctrl/⌘+Enter` simpan temuan · `F` fokus layar · `[` peta langkah · `Esc` tutup peta / keluar fokus · `\` ciutkan sidebar. **Hentikan** selalu butuh dua klik (tanpa pintasan).

Satu tenant = satu pemutar sekaligus: runner memegang kunci `.cache/kunci-<tenant>.json`; jalan kedua dari proses lain (panel lain, CLI) ditolak dengan pesan siapa yang memakai. Jalan dari panel selalu bertempo tontonan penuh, juga dengan `HEADLESS=1`. Temuan ditulis ke `docs/TEMUAN.md` (lokal) dan ke `result.json` jalan.

## Konfigurasi (`.env`)

| Variabel | Guna |
|---|---|
| `FLEETIFY_WEB_URL` | Web v2 lokal (bawaan `http://localhost:5173`) |
| `FLEETIFY_API_URL` | API (bawaan `<web>/api/v1`, lewat proxy Vite) |
| `OWNER_EMAIL`, `OWNER_PASSWORD` | Akun admin platform lokal, wajib |
| `TENANT_SLUG` | Tenant persona (bawaan `mbl`) |
| `RUNNER_PORT` | Port panel (bawaan 4800, selalu 127.0.0.1) |
| `HEADLESS` | `1` = panel tanpa jendela |
| `WINDOW_POS`, `SLOWMO` | Posisi jendela headed (`x,y`) dan slowMo Playwright |
| `HEADLESS_HOLD` | Pengali tahanan saat headless (bawaan 0,15) |
| `TEMUAN_FILE` | Berkas temuan (bawaan `docs/TEMUAN.md`) |
| `TICKET_URL` | Awalan tautan tiket di panel |
| `V2_BACKEND_DIR` | Folder Backend v2 yang menyala; untuk `sla-eskalasi` dan cadangan alamat DB Pemeriksaan |
| `V2_DATABASE_URL` | DB Postgres lokal v2 untuk Pemeriksaan (hanya SELECT, hanya host lokal). Kosong = dibaca dari `.env` Backend (`MIGRATE_DATABASE_URL`), bila tidak ada Pemeriksaan dilewati |
| `V2_DIR` | Akar repo v2 yang memuat `Frontend/scripts/check-design.ts` (Pemeriksaan UI, hanya dibaca). Kosong = Pemeriksaan UI dilewati |

## Menulis skenario

```bash
bun run new wo retur-rusak FMS-62   # kerangka scenarios/wo/retur-rusak.json
bun run check:scenarios          # skema dan aturan
bun run docs:pustaka             # perbarui daftar aksi pustaka (SKEMA-SKENARIO.md) dan invarian (PEMERIKSAAN.md)
bun run check && bun run typecheck && bun run test
```

Skema dan daftar aksi: [docs/SKEMA-SKENARIO.md](docs/SKEMA-SKENARIO.md). Invarian DB pasca-skenario: [docs/PEMERIKSAAN.md](docs/PEMERIKSAAN.md). Alur menulis dan memperbaiki: [docs/MENULIS-SKENARIO.md](docs/MENULIS-SKENARIO.md). Konteks dan larangan: [docs/BRIEF.md](docs/BRIEF.md). Skenario berikutnya: [docs/DAFTAR-SKENARIO.md](docs/DAFTAR-SKENARIO.md). Alur kontribusi: [CONTRIBUTING.md](CONTRIBUTING.md).

## Struktur

| Lokasi | Isi |
|---|---|
| `scenarios/<modul>/<slug>.json` | Skenario, satu berkas per skenario, dikelompokkan per modul (folder = field `modul`) |
| `src/core/project.ts` | Project › Modul (satu project Fleetify v2: nama tampilan + urutan modul), status skenario |
| `src/core/tampilan.ts`, `kunci.ts` | Tampilan aplikasi (ukuran + skala) dan mutu tampilan langsung; kunci satu tenant satu pemutar |
| `src/core/riwayat.ts`, `src/riwayat.ts` | Riwayat di disk: ukuran, hapus jalan/trace (berpagar path), retensi; CLI `bun run riwayat` |
| `src/core/laporan-data.ts`, `src/pemeriksaan/jejak.ts` | Data layar Laporan (cek UI, transaksi, silang); jejak baris + pernyataan data |
| `panel/tokens.css`, `panel/panel.css`, `panel/js/` | Token dan komponen panel; fungsi render murni diuji Vitest |
| `src/core/skema.ts`, `rules.ts` | Skema zod skenario dan aturan `check:scenarios` |
| `src/core/interpreter.ts`, `sasaran.ts`, `layar.ts`, `placeholder.ts` | Penerjemah aksi, sasaran → locator, layar Playwright, placeholder data |
| `src/pustaka/` | Aksi pustaka bernama (`api`/`siapkan`, `layar`) |
| `src/core/lib.ts`, `kit.ts` | Browser, sesi admin, impersonasi persona, API, aksi terlihat dengan gerbang jeda |
| `src/core/controller.ts` | Jeda, satu aksi, kecepatan, hentikan |
| `src/core/run.ts` | Satu jalan: siapkan → langkah → bersihkan, temuan, bukti, screencast |
| `src/core/config.ts`, `db.ts` | Baca dan validasi `.env` (zod); alamat DB lokal v2 dengan pagar host |
| `src/pemeriksaan/` | Lapisan Pemeriksaan DB: `invarian.ts` (definisi SQL), `banding.ts` (baseline vs akhir), `jalankan.ts` (Bun.sql, transaksi READ ONLY). Lapisan UI: `ui-statis.ts` (check:design + baseline), `ui-dom.ts` (token, evaluasi DOM, sorot), `ui.ts` (per langkah, ringkasan) |
| `src/core/requests.ts`, `laporan.ts` | Pencatat request tulis per langkah; penyusun `laporan.md` |
| `src/server.ts`, `panel/index.html` | Panel (http + SSE `/events`, tampilan langsung `/live`) |
| `src/cli.ts`, `src/new.ts`, `src/check-scenarios.ts`, `src/docs-pustaka.ts`, `src/pemeriksaan.ts` | CLI, kerangka, pemeriksa, generator docs (pustaka + invarian), Pemeriksaan mandiri |
| `templates/skenario.json` | Templat untuk `bun run new` |

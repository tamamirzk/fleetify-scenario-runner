# Fleetify Scenario Runner

Pemutar **skenario uji layar** Fleetify v2. Skenario adalah berkas **JSON** (`scenarios/<task>/<slug>.json`) yang ditulis AI atau developer; hal yang rumit dipanggil dengan nama dari pustaka TypeScript. Skenario diputar dengan Playwright di satu jendela browser dengan tempo lambat. Panel kontrol (mode **lokal**, http://localhost:4800) menampilkan skenario per task, ringkasan sebelum putar, **tampilan langsung** jendela browser, kontrol jeda/satu aksi/kecepatan, catat temuan, dan riwayat jalan.

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
```

Bukti tiap jalan ada di `runs/<slug>/<waktu>/`: `data.json`, `result.json`, screenshot per langkah, dan `trace.zip` (`bunx playwright show-trace runs/<…>/trace.zip`). Folder `runs/` tidak di-commit.

## Panel (mode lokal)

1. **Skenario per task**: kiri daftar task (nama folder), tengah kartu per berkas JSON (path, judul, jumlah langkah dan persona, hasil lokal terakhir), kanan pratinjau JSON dengan status skema dan **Catatan untuk AI**. Berkas baru atau berubah muncul otomatis; berkas dengan skema tidak valid ditandai beserta masalahnya dan tidak bisa diputar. **Putar semua** memutar semua berkas valid satu task berurutan.
2. **Ringkasan**: tujuan, persona, langkah beserta yang harus terlihat, data yang disiapkan, prasyarat, setelan, catatan. Pilih langkah awal (langkah dengan `capai`, atau data jalan yang berhenti tepat sebelumnya), **Siapkan data**, lalu **Putar**.
3. **Sedang berjalan**: tampilan langsung besar (screencast Chromium lewat CDP, klik ganda untuk layar penuh), callout aksi saat ini, kotak *Harus terlihat*, kontrol Jeda/Lanjut, Satu aksi, Hentikan, kecepatan 0,5×–3×, daftar langkah dengan batang kemajuan, dan ubin *Aksi di langkah ini*. Saat jeda, judul menyebut aksi berikutnya ("Dijeda sebelum klik tombol “Ajukan”"). Gagal: langkah, aksi, pesan, screenshot, **Ulang dari langkah N**. Selesai: hasil dan tautan riwayat.
4. **Catat temuan**: Bug aplikasi, Skenario salah, atau Catatan; terikat ke langkah aktif, screenshot otomatis, opsi jeda selama menulis.
5. **Riwayat**: semua jalan lokal; detail berbentuk linimasa dengan galat, screenshot, temuan per langkah, dan aksi tiap langkah.

Pintasan: `Spasi` jeda/lanjut · `→` satu aksi · `N` catat temuan · `Ctrl+Enter` simpan temuan · `Shift+Esc` hentikan.

Jeda berlaku sebelum aksi terlihat berikutnya (banner, klik, isian, ganti akun, buka halaman). Kecepatan mengali semua tahanan. Satu jalan pada satu waktu. Menutup jendela browser sama dengan Hentikan. Temuan ditulis ke `docs/TEMUAN.md` (lokal, tidak di-commit) dan ke `result.json` jalan.

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
| `V2_BACKEND_DIR` | Folder Backend v2 yang menyala; hanya untuk `sla-eskalasi` |

## Menulis skenario

```bash
bun run new FMS-62 retur-rusak   # kerangka scenarios/FMS-62/retur-rusak.json
bun run check:scenarios          # skema dan aturan
bun run docs:pustaka             # perbarui daftar aksi pustaka di docs/SKEMA-SKENARIO.md
bun run check && bun run typecheck && bun run test
```

Skema dan daftar aksi: [docs/SKEMA-SKENARIO.md](docs/SKEMA-SKENARIO.md). Alur menulis dan memperbaiki: [docs/MENULIS-SKENARIO.md](docs/MENULIS-SKENARIO.md). Konteks dan larangan: [docs/BRIEF.md](docs/BRIEF.md). Skenario berikutnya: [docs/DAFTAR-SKENARIO.md](docs/DAFTAR-SKENARIO.md). Alur kontribusi: [CONTRIBUTING.md](CONTRIBUTING.md).

## Struktur

| Lokasi | Isi |
|---|---|
| `scenarios/<task>/<slug>.json` | Skenario, satu berkas per skenario, dikelompokkan per task |
| `src/core/skema.ts`, `rules.ts` | Skema zod skenario dan aturan `check:scenarios` |
| `src/core/interpreter.ts`, `sasaran.ts`, `layar.ts`, `placeholder.ts` | Penerjemah aksi, sasaran → locator, layar Playwright, placeholder data |
| `src/pustaka/` | Aksi pustaka bernama (`api`/`siapkan`, `layar`) |
| `src/core/lib.ts`, `kit.ts` | Browser, sesi admin, impersonasi persona, API, aksi terlihat dengan gerbang jeda |
| `src/core/controller.ts` | Jeda, satu aksi, kecepatan, hentikan |
| `src/core/run.ts` | Satu jalan: siapkan → langkah → bersihkan, temuan, bukti, screencast |
| `src/core/config.ts` | Baca dan validasi `.env` (zod) |
| `src/server.ts`, `panel/index.html` | Panel (http + SSE `/events`, tampilan langsung `/live`) |
| `src/cli.ts`, `src/new.ts`, `src/check-scenarios.ts`, `src/docs-pustaka.ts` | CLI, kerangka, pemeriksa, generator docs pustaka |
| `templates/skenario.json` | Templat untuk `bun run new` |

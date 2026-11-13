# Fleetify Scenario Runner

Pemutar **skenario uji layar** Fleetify v2. Skenario diputar dengan Playwright di satu jendela browser dengan tempo lambat, jadi kamu bisa mengikuti setiap klik, isian, pergantian akun, dan approval. Panel kontrol di http://localhost:4800 dipakai untuk memilih skenario, menyiapkan data, menjeda, maju satu aksi, mengubah kecepatan, mulai dari langkah tertentu, mencatat temuan, dan melihat riwayat jalan.

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
bun run scenario siapkan-zona   # sekali per DB: konfirmasi zona waktu MBL
```

`bun install` juga menerapkan tambalan kecil Playwright di `patches/` (penanganan cookie di bawah Bun). Jangan hapus `patchedDependencies` di `package.json`.

## Menjalankan

```bash
bun run panel                       # panel → http://localhost:4800, jendela skenario headed
HEADLESS=1 bun run panel            # panel tanpa jendela browser
bun run scenario --list             # daftar skenario
bun run scenario pinjaman-alat      # CLI, headless
bun run scenario pinjaman-alat --headed --speed 1.5
bun run scenario pinjaman-alat --from 5                                  # mulai di langkah 5 (pakai reach)
bun run scenario pinjaman-alat --from 5 --data pinjaman-alat/2026-11-13T07-54-22   # pakai data jalan lain
```

Bukti tiap jalan ada di `runs/<skenario>/<waktu>/`: `data.json`, `result.json`, screenshot per langkah, dan `trace.zip` (`bunx playwright show-trace runs/<…>/trace.zip`). Folder `runs/` tidak di-commit.

## Panel

1. **Skenario**: kartu per skenario (judul, tiket, perkiraan durasi, status jalan terakhir), bisa dicari dan difilter per kelompok.
2. **Ringkasan**: tujuan, tiket, persona dan urutan pergantian akun, langkah beserta yang harus terlihat, data yang dibuat, setelan yang diubah, prasyarat, dan catatan. Pilih langkah awal dan sumber data, lalu **Siapkan data**. Setelah data siap, dokumen yang dibuat tampil dan **Putar** aktif.
3. **Sedang berjalan**: langkah aktif disorot; **Jeda**, **Lanjut**, **Satu aksi**, **Hentikan**; kecepatan 0,5×–3×; log; screenshot terakhir; formulir **Catat temuan**.
4. **Riwayat**: semua jalan dengan hasil, durasi, langkah lulus, temuan, screenshot, dan trace.

Jeda berlaku sebelum aksi terlihat berikutnya (banner, klik, isian, ganti akun, buka halaman). Kecepatan mengali semua tahanan. Satu jalan pada satu waktu. Menutup jendela browser sama dengan Hentikan.

Temuan dari panel ditulis ke `docs/TEMUAN.md` (lokal, tidak di-commit) dan ke `result.json` jalan.

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
bun run new retur-rusak      # kerangka scenarios/retur-rusak.ts dari templat
bun run check:scenarios      # standar skenario
bun run check && bun run typecheck && bun run test
```

Standar dan cara menulis: [docs/MENULIS-SKENARIO.md](docs/MENULIS-SKENARIO.md). Konteks dan larangan: [docs/BRIEF.md](docs/BRIEF.md). Skenario berikutnya: [docs/DAFTAR-SKENARIO.md](docs/DAFTAR-SKENARIO.md). Alur kontribusi: [CONTRIBUTING.md](CONTRIBUTING.md).

## Struktur

| Lokasi | Isi |
|---|---|
| `src/core/config.ts` | Baca dan validasi `.env` (zod) |
| `src/core/lib.ts` | Browser, sesi admin, impersonasi persona, API, aksi terlihat dengan gerbang jeda |
| `src/core/kit.ts` | Perkakas skenario: banner, klik/isi, pilih opsi, panel approval, barang baru, pencarian master |
| `src/core/controller.ts` | Jeda, satu aksi, kecepatan, hentikan |
| `src/core/run.ts` | Satu jalan: siapkan data → langkah → hasil, temuan, bukti |
| `src/core/types.ts`, `meta.ts`, `rules.ts` | Tipe skenario, skema meta, aturan `check:scenarios` |
| `src/server.ts`, `panel/index.html` | Panel (http + SSE) |
| `src/cli.ts`, `src/new.ts`, `src/check-scenarios.ts` | CLI, scaffold, pemeriksa standar |
| `scenarios/*.ts` | Skenario, satu berkas per skenario |
| `templates/scenario.ts` | Templat untuk `bun run new` |

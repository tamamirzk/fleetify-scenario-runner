# Pemeriksaan per langkah: DB dan UI

Dua lapisan berjalan bersama tiap skenario, tanpa model AI, dan bertemu di satu **laporan gabungan**:

- **DB** — apakah transaksi DB tiap langkah aman dan konsisten (invarian SQL hanya-SELECT). Bagian *DB* di bawah.
- **UI** — apakah halaman yang tampil di tiap langkah patuh `DESIGN.md` v2 (pemeriksa statis `check:design` + pemeriksa DOM langsung). Bagian *UI* di bawah.

Keduanya mengikuti pola yang sama: hasil per langkah di `steps[n].db` / `steps[n].ui`, chip live di baris langkah panel (`DB ok` · `UI ok`), ringkasan akhir (`pemeriksaan` / `pemeriksaanUi` di `result.json`), dan `runs/<jalan>/laporan.md`.

# DB

Menjawab satu pertanyaan: **setelah skenario ini jalan, apakah transaksi DB-nya aman dan konsisten?** Runner menjalankan serangkaian SQL **hanya SELECT** ke DB Postgres lokal v2 sebagai **snapshot**: satu **baseline** sebelum `siapkan`, lalu satu snapshot **setelah tiap langkah selesai** (juga langkah `diBelakangLayar`, dan langkah yang gagal/dihentikan). Yang dilaporkan adalah **pelanggaran baru**: baris yang tidak ada di baseline, diatribusikan ke **langkah tempat ia pertama muncul**; pelanggaran yang hilang lagi di langkah berikutnya dicatat *sembuh di langkah m* supaya terlihat kalau sesuatu sempat tidak konsisten di tengah rangkaian transaksi. Pelanggaran yang sudah ada sejak baseline (data seed, data lama) ditampilkan terpisah sebagai *sudah ada sebelumnya* supaya tidak jadi noise.

Snapshot per langkah berjalan **asinkron** terhadap pemutaran: langkah berikutnya tidak menunggu SQL selesai, tapi tidak mulai sebelum snapshot langkah sebelumnya **dimulai**. Snapshot diantre berurutan (satu koneksi, tidak pernah paralel, tidak pernah dilewati); di akhir skenario runner menunggu semua snapshot selesai **sebelum `bersihkan`**, sehingga hasil akhir dan skenario selesai bersama. Snapshot terakhir adalah keadaan akhir.

Tiap snapshot juga mengambil **baris dokumen yang diikuti** — hasil aksi pustaka yang mendeklarasikan `dokumen()` (MR, WO, tiket, order, pemeriksaan, PO, barang beserta baris stoknya) — dan panel/CLI menampilkan **kolom yang berubah antar langkah** (`status APPROVED → ISSUED`, `quantity_reserved 2.000 → 0.000`). Dokumen yang tabelnya tidak diketahui (misalnya id dari `simpan dariUrl`) dilewati.

Kode: `src/pemeriksaan/` — `invarian.ts` (definisi), `banding.ts` (pembanding, atribusi per langkah, diff dokumen; murni), `jalankan.ts` (koneksi Bun.sql, transaksi `READ ONLY`, antrean snapshot). Integrasi: `src/core/run.ts` (`periksaLangkah`); CLI `src/cli.ts`; skrip mandiri `src/pemeriksaan.ts`; deklarasi dokumen di `src/pustaka/*.ts` (`dokumen(hasil)`).

## DB · Konfigurasi

| Variabel `.env` | Guna |
|---|---|
| `V2_DATABASE_URL` | Alamat DB Postgres server v2 yang sedang diuji. Pakai peran yang menembus RLS (nilai `MIGRATE_DATABASE_URL` di `.env` Backend); peran aplikasi `fleetify_app` tidak melihat baris tenant dan `companies`. |
| `V2_BACKEND_DIR` | Cadangan: bila `V2_DATABASE_URL` kosong, alamat dibaca dari `<V2_BACKEND_DIR>/.env` (`MIGRATE_DATABASE_URL`, lalu `DATABASE_URL`). |
| `TENANT_SLUG` | Tenant yang diperiksa (bawaan `mbl`); `company_id` di-resolve dari tabel `companies`. |

- **Hanya host lokal.** Host selain `localhost`/`127.0.0.1` ditolak (`src/core/db.ts`, pagar yang sama dengan `FLEETIFY_WEB_URL`). Jangan arahkan ke staging atau produksi.
- **Tanpa konfigurasi, skenario tetap jalan.** Bila alamat tidak ada, Pemeriksaan berstatus `tidak_dikonfigurasi` dan runner tidak gagal.
- **Hanya membaca.** Semua query berjalan dalam satu transaksi `READ ONLY` dengan `statement_timeout` 20 detik; tidak ada INSERT/UPDATE/DELETE/DDL. Satu SQL yang gagal (savepoint) tidak menggugurkan invarian lain.
- Pastikan DB yang ditunjuk **sama dengan DB server yang dipukul skenario** (API di `FLEETIFY_API_URL`); kalau tidak, Pemeriksaan membaca database yang tidak disentuh skenario dan selalu "lulus".

## DB · Menjalankan

```bash
bun run pemeriksaan                       # semua invarian sekali terhadap tenant, tanpa skenario
bun run scenario pinjaman-alat            # Pemeriksaan ikut otomatis; pelanggaran baru = exit code ≠ 0
bun run scenario pinjaman-alat --tanpa-pemeriksaan
```

Di panel, hasil muncul **langsung** di baris langkah yang baru selesai (chip abu-abu *memeriksa…*, hijau *DB ok*, merah *DB ✗ n*), panel *Aksi di langkah ini* menampilkan diff dokumen dan pelanggaran baru di langkah itu, dan ringkasan akhir tampil di layar Selesai/Gagal/Dihentikan serta di detail jalan pada Riwayat. CLI mencetak satu baris `✓ DB ok` / `✗ 2 pelanggaran: …` dan diff dokumen di bawah tiap langkah, lalu ringkasan. Hasil disimpan di `runs/<slug>/<waktu>/result.json` (`pemeriksaan` untuk ringkasan, `steps[].db` per langkah).

## DB · Membaca hasil

| Status | Arti |
|---|---|
| `lulus` | Tidak ada pelanggaran baru. "Semua invarian lulus (N diperiksa)": N = invarian yang benar-benar dinilai (tidak termasuk yang dilewati). |
| `pelanggaran` | Ada baris pelanggaran yang tidak ada di baseline (termasuk yang sembuh lagi di langkah berikutnya). Satu kartu per invarian dan langkah muncul: judul, keterangan, jumlah baris, langkah muncul/sembuh, tabel baris (5 pertama, "lihat semua"), tombol **Catat temuan** yang mengisi formulir temuan dengan teksnya. |
| `tidak_dikonfigurasi` | `V2_DATABASE_URL` kosong dan cadangan tidak ada. |
| `galat` | Baseline atau pemeriksaan akhir gagal (koneksi, tenant tidak ada), atau satu/lebih SQL invarian gagal (terdaftar di `galat`). Bukan pelanggaran. |

Per langkah (`steps[].db`): `status` (`memeriksa` · `ok` · `pelanggaran` · `galat`), `pelanggaran` (pertama muncul di langkah ini), `sembuh` (hilang di langkah ini), `dokumen` (diff kolom), `durasiMs` snapshot. Ringkasan akhir membawa `snapshot: { jumlah, rataMs }` — pada DB lokal satu snapshot (9 SELECT + baris dokumen) ±150 ms.

Bagian lain dalam hasil:

- **sudahAda** — pelanggaran yang sudah ada sebelum skenario; dilipat di panel. Identitas baris adalah nilai `kolomKunci` invarian: baris yang sudah melanggar di baseline dan masih melanggar di akhir dianggap lama **meskipun nilainya berubah**.
- **dilewati** — invarian yang dimatikan skenario (`pemeriksaan.nonaktif`) atau tabelnya tidak ada di database ini (skema cabang lain). Bukan kegagalan.
- Mode **kenaikan** (`append-only`) membandingkan penghitung: pelanggaran bila nilai di akhir lebih besar daripada baseline. Tanpa baseline (`bun run pemeriksaan`) hanya menampilkan nilai penghitungnya.

**Transaksi tersangka.** Runner mencatat tiap request **tulis** (`POST/PUT/PATCH/DELETE` ke `/api/v1/…`) per langkah: dari jendela skenario (`page.on('response')`) dan dari aksi pustaka yang memanggil API langsung (satu titik di `lib.apiSend`). Tersimpan di `steps[n].requests` (method, path dengan UUID → `{id}`, path asli, status, durasi, waktu, sumber `browser`/`api`); request sesi/impersonasi runner tidak dicatat, begitu pula `siapkan`/`bersihkan`. Pada pelanggaran baru di langkah *n*, panel, CLI, dan laporan menampilkan request tulis langkah itu sebagai transaksi tersangka, terbaru dulu (yang terakhir sebelum snapshot paling atas). Ini atribusi waktu, bukan bukti: snapshot diambil setelah langkah, jadi request langkah sebelumnya atau sesi lain bisa juga penyebabnya.

Pelanggaran baru tidak otomatis berarti bug aplikasi: bisa SQL invarian yang kurang tepat untuk kasus itu, atau efek sesi lain pada DB yang sama. Telusuri barisnya dulu; kalau memang bug v2, catat sebagai temuan **Bug aplikasi** dari tombol di kartu.

## DB · Mematikan invarian untuk satu skenario

Di berkas skenario JSON (lihat [SKEMA-SKENARIO.md](SKEMA-SKENARIO.md)):

```json
"pemeriksaan": {
  "nonaktif": ["approval-yatim"],
  "alasan": "Skenario ini sengaja membatalkan Order saat request approval-nya masih menunggu (menguji FMS-91)."
}
```

`nonaktif` hanya menerima id invarian yang ada; `alasan` wajib dan minimal 20 huruf. Jangan mematikan invarian hanya karena hasilnya merah — itu justru yang dicari.

## DB · Menambah invarian

1. Tambahkan objek ke `INVARIAN` di `src/pemeriksaan/invarian.ts`: `id` (kebab), `judul`, `keterangan` (apa yang diperiksa dan dasarnya di kode v2), `sql`, `kolomKunci`, `tabel`.
2. SQL **hanya SELECT/WITH**, menerima `$1 = company_id` tenant, dan mengembalikan **baris yang melanggar** (nol baris = lulus). Cast angka ke `::text` supaya Decimal/BigInt tidak kehilangan presisi di JSON. Verifikasi nama tabel dan kolom terhadap `v2/Backend/prisma/schema/*.prisma` (`@@map`/`@map`), bukan menebak.
3. `kolomKunci` = kolom yang mengidentifikasi baris pelanggaran (untuk membandingkan baseline vs akhir). `tabel` = tabel yang wajib ada; bila tidak ada di DB, invarian dilewati, bukan galat. SQL boleh berupa fungsi `(tabel: Set<string>) => string` untuk cabang opsional (lihat `approval-yatim`).
4. Untuk penghitung yang hanya boleh tetap, pakai `mode: 'kenaikan'` + `kolomAngka`.
5. Jalankan `bun run pemeriksaan` (SQL harus jalan), `bun run test` (ada tes yang mengeksekusi semua SQL dalam `READ ONLY` bila `V2_DATABASE_URL` terisi), lalu `bun run docs:pustaka` untuk memperbarui daftar di bawah.

## DB · Batasan

- **Deteksi, bukan bukti kebenaran.** Lulus berarti tidak ada pelanggaran dari daftar ini yang muncul; bukan berarti transaksi benar. Invarian yang tidak terdaftar tidak diperiksa.
- **Hanya tenant `TENANT_SLUG`** (kecuali `append-only`, yang global per database).
- **`pg_stat_user_tables` global per database**: aktivitas server atau sesi lain pada database yang sama ikut terhitung; penghitung diperbarui beberapa ratus milidetik setelah transaksi selesai.
- **Rantai movement** diurutkan `created_at, id`; baris yang `created_at`-nya kembar dengan baris lain pada pasangan (gudang, barang) yang sama dilewati pada pemeriksaan rantai karena urutannya tidak terjamin (`created_at` adalah awal transaksi).
- **Skema cabang.** Definisi mengikuti skema `v2/Backend` saat ditulis. DB dari cabang lain bisa tidak punya tabel tertentu (dilewati) atau memakai semantik lain (misalnya peminjaman alat dengan stok keluar vs reservasi); baca `keterangan` tiap invarian.
- Identitas baris lewat `kolomKunci`: perubahan nilai pada baris yang sudah melanggar sejak baseline tidak dilaporkan sebagai baru.
- **Snapshot adalah titik waktu setelah langkah**, bukan di dalam transaksi aplikasi: keadaan tidak konsisten yang terjadi dan pulih di dalam satu langkah tidak terlihat. Yang terlihat adalah inkonsistensi yang bertahan antar langkah (dicatat *sembuh di langkah m* bila pulih kemudian).
- Diff dokumen membaca seluruh baris (`to_jsonb`) dan mengabaikan `updated_at`; baris baru hanya menampilkan kolom status/nomor/kuantitas/rupiah.

# UI

Menjawab: **apakah halaman yang tampil di tiap langkah patuh DESIGN.md v2, dan kalau tidak, di berkas dan baris mana?** Dua pemeriksa, keduanya per langkah setelah aksinya selesai:

1. **Statis** — memanggil skrip v2 `bun run check:design --route <pathname> --json` (cwd `<V2_DIR>/Frontend`). Skrip mencocokkan pathname ke `PAGE_TABLE`, mengambil berkas halaman beserta impornya, dan melaporkan pelanggaran aturan `check:design` (`sx-tema`, `hex-mentah`, `restyle-sx`, `string-hardcode`, … — daftar dan pasal di `docs/CHECK-DESIGN.md` repo v2). Hasilnya dibandingkan dengan `Frontend/design-baseline.json`.
2. **DOM** — `page.evaluate` di halaman yang sedang tampil, menilai elemen yang terlihat terhadap token tema v2.

Kode: `src/pemeriksaan/ui-statis.ts` (pemanggil skrip, parser `--json`, pembanding baseline — murni), `ui-dom.ts` (token, normalisasi warna, fungsi evaluasi di browser, screenshot bersorot), `ui.ts` (`PemeriksaUi`: antrean, cache, ringkasan). Integrasi: `periksaUiLangkah` di `src/core/run.ts`.

## UI · Konfigurasi

| Variabel `.env` | Guna |
|---|---|
| `V2_DIR` | Akar repo v2 yang memuat `Frontend/scripts/check-design.ts` dan `Frontend/design-baseline.json`. Skrip saat ini hanya ada di worktree cabang `chore/check-design` (mis. `../v2-design-check`). Repo ini **hanya dibaca**. |

Kosong (atau skrip tidak ada) ⇒ status `tidak_dikonfigurasi`, skenario tetap jalan. Token warna dibaca sekali saat jalan mulai dari `Frontend/src/shared/theme/tokens.ts` + `palette.ts` (semua literal hex/rgba), radius dari `radius.*`.

## UI · Statis dan baseline

Baseline menyimpan **jumlah** pelanggaran per (berkas, aturan), bukan baris. Untuk tiap pasangan: jumlah ≤ baseline = *sudah ada* (dilipat); kelebihannya = **baru** (merah). Karena posisi tidak tersimpan, kartu pelanggaran baru menampilkan **semua** baris pasangan itu (berkas:baris:kolom, pesan, pasal DESIGN.md, cuplikan satu baris kode, tautan `vscode://file/…`) supaya yang baru bisa dicari. Satu panggilan ±0,3–0,6 dtk; hasil di-*cache* per pathname (UUID dianggap sama) dalam satu jalan, karena pelanggaran statis tidak berubah antar langkah — tetap ditampilkan di tiap langkah. Pemeriksa statis berjalan **asinkron** di antrean (seperti snapshot DB): langkah berikutnya tidak menunggunya, tapi jalan menunggu semuanya sebelum `bersihkan`.

Pathname yang tidak cocok `PAGE_TABLE` menghasilkan 0 berkas (dicatat sebagai `pattern: null`).

## UI · DOM

Dijalankan **sebelum aksi berikutnya** (diawait), setelah screenshot langkah. Hanya elemen terlihat (bbox > 0, di viewport); dikecualikan: elemen runner (`#sr-*`), `img`/`canvas`/`svg`/`video`/`iframe`, `.highcharts-container`, peta, dan `[data-ilustrasi]`. Maksimum 50 temuan per langkah (dedup per aturan + nilai + class MUI; `jumlah` = elemen serupa) dan 6.000 elemen.

| Aturan | Yang dilaporkan | Pasal |
|---|---|---|
| `warna-luar-token` | `color` (elemen dengan teks langsung), `background-color`, `border-color` yang bukan transparan dan bukan token | §3, §8 |
| `radius-menyimpang` | `border-radius` elemen berlatar/berbingkai yang bukan 0/8/12/16 px (token), 50 %, atau pill (≥ setengah sisi terpendek, ≥ 999 px) | §1 |
| `bayangan-kartu` | `box-shadow` pada `.MuiCard-root`/`.MuiPaper-root` yang bukan overlay (Dialog, Popover, Menu, Drawer, Snackbar, Tooltip, popper Autocomplete), bukan tab aktif, dan tidak fixed/sticky | §6 |
| `font-bukan-inter` | `font-family` yang tidak diawali Inter/Roboto/Helvetica/Arial/monospace | §4 |
| `kontras-kuning` | teks ≈ `#FFDB0E` di atas latar efektif terang (luminance > 0,5), atau teks putih di atas latar ≈ `#FFDB0E` | §2 |

**Kapan warna dianggap sah** (`warnaSah`): transparan; rgb-nya ada di token (alpha apa pun — MUI menurunkan hover/selected/disabled dengan alpha); hitam/putih murni beralpha (`common.black/white`); atau **turunan** satu token: `lighten(T, k)` atau `darken(T, k)` dengan koefisien sama di tiga kanal (±0,04), toleransi ±6 per kanal. Dasar turunan = token + `palette.light/dark` yang MUI hitung (lighten 0,2 / darken 0,3). Ini menutup warna Alert/Chip yang MUI hasilkan dari token (mis. teks Alert warning = darken(lighten(#F59E0B, 0,2), 0,6) = `rgb(98,70,23)`) tanpa menerima warna MUI bawaan seperti `#1976D2` atau `#9C27B0`.

Temuan DOM adalah **peringatan**: tidak menggagalkan jalan (CLI exit tetap 0), karena ada false positive yang belum bisa dipisahkan secara statis (lihat *UI · Batasan*). Bila ada temuan, runner menyuntik kotak merah tipis + label aturan di bbox tiap temuan (div `sr-ui-overlay`, `pointer-events: none`), mengambil screenshot kedua `NN-<langkah>-ui.png` di samping yang asli (yang asli tidak diubah), lalu menghapus overlay. Live view dan jendela headed ikut memperlihatkan kotak sesaat.

## UI · Menjalankan

```bash
bun run scenario pinjaman-alat            # UI ikut otomatis; statis baru = exit ≠ 0, DOM saja = peringatan
bun run scenario pinjaman-alat --tanpa-ui # lewati Pemeriksaan UI
```

CLI mencetak di bawah tiap langkah `✓ UI ok (27 berkas, 0 DOM)` / `! UI 3 temuan DOM (…) · 27 berkas, 0 baru` / `✗ UI 1 baru: restyle-sx ReturnToolDialog.tsx:87`, lalu ringkasan akhir (rata-rata waktu statis dan DOM). Panel: chip `UI memeriksa…` → `UI ok` (hijau) / `UI ! n DOM` (kuning) / `UI ✗ n baru` (merah); klik chip membuka detail langkah dengan bagian **Kode** (pelanggaran statis baru) dan **Tampilan** (screenshot bersorot + daftar temuan DOM).

## UI · Mematikan aturan atau halaman untuk satu skenario

```json
"pemeriksaanUi": {
  "nonaktif": ["radius-menyimpang"],
  "abaikanHalaman": ["/tires/used"],
  "alasan": "Halaman ban bekas masih prototipe dengan data contoh (CLAUDE.md v2)."
}
```

`nonaktif` menerima id aturan statis dan DOM; `abaikanHalaman` menerima awalan pathname (halaman itu tidak diperiksa sama sekali, tercatat *dilewati*). `alasan` wajib (min. 20 huruf) bila salah satunya terisi.

## UI · Batasan

- **Statis hanya mencakup berkas halaman + impor `@/modules/**`**; `src/shared/**` tidak ikut (dicakup pemindaian penuh v2). Pelanggaran di komponen bersama tidak akan muncul sebagai "baru" di sini.
- **Baseline per (berkas, aturan)**: pelanggaran yang dipindah baris atau ditukar dengan pelanggaran lain di berkas yang sama tidak terdeteksi; yang terdeteksi hanya kenaikan jumlah.
- **DOM melihat satu titik waktu**, setelah aksi langkah selesai. Dialog yang sudah tertutup tidak terperiksa; warna transisi yang tertangkap di tengah animasi bisa muncul (toleransi ±6 menutup sebagian).
- **`warna-luar-token` paling rawan**: warna yang MUI hitung dengan rumus lain (mis. `emphasize`, `getContrastText`, grey bawaan Chip `#BDBDBD` yang kebetulan ≈ lighten(ink)) bisa lolos atau tertangkap tanpa ada kesalahan di kode v2. Warna abu-abu yang ≈ lighten/darken dari ink diterima, jadi aturan ini longgar untuk abu-abu.
- `bayangan-kartu` mengecualikan elemen fixed/sticky (PageActionBar, AppBar): bayangannya memang untuk elemen yang mengambang (§6).
- Struktur 6 layer, kriteria tab, pemilihan komponen, i18n, dan responsif tidak diperiksa (lihat *Batasan* di `docs/CHECK-DESIGN.md` v2).

# Membaca laporan gabungan

Tiap jalan (CLI dan panel) menulis `runs/<slug>/<waktu>/laporan.md` di akhir — ini yang dikirim ke pekerja, jadi bisa dibaca tanpa panel. Panel: tombol **Unduh laporan** di layar Selesai/Gagal dan di detail Riwayat.

1. **KPI** — langkah lulus, pelanggaran DB `baru · lama`, pelanggaran UI statis `baru · lama`, temuan DOM, durasi. Layar Selesai panel menampilkan angka yang sama sebagai empat kartu besar.
2. **Langkah** — tabel langkah × (status, URL, UI, DB, request tulis). Baris dengan ✗ adalah tempat mencari.
3. **Pelanggaran UI baru** — per (berkas, aturan): jumlah vs baseline, langkah pertama muncul, pasal DESIGN.md, semua baris dengan cuplikan dan tautan editor. Lalu temuan DOM per langkah (selector, pesan, nama screenshot bersorot).
4. **Pelanggaran DB baru** — per invarian: langkah muncul/sembuh, **transaksi tersangka** (request tulis langkah itu, terbaru dulu), dan baris pelanggaran.
5. **Diff dokumen** — kolom yang berubah per langkah.
6. **Sudah ada sebelumnya** — ringkas: pelanggaran UI yang tercakup baseline dan pelanggaran DB sejak baseline. Bukan akibat jalan ini.

Urutan membaca: KPI → kalau ada angka *baru*, buka bagiannya; pelanggaran UI statis menunjuk berkas:baris di repo v2, pelanggaran DB menunjuk endpoint (transaksi tersangka) + tabel/baris. Temuan DOM dicek dengan screenshot bersorot sebelum dicatat sebagai bug.


## Daftar invarian

Dibuat otomatis oleh `bun run docs:pustaka` dari `src/pemeriksaan/invarian.ts`.

<!-- invarian:mulai -->
### `stok-available` — Stok tersedia = on hand − reservasi

warehouse_stock.quantity_available harus sama dengan GREATEST(quantity_on_hand − quantity_reserved, 0); untuk gudang bertipe SCRAP harus 0 (availableQuantity di inventory/domain/warehouseTypeRules.ts).

Mode: baris pelanggaran · kunci baris: `gudang`, `sku` · tabel wajib: `warehouse_stock`, `warehouses`, `parts`

### `stok-nonnegatif` — Kuantitas stok tidak negatif

quantity_on_hand, quantity_reserved, dan quantity_in_transit di warehouse_stock tidak boleh negatif.

Mode: baris pelanggaran · kunci baris: `gudang`, `sku` · tabel wajib: `warehouse_stock`, `warehouses`, `parts`

### `stok-ledger` — Ledger movement menyambung dan cocok dengan on hand

Tiga pemeriksaan atas warehouse_stock_movements per (gudang, barang), TRANSFER dihitung dua kaki (kolom *_current = gudang tujuan, *_previous = gudang asal): (aritmetika) qty_after = qty_before ± quantity sesuai arah; (rantai) qty_after baris sebelumnya = qty_before baris berikutnya, urut created_at lalu id — baris yang created_at-nya kembar dengan baris lain di pasangan yang sama dilewati karena urutannya tak terjamin; (saldo-akhir) warehouse_stock.quantity_on_hand sama dengan qty_after movement terakhir. Baris tanpa qty_before/qty_after (data lama) tidak dinilai. Ini bentuk yang pasti benar; rekonsiliasi penuh "selisih on hand = jumlah movement selama jalan" tidak dipakai karena baseline tidak menyimpan saldo per baris.

Mode: baris pelanggaran · kunci baris: `masalah`, `gudang`, `sku`, `movement_id` · tabel wajib: `warehouse_stock_movements`, `warehouse_stock`, `warehouses`, `parts`

### `akun-saldo` — Saldo akun = jumlah ledger

accounts.balance_rupiah (agregat cache) harus sama dengan jumlah bertanda ledger_entries per akun: DEBIT +, CREDIT − (FinanceRepository.listAccounts, reconciled_rupiah).

Mode: baris pelanggaran · kunci baris: `account_id` · tabel wajib: `accounts`, `ledger_entries`

### `wo-nilai` — Total WO = sebelum pajak + pajak

work_orders.after_tax_rupiah harus sama dengan before_tax_rupiah + tax_rupiah (NULL dihitung 0), seperti scripts/report-work-order-total-gap.ts. WO seed lama tanpa before_tax ikut terjaring; itu muncul sebagai "sudah ada sebelumnya".

Mode: baris pelanggaran · kunci baris: `wo_number` · tabel wajib: `work_orders`

### `wo-nilai-rantai` — Total WO = akhir rantai perubahan nilai

Untuk WO yang punya baris work_order_value_changes, after_tax_rupiah harus sama dengan value_after_rupiah baris dengan sequence tertinggi, dan tiap baris harus memenuhi after = before + change (recordWorkOrderValueChangeInTx, shared/work-order/workOrderValueChange.ts).

Mode: baris pelanggaran · kunci baris: `wo_number`, `masalah`, `sequence` · tabel wajib: `work_orders`, `work_order_value_changes`

### `approval-yatim` — Request approval PENDING atas dokumen yang sudah berhenti menunggu

approval_requests berstatus PENDING yang dokumennya sudah terminal, dibatalkan, atau hilang. Padanan SELECT dari scripts/report-orphan-approval-requests.ts, dibatasi ke document_type yang skrip itu tangani (27 jenis); cabang yang tabelnya tidak ada di DB ini dilewati.

Mode: baris pelanggaran · kunci baris: `request_id` · tabel wajib: `approval_requests`

### `approval-satu-tahap` — Request PENDING punya tepat satu tahap berjalan

Per approval_requests PENDING: tepat satu approval_request_steps berstatus PENDING pada step_order = current_step_order, dan tidak ada tahap PENDING di bawah current_step_order (tahap di bawahnya harus APPROVED/SKIPPED/ESCALATED). Tahap di atas current_step_order memang masih PENDING (menunggu giliran), jadi tidak dinilai.

Mode: baris pelanggaran · kunci baris: `request_id` · tabel wajib: `approval_requests`, `approval_request_steps`

### `alat-pinjaman` — Pinjaman alat: kembali + dihapusbukukan ≤ dipinjam ≤ diserahkan

Per pinjaman alat (material_request_tool_loans, FMS-63): returned_quantity + written_off_quantity ≤ quantity dan tidak negatif; per baris MR TOOL: jumlah quantity pinjaman ≤ material_request_lines.issued_qty. Tabel pinjaman per peminjam hanya ada di skema cabang yang memuat FMS-63; di DB tanpa tabel itu invarian dilewati.

Mode: baris pelanggaran · kunci baris: `masalah`, `loan_id` · tabel wajib: `material_request_tool_loans`, `material_request_lines`, `material_requests`

### `alat-reservasi` — Reservasi alat tidak melebihi pinjaman + WO aktif

Untuk barang TOOL: warehouse_stock.quantity_reserved ≤ pinjaman terbuka (baris MR TOOL diserahkan, belum kembali) + sisa booking WO aktif (stock_quantity − yang sudah diserahkan). Terjemahan SELECT dari scripts/report-tool-reservation-leak.ts (reservasi ganda alat sebelum perbaikan FMS-63). Semantik ini milik cabang di mana peminjaman alat = reservasi; bila server meminjamkan alat dengan stok keluar, baris di sini bisa menyesatkan.

Mode: baris pelanggaran · kunci baris: `gudang`, `sku` · tabel wajib: `warehouse_stock`, `parts`, `warehouses`, `material_request_lines`, `material_requests`, `work_order_details`, `work_orders`

### `append-only` — Tabel append-only tidak di-UPDATE/DELETE

Snapshot pg_stat_user_tables (n_tup_upd, n_tup_del) untuk ledger_entries, work_order_value_changes, approval_actions, approval_reassignments, tire_lifecycle_histories, work_order_part_documentation_versions, warehouse_stock_movements, audit_logs, order_schedule_changes; kenaikan antara baseline dan akhir = pelanggaran. Statistik ini global per database (bukan per tenant), jadi aktivitas server atau sesi lain pada database yang sama ikut terhitung; penghitung juga baru diperbarui beberapa ratus milidetik setelah transaksi. Tanpa baseline (bun run pemeriksaan) hanya menampilkan nilai penghitung.

Mode: kenaikan penghitung · kunci baris: `tabel` · kolom angka: `n_tup_upd`, `n_tup_del`

<!-- invarian:akhir -->

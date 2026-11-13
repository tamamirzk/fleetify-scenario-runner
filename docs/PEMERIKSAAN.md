# Pemeriksaan: invarian DB pasca-skenario

Menjawab satu pertanyaan tanpa model AI: **setelah skenario ini jalan, apakah transaksi DB-nya aman dan konsisten?** Runner menjalankan serangkaian SQL **hanya SELECT** ke DB Postgres lokal v2 sebagai **snapshot**: satu **baseline** sebelum `siapkan`, lalu satu snapshot **setelah tiap langkah selesai** (juga langkah `diBelakangLayar`, dan langkah yang gagal/dihentikan). Yang dilaporkan adalah **pelanggaran baru**: baris yang tidak ada di baseline, diatribusikan ke **langkah tempat ia pertama muncul**; pelanggaran yang hilang lagi di langkah berikutnya dicatat *sembuh di langkah m* supaya terlihat kalau sesuatu sempat tidak konsisten di tengah rangkaian transaksi. Pelanggaran yang sudah ada sejak baseline (data seed, data lama) ditampilkan terpisah sebagai *sudah ada sebelumnya* supaya tidak jadi noise.

Snapshot per langkah berjalan **asinkron** terhadap pemutaran: langkah berikutnya tidak menunggu SQL selesai, tapi tidak mulai sebelum snapshot langkah sebelumnya **dimulai**. Snapshot diantre berurutan (satu koneksi, tidak pernah paralel, tidak pernah dilewati); di akhir skenario runner menunggu semua snapshot selesai **sebelum `bersihkan`**, sehingga hasil akhir dan skenario selesai bersama. Snapshot terakhir adalah keadaan akhir.

Tiap snapshot juga mengambil **baris dokumen yang diikuti** — hasil aksi pustaka yang mendeklarasikan `dokumen()` (MR, WO, tiket, order, pemeriksaan, PO, barang beserta baris stoknya) — dan panel/CLI menampilkan **kolom yang berubah antar langkah** (`status APPROVED → ISSUED`, `quantity_reserved 2.000 → 0.000`). Dokumen yang tabelnya tidak diketahui (misalnya id dari `simpan dariUrl`) dilewati.

Kode: `src/pemeriksaan/` — `invarian.ts` (definisi), `banding.ts` (pembanding, atribusi per langkah, diff dokumen; murni), `jalankan.ts` (koneksi Bun.sql, transaksi `READ ONLY`, antrean snapshot). Integrasi: `src/core/run.ts` (`periksaLangkah`); CLI `src/cli.ts`; skrip mandiri `src/pemeriksaan.ts`; deklarasi dokumen di `src/pustaka/*.ts` (`dokumen(hasil)`).

## Konfigurasi

| Variabel `.env` | Guna |
|---|---|
| `V2_DATABASE_URL` | Alamat DB Postgres server v2 yang sedang diuji. Pakai peran yang menembus RLS (nilai `MIGRATE_DATABASE_URL` di `.env` Backend); peran aplikasi `fleetify_app` tidak melihat baris tenant dan `companies`. |
| `V2_BACKEND_DIR` | Cadangan: bila `V2_DATABASE_URL` kosong, alamat dibaca dari `<V2_BACKEND_DIR>/.env` (`MIGRATE_DATABASE_URL`, lalu `DATABASE_URL`). |
| `TENANT_SLUG` | Tenant yang diperiksa (bawaan `mbl`); `company_id` di-resolve dari tabel `companies`. |

- **Hanya host lokal.** Host selain `localhost`/`127.0.0.1` ditolak (`src/core/db.ts`, pagar yang sama dengan `FLEETIFY_WEB_URL`). Jangan arahkan ke staging atau produksi.
- **Tanpa konfigurasi, skenario tetap jalan.** Bila alamat tidak ada, Pemeriksaan berstatus `tidak_dikonfigurasi` dan runner tidak gagal.
- **Hanya membaca.** Semua query berjalan dalam satu transaksi `READ ONLY` dengan `statement_timeout` 20 detik; tidak ada INSERT/UPDATE/DELETE/DDL. Satu SQL yang gagal (savepoint) tidak menggugurkan invarian lain.
- Pastikan DB yang ditunjuk **sama dengan DB server yang dipukul skenario** (API di `FLEETIFY_API_URL`); kalau tidak, Pemeriksaan membaca database yang tidak disentuh skenario dan selalu "lulus".

## Menjalankan

```bash
bun run pemeriksaan                       # semua invarian sekali terhadap tenant, tanpa skenario
bun run scenario pinjaman-alat            # Pemeriksaan ikut otomatis; pelanggaran baru = exit code ≠ 0
bun run scenario pinjaman-alat --tanpa-pemeriksaan
```

Di panel, hasil muncul **langsung** di baris langkah yang baru selesai (chip abu-abu *memeriksa…*, hijau *DB ok*, merah *DB ✗ n*), panel *Aksi di langkah ini* menampilkan diff dokumen dan pelanggaran baru di langkah itu, dan ringkasan akhir tampil di layar Selesai/Gagal/Dihentikan serta di detail jalan pada Riwayat. CLI mencetak satu baris `✓ DB ok` / `✗ 2 pelanggaran: …` dan diff dokumen di bawah tiap langkah, lalu ringkasan. Hasil disimpan di `runs/<slug>/<waktu>/result.json` (`pemeriksaan` untuk ringkasan, `steps[].db` per langkah).

## Membaca hasil

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

Pelanggaran baru tidak otomatis berarti bug aplikasi: bisa SQL invarian yang kurang tepat untuk kasus itu, atau efek sesi lain pada DB yang sama. Telusuri barisnya dulu; kalau memang bug v2, catat sebagai temuan **Bug aplikasi** dari tombol di kartu.

## Mematikan invarian untuk satu skenario

Di berkas skenario JSON (lihat [SKEMA-SKENARIO.md](SKEMA-SKENARIO.md)):

```json
"pemeriksaan": {
  "nonaktif": ["approval-yatim"],
  "alasan": "Skenario ini sengaja membatalkan Order saat request approval-nya masih menunggu (menguji FMS-91)."
}
```

`nonaktif` hanya menerima id invarian yang ada; `alasan` wajib dan minimal 20 huruf. Jangan mematikan invarian hanya karena hasilnya merah — itu justru yang dicari.

## Menambah invarian

1. Tambahkan objek ke `INVARIAN` di `src/pemeriksaan/invarian.ts`: `id` (kebab), `judul`, `keterangan` (apa yang diperiksa dan dasarnya di kode v2), `sql`, `kolomKunci`, `tabel`.
2. SQL **hanya SELECT/WITH**, menerima `$1 = company_id` tenant, dan mengembalikan **baris yang melanggar** (nol baris = lulus). Cast angka ke `::text` supaya Decimal/BigInt tidak kehilangan presisi di JSON. Verifikasi nama tabel dan kolom terhadap `v2/Backend/prisma/schema/*.prisma` (`@@map`/`@map`), bukan menebak.
3. `kolomKunci` = kolom yang mengidentifikasi baris pelanggaran (untuk membandingkan baseline vs akhir). `tabel` = tabel yang wajib ada; bila tidak ada di DB, invarian dilewati, bukan galat. SQL boleh berupa fungsi `(tabel: Set<string>) => string` untuk cabang opsional (lihat `approval-yatim`).
4. Untuk penghitung yang hanya boleh tetap, pakai `mode: 'kenaikan'` + `kolomAngka`.
5. Jalankan `bun run pemeriksaan` (SQL harus jalan), `bun run test` (ada tes yang mengeksekusi semua SQL dalam `READ ONLY` bila `V2_DATABASE_URL` terisi), lalu `bun run docs:pustaka` untuk memperbarui daftar di bawah.

## Batasan

- **Deteksi, bukan bukti kebenaran.** Lulus berarti tidak ada pelanggaran dari daftar ini yang muncul; bukan berarti transaksi benar. Invarian yang tidak terdaftar tidak diperiksa.
- **Hanya tenant `TENANT_SLUG`** (kecuali `append-only`, yang global per database).
- **`pg_stat_user_tables` global per database**: aktivitas server atau sesi lain pada database yang sama ikut terhitung; penghitung diperbarui beberapa ratus milidetik setelah transaksi selesai.
- **Rantai movement** diurutkan `created_at, id`; baris yang `created_at`-nya kembar dengan baris lain pada pasangan (gudang, barang) yang sama dilewati pada pemeriksaan rantai karena urutannya tidak terjamin (`created_at` adalah awal transaksi).
- **Skema cabang.** Definisi mengikuti skema `v2/Backend` saat ditulis. DB dari cabang lain bisa tidak punya tabel tertentu (dilewati) atau memakai semantik lain (misalnya peminjaman alat dengan stok keluar vs reservasi); baca `keterangan` tiap invarian.
- Identitas baris lewat `kolomKunci`: perubahan nilai pada baris yang sudah melanggar sejak baseline tidak dilaporkan sebagai baru.
- **Snapshot adalah titik waktu setelah langkah**, bukan di dalam transaksi aplikasi: keadaan tidak konsisten yang terjadi dan pulih di dalam satu langkah tidak terlihat. Yang terlihat adalah inkonsistensi yang bertahan antar langkah (dicatat *sembuh di langkah m* bila pulih kemudian).
- Diff dokumen membaca seluruh baris (`to_jsonb`) dan mengabaikan `updated_at`; baris baru hanya menampilkan kolom status/nomor/kuantitas/rupiah.

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

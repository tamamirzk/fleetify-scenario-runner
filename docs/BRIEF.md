# Brief uji skenario

Untuk developer yang menulis atau memutar **skenario**: uji layar end-to-end yang diputar di browser terlihat dengan tempo lambat. Cara memasang dan menjalankan alat ada di [README](../README.md); format dan standar skenario di [MENULIS-SKENARIO.md](MENULIS-SKENARIO.md).

## Tujuan

Penonton melihat aplikasi dipakai seperti oleh orang sungguhan: tiap klik, isian, pergantian akun, dan approval terlihat di layar. Skenario bukan sekadar tes lulus/gagal. Langkahnya harus bisa diikuti dan masuk akal bagi orang yang melihat. Dari panel, penonton bisa menjeda, maju satu aksi, mengubah kecepatan, mulai dari langkah tertentu, dan mencatat temuan.

## Lingkungan

- Server v2 lokal: web http://localhost:5173, API http://localhost:3000, Authentik http://localhost:9000, dengan seed MBL (tenant `mbl`, PT Mining Corp).
- Jangan nyalakan atau matikan layanan v2 dari skenario.
- Satu browser sekaligus. Jangan menjalankan `tsc`/`vitest` repo v2 yang berat selagi skenario diputar headed di laptop yang lemah.

## Larangan

- **Tidak ada restore DB.** Alat ini tidak punya opsi restore, dan skenario tidak boleh men-DROP atau me-reset database.
- **DB hanya diubah lewat API aplikasi.** Pengecualian harus ditandai di `meta.pengecualian` beserta alasannya, dan disepakati tim dulu. Saat ini hanya `sla-eskalasi`, yang memajukan `due_at` satu request lewat SQL karena aplikasi tidak punya cara memajukan waktu.
- **Kredensial tidak disalin.** Akun admin hanya ada di `.env` lokal. Jangan menyalinnya ke skenario, log, laporan, atau commit.
- **Satu jendela browser.** Runner membuat satu konteks untuk persona langkah pertama dan berganti akun di jendela yang sama (`become`). Pekerjaan di belakang layar untuk persona lain memakai `ctx.as(who)`: sesi API tanpa jendela.
- **Hanya server lokal.** Konfigurasi menolak URL selain `localhost`.
- SQL baca-saja untuk mencari data saat menulis skenario boleh, tapi hasilnya tidak boleh ditulis sebagai id di skenario. Cari lewat API (`ctx.kit.findWarehouse`, `findVehicle`, `findWorkshop`, `findApprovalFlow`, `ctx.lib.personaUserId`).

## Aturan tontonan

1. **Tempo lambat.** Klik dan isian ditahan sekitar 3000 ms, banner sekitar 4000 ms. Kecepatan diatur dari panel, jangan mempercepat di skenario.
2. **Semua langkah penting terjadi di layar**, termasuk:
   - **Approval.** Ganti akun ke approver, buka Kotak Masuk (`/approvals`) atau halaman dokumen, lalu klik **Setujui** di panel approval.
   - **Serah terima material.** Isi dialog "Keluarkan dari Stok" di layar.
   - Hanya persiapan data yang membosankan yang boleh lewat API (di `setup` atau langkah bertanda "(di belakang layar)").
3. **Data segar, bisa diulang tanpa batas.** Lihat [MENULIS-SKENARIO.md](MENULIS-SKENARIO.md#3-data-segar-tiap-jalan).
4. **Penonton bisa menghentikan kapan saja** dari panel (Hentikan) atau dengan menutup jendela browser.
5. **Selector berbasis peran dan label** (`getByRole`, `getByLabel`) dengan teks bahasa Indonesia dari `Frontend/src/shared/i18n/locales/id.json` di repo v2. Baca komponennya sebelum menulis selector.
6. Jalankan headless dulu sampai lulus, baru diputar headed dari panel.

## Kalau menemukan masalah

- Bila aplikasi berperilaku tidak sesuai aturan bisnis, jangan memperbaiki kode v2 sambil menulis skenario. Catat temuan: skenario, langkah, yang terlihat, yang seharusnya, dan dugaan penyebab beserta `file:baris` bila jelas. Tombol **Catat temuan** di panel menulis entri dengan screenshot ke `docs/TEMUAN.md`. Teruskan ke tim lewat tiket.
- Bila yang gagal hanya skenarionya (selector salah, data habis), perbaiki skenarionya dan jalankan ulang.
- Hasil yang terlihat aneh tapi belum pasti salah dicatat dengan `ctx.note(teks)`: muncul di hasil langkah tanpa menggagalkannya.

## Skenario yang sudah ada

| Skenario | Isi | reach |
|---|---|---|
| `siapkan-zona` | Persiapan lingkungan: zona waktu MBL terkonfirmasi (jalankan sekali per DB) | - |
| `pinjaman-alat` | FMS-63: MR mandiri, pinjaman alat per peminjam, kembali sebagian, kembali dengan serial, catat tidak kembali | semua langkah |
| `penyesuaian-wo` | FMS-71/61/62: penyesuaian WO, approval, retur sampai diterima | langkah 2–3 |
| `sesi-ditolak` | FMS-31/32/34: sesi ditolak, dokumentasi terbawa, Riwayat item | langkah 2 |
| `sla-eskalasi` | FMS-42/43: SLA dan eskalasi alur PO, setelan dikembalikan | langkah 2 dan 8 |
| `tiket-order` | FMS-87/88/39: lewati pemeriksaan, kembali ke pemeriksaan, pemeriksaan ulang | tidak ada |

Rujukan aturan bisnis: `CLAUDE.md` dan `docs/claude/modules/*.md` di repo v2.

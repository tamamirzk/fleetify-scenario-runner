# Menulis skenario

Alur kerja menulis dan memperbaiki skenario. **Bentuk berkas, daftar aksi, sasaran, placeholder, aturan, dan daftar aksi pustaka ada di [SKEMA-SKENARIO.md](SKEMA-SKENARIO.md)**; dokumen ini tidak mengulanginya.

## Siapa menulis apa

- **AI (atau developer) di lokal** menulis dan memperbaiki berkas JSON di `scenarios/<modul>/<slug>.json`.
- **Panel** hanya membaca, memvalidasi, memutar, dan mencatat temuan. Panel tidak mengedit JSON dan tidak memanggil AI.
- **Pustaka TypeScript** (`src/pustaka/`) memuat hal yang rumit: membuat data, approval berlapis, serah terima, dialog panjang. Ditulis developer dan direview seperti kode biasa.

## Alur

```bash
bun run new wo retur-rusak FMS-62     # kerangka scenarios/wo/retur-rusak.json
bun run check:scenarios               # skema dan aturan
bun run scenario retur-rusak          # putar headless (CLI)
bun run panel                         # atau tonton dan kendalikan dari panel
```

1. Tulis JSON. Mulai dari `templates/skenario.json` atau contoh lengkap `scenarios/material/pinjaman-alat.json`.
2. Baca komponen v2 yang disentuh dan ambil teks tombol/label dari `Frontend/src/shared/i18n/locales/id.json` repo v2.
3. Bila butuh rangkaian yang tidak bisa ditulis dengan aksi sederhana (perulangan, kondisi, DOM yang sulit), tambah aksi pustaka, bukan selector CSS di JSON.
4. `bun run check:scenarios` sampai hijau. Panel menandai berkas tidak valid dan menolak memutarnya.
5. Putar headless sampai lulus **dua kali berturut-turut** (data segar tiap jalan membuktikan bisa diulang).
6. Tonton sekali di panel (headed) untuk memeriksa tempo dan banner.

## Memperbaiki dari temuan

- Saat menonton, catat temuan dengan `N`. Pilih **Skenario salah** bila yang keliru skenarionya (selector, urutan, data), **Bug aplikasi** bila aplikasinya, **Catatan** untuk hal lain.
- Di layar Skenario, ubin **Catatan untuk AI** mengumpulkan temuan Skenario salah untuk versi berkas yang sekarang. **Salin sebagai instruksi untuk AI** menghasilkan teks berisi path berkas, langkah, aksi, catatan, galat, dan screenshot; tempel ke AI di lokal.
- Begitu berkas JSON diubah, temuan lama dianggap sudah ditangani dan hilang dari ubin itu (tetap ada di riwayat).
- Langkah gagal bisa diulang dari langkah itu ("Ulang dari langkah N"): panel memakai data jalan yang gagal bila jalan itu berhenti tepat sebelumnya, atau data segar ditambah `capai` langkah itu.

## Standar yang direview manusia

Yang tidak bisa diperiksa otomatis:

- Judul langkah berupa kalimat aktif (siapa melakukan apa); `harusTerlihat` menyebut hal yang memang tampak di layar.
- Hal penting terjadi **di layar** (approval di panel Persetujuan, serah terima di dialog). Hanya persiapan data yang membosankan boleh lewat API, dengan banner "(di belakang layar)".
- Tiap langkah membuka sendiri halamannya dan, bila keadaan awalnya bisa dibangun lewat API, punya `capai`.
- Pemeriksaan hasil yang penting memakai `pastikanTerlihat`/`pastikanTidakTerlihat` atau aksi pustaka yang memeriksa lewat API; kejanggalan yang belum pasti salah memakai `"lunak": true`.
- Tempo: biarkan tahanan bawaan; kecepatan diatur dari panel.
- Setelan yang diubah dikembalikan di langkah terakhir dan diperiksa lagi di `bersihkan`.

# Daftar skenario lanjutan

Skenario yang belum ditulis, berurutan mengikuti alur kerja nyata dari laporan kerusakan sampai dokumen keluar. Ambil satu, tulis dengan `bun run new <task> <slug>`, dan ikuti [SKEMA-SKENARIO.md](SKEMA-SKENARIO.md) serta [BRIEF.md](BRIEF.md). Bila sudah selesai, pindahkan ke tabel "Skenario yang sudah ada" di BRIEF.

Pengingat singkat:

- Bagian `siapkan` membangun keadaan awal lewat aksi pustaka API tiap jalan. Skenario boleh memakai alur dari skenario lain hanya dengan membangun ulang keadaannya, bukan dari nomor dokumen yang ditulis tangan.
- Approval dan pergantian akun terjadi di layar; persiapan data membosankan boleh lewat API dengan banner "(di belakang layar)".
- Beri `capai` pada langkah yang keadaan awalnya bisa dibangun lewat API.
- Setelan yang diubah dicatat di `setelan`, dikembalikan di langkah terakhir, dan diperiksa lagi di `bersihkan`.
- Skenario 4 di bawah sudah ada sebagai `tiket-order`; nomor dipertahankan supaya rujukan tim tetap cocok.

## Blok pagi: dari laporan sampai Work Order

### 4. Tiket sampai Order (FMS-87, 88, 39)
Dedi menyetujui tiket baru. Putri membuat Order tidak terjadwal dan memilih **Lewati pemeriksaan** dengan alasan, lalu menampilkan kartu pemeriksaan yang terkunci. Putri lalu menekan **Kembali ke pemeriksaan**. Surya menugaskan pemeriksaan ke Made. Made mengisi hasil dan RPL, lalu mengajukan. Approver menekan **Revisi**: kartu "Pemeriksaan ditolak" tampil. Pemeriksaan ulang dilakukan, lalu **Setujui**.

### 5. Penawaran, WO terbit, material awal (FMS-60, 48)
Dari Order hasil skenario `tiket-order` (dibangun ulang di `siapkan`), Putri menyusun penawaran (harga part bengkel internal tampil baca saja mengikuti HPP), lalu mengajukan. Approval berlangsung di layar. WO terbit, dan MR awal otomatis Disetujui. Wati menyerahkan material lewat dialog **Keluarkan dari Stok** (penerima, jumlah, catatan, foto). Tunjukkan biaya aktual per baris di WO.

### 6. Sesi kerja, foto, verifikasi akhir (FMS-30, 33, 34, 35, 36, 55)
Fajar membuat sesi dan memilih Made. Made mengerjakan item **atas nama** pelaksana, dengan foto (tunjukkan batas 3 foto aktif). Sesi diakhiri dan disetujui. Item yang belum selesai berlanjut di sesi berikutnya, dan foto terbawa. Setelah semua item disetujui, verifikasi akhir muncul otomatis di Kotak Masuk. Approver menyetujui, dan WO menjadi **Sudah diperiksa**. Tunjukkan chip status WO yang berpindah: Menunggu material, Menunggu penugasan, Menunggu mekanik, Sedang perbaikan, Menunggu verifikasi sesi, lalu Menunggu verifikasi perbaikan.

### 7. Tambah part lewat RPL dan adendum (FMS-59, 60)
Di WO berjalan, Made mengajukan RPL tambahan part dari sesi aktif. Putri menyusun penawaran penambahan dan approval berlangsung di layar. Tunjukkan item masuk ke WO yang sama, **Adendum 1** bernomor, dan tautan bolak-balik antara WO, RPL, dan penawaran. Tunjukkan juga bahwa Made tidak melihat nilai adendum.

## Blok siang: material dan gudang

### 8. Kekurangan serah, MR lanjutan, PR dari selisih (FMS-50, 52, 53, 54)
Wati menyerahkan 3 dari 4 dengan alasan **Stok tidak cukup**, sehingga selisih Terbuka. Tunjukkan selisih yang sama di WO dan MR, lalu **Buat PR dari selisih**. Bagus menerima barang tanpa PO (GR) dengan pemberitahuan kebutuhan tertunda, lalu MR lanjutan Disetujui otomatis dan selisih Terpenuhi. Tunjukkan kolom **Kebutuhan tertunda** di daftar Barang.

### 9. Retur saat WO berjalan dan barang rusak (FMS-61, 62, 63)
Fajar mengajukan retur **Barang rusak, tukar** dengan foto. MR pengganti terbit, lalu Wati menerima retur dengan kondisi **Rusak** ke gudang scrap. Tunjukkan dokumen scrap dan stok gudang scrap.

### 10. Serah terima alat bertahap (setelah branch `fix/mr-mandiri-serah-bertahap` di-merge ke development)
Lewati skenario ini bila server v2 lokal belum memuat perbaikan itu. Isinya: MR mandiri dua alat, diserahkan ke Made hari ini dan ke Fajar di serah terima kedua lewat **dialog di layar** tanpa diminta alasan. Satu sisa ditandai **"Tandai sisa tidak akan diserahkan"** dengan alasan.

## Blok sore: approval, akses, dokumen

### 11. Lolos otomatis, event approval, preset (FMS-41, 76, 77)
Bagus membuka **Manajemen Workflow → Event approval** dan menunjukkan status tiap event. Ia menjalankan **Terapkan preset standar**: tampilkan dialog dengan tebakan peran, lalu **batalkan tanpa menerapkan**, atau terapkan lalu kembalikan sesuai langkah Wajib. Tunjukkan pengaju yang memegang tahap lebih tinggi sehingga tahap di bawahnya Dilewati di panel approval.

### 12. Approver berupa peran dan pengalihan (FMS-111, 41)
Panel approval menampilkan peran plus lokasi. Tunjukkan request yang **Macet** karena tidak ada pemegang peran, lalu dialihkan lewat **Permintaan Tertunda** dengan alasan, dan riwayat pengalihan tampil. Kembalikan setelan bila ada yang diubah.

### 13. Kotak Masuk: Tugas dan ambil tugas (FMS-38, 40)
Fajar dan Surya membuka tab **Tugas**. Fajar menekan **Ambil tugas**, dan Surya melihat kolom Dipegang. Fajar menekan **Lepas**, lalu Surya mengambilnya. Tunjukkan Wati (tanpa tab, langsung daftar tugas gudang) dan Made (tanpa Kotak Masuk).

### 14. Hak lihat harga dan peran pelapor (FMS-46, 47)
Buka WO yang sama sebagai Putri (harga tampil), Fajar (tanpa harga), dan Made (tanpa harga, tampilan fokus). Mira (pelapor) membuat tiket, menunya hanya Dasbor dan Keluhan/Tiket, tanpa Rp. Tunjukkan editor peran berbahasa Indonesia, termasuk pencarian "mekanik".

### 15. Nomor dokumen dan dokumen batal menarik approval (FMS-90, 91)
Bagus mengubah format nomor PO di Preferensi, Penomoran Dokumen, lalu membuat PO baru dengan nomor format baru. **Kembalikan format sesudahnya.** Ubah nomor PO secara manual dengan alasan, dan tunjukkan riwayat nomor. Batalkan PR yang menunggu approval: request hilang dari Kotak Masuk approver, dan Setujui dari tab yang belum dimuat ulang ditolak dengan pesan jelas.

## Blok penutup: servis berkala (PB)

### 16. Jadwal dan Order PB (FMS-10, 11, 12, 15, 16)
Jadwal Mendatang: tangga status (Mendatang, Jatuh tempo, Terlambat). Buat Order PB dari baris jadwal dan centang **Cover titik terlambat**. Tunjukkan chip "Dicakup #n" di jadwal dan kartu Program PB di Order.

### 17. SPK Manual (FMS-13, 18, 19)
Buat SPK Manual dari jadwal. Wati menyerahkan material. Putri melengkapi dokumentasi per baris dan nota, lalu Ajukan, dan Order Selesai. Tunjukkan status unit yang tidak berubah dan badge **SPK Manual** di riwayat unit.

### 18. Keputusan PB dan breakdown otomatis (FMS-95, 96, 97, 98)
Ubah tanggal estimasi dengan alasan dan tunjukkan riwayatnya. Jalankan `bun run scripts/run-maintenance-scan.ts decision` dari folder Backend v2 (perlu aksi pustaka bertanda `pengecualianDb` dan `pengecualian`): tugas keputusan muncul di Kotak Masuk, lalu putuskan **breakdown**. Jalankan `cutoff` dan tunjukkan unit berpindah ke Breakdown. Made melaporkan temuan dari WO PB, dan tiket temuan terpisah dari Order. **Kembalikan setiap setelan bertanda Wajib.**

## Kalau waktu tersisa
- Halaman Bottleneck (FMS-56): durasi status WO dari jalan hari ini.
- Stock opname berlingkup dan lokasi simpan GR/MR (fitur Dabbir dari development).

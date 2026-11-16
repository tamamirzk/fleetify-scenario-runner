# Daftar skenario lanjutan

Skenario yang belum ditulis, dikelompokkan per grup (perjalanan di Manajemen Workflow v2). Tiap grup punya satu **alur lurus** (jalur bahagia) dan beberapa **alur belok** yang mengambil jalan lain di satu langkah alur lurus; aturannya di [SKEMA-SKENARIO.md](SKEMA-SKENARIO.md#grup-dan-alur). Ambil satu, tulis dengan `bun run new <grup> <slug>`, dan ikuti [BRIEF.md](BRIEF.md). Bila sudah selesai, pindahkan ke tabel "Skenario yang sudah ada" di BRIEF.

Pengingat singkat:

- Bagian `siapkan` membangun keadaan awal lewat aksi pustaka API tiap jalan. Skenario boleh memakai alur dari skenario lain hanya dengan membangun ulang keadaannya, bukan dari nomor dokumen yang ditulis tangan.
- Approval dan pergantian akun terjadi di layar; persiapan data membosankan boleh lewat API dengan banner "(di belakang layar)".
- Beri `capai` pada langkah yang keadaan awalnya bisa dibangun lewat API.
- Setelan yang diubah dicatat di `setelan`, dikembalikan di langkah terakhir, dan diperiksa lagi di `bersihkan`.
- Nomor dalam kurung (#5, #6, …) adalah nomor lama daftar ini; dipertahankan supaya rujukan tim tetap cocok.
- Belokan yang ditandai *(belum dicek)* diambil dari docs v2; pastikan layarnya ada di server lokal sebelum menulis.

## Perbaikan Insidentil (`insidentil`)

Alur lurus: **`insidentil-lurus`** (sudah ada). Langkahnya: 1 driver melapor dari ponsel · 2 tiket disetujui · 3 Order dibuat · 4 pemeriksaan ditugaskan · 5 pemeriksaan + RPL (ponsel) · 6 pemeriksaan disetujui · 7 penawaran diajukan · 8 penawaran disetujui · 9 Perintah Kerja terbit · 10 material diserahkan · 11 sesi dibuka · 12 item dikerjakan (ponsel) · 13 sesi diakhiri · 14 sesi diverifikasi · 15–16 verifikasi akhir dua tahap · 17 WO selesai · 18 Order dan tiket tertutup.

| Belok di | Alur belok | Status |
|---|---|---|
| 2 | Odometer diragukan → tiket tertahan → revisi odometer *(belum dicek)* | belum |
| 3 | Lewati pemeriksaan → kembali ke pemeriksaan → pemeriksaan direvisi | ada: `tiket-order` |
| 3 | Tanpa pemeriksaan: penawaran disusun kosong *(belum dicek)* | belum |
| 8 | Penawaran ditolak atau diminta revisi oleh penyetuju anggaran (butuh gerbang anggaran yang benar-benar menahan, lihat TEMUAN) | belum |
| 11 | Penyesuaian WO + retur material | ada: `penyesuaian-wo` |
| 12 | Butuh part tambahan dari sesi aktif → RPL → penawaran penambahan → **Adendum 1** (#7). Tunjukkan item masuk ke WO yang sama, tautan bolak-balik WO, RPL, dan penawaran, dan Made tidak melihat nilai adendum | belum |
| 12 | Retur **Barang rusak, tukar** dengan foto → MR pengganti → Wati menerima ke gudang scrap (#9) | belum |
| 13 | Item belum selesai saat sesi diakhiri → berlanjut ke Sesi 2, foto terbawa; batas 3 foto aktif (#6) | belum |
| 14 | Sesi ditolak → dokumentasi terbawa → sesi diulang | ada: `sesi-ditolak` |
| 15 | Verifikasi akhir ditolak → sesi yang harus dikerjakan ulang dipilih | belum |

## Pengadaan & Gudang (`pengadaan`)

Alur lurus (belum): MR WO → serah kurang dengan alasan **Stok tidak cukup** → selisih Terbuka tampil sama di WO dan MR → **Buat PR dari selisih** → PO → GR → MR lanjutan Disetujui otomatis → selisih Terpenuhi (#8). Tunjukkan kolom **Kebutuhan tertunda** di daftar Barang.

| Belok di | Alur belok | Status |
|---|---|---|
| PO | GR tanpa PO dengan pemberitahuan kebutuhan tertunda (#8) | belum |
| MR | MR mandiri: pinjaman alat, kembali sebagian, tidak kembali | ada: `pinjaman-alat` |
| MR | Serah terima alat bertahap ke Made lalu Fajar lewat dialog di layar, satu sisa **Tandai sisa tidak akan diserahkan** (#10; perbaikan sudah ada di server lokal) | belum |
| PR | PR dibatalkan saat menunggu approval: request hilang dari Kotak Masuk, Setujui dari tab lama ditolak dengan pesan jelas (#15) | belum |

## Perbaikan Terjadwal (`terjadwal`)

Alur lurus (belum): Jadwal Mendatang dengan tangga status (Mendatang, Jatuh tempo, Terlambat) → Order PB dari baris jadwal → penawaran → WO → material → selesai → riwayat unit (#16).

| Belok di | Alur belok | Status |
|---|---|---|
| Order | Centang **Cover titik terlambat**: chip "Dicakup #n" di jadwal dan kartu Program PB di Order (#16) | belum |
| Order | SPK Manual: Wati menyerahkan material, Putri melengkapi dokumentasi per baris dan nota, Order Selesai; status unit tidak berubah, badge **SPK Manual** di riwayat unit (#17) | belum |
| Jadwal | Ubah tanggal estimasi dengan alasan, tugas keputusan → **breakdown** (#18; butuh skrip `run-maintenance-scan.ts` dan aksi bertanda `pengecualianDb`, kurang cocok untuk tontonan) | belum |

## Perbaikan Ban (`ban`)

Alur lurus (belum): tiket ban → pemeriksaan (ukur tapak/tekanan per posisi) → keputusan Ganti → RPL → penawaran → WO → ganti ban → ban lama masuk **Tahan** → ke gudang.

| Belok di | Alur belok | Status |
|---|---|---|
| Pemeriksaan | Rotasi → Order Reposisi → approval → dikerjakan *(belum dicek)* | belum |
| Pemeriksaan | Tidak perlu tindakan → tiket tertutup saat pemeriksaan disetujui *(belum dicek)* | belum |
| Tahan | Order Ban Bekas → kirim vendor → QC gagal → perlu keputusan *(belum dicek)* | belum |
| Tahan | Afkir batch → gerbang Afkir *(belum dicek)* | belum |
| (samping) | Penggantian langsung tanpa WO, ban lama kembali ke stok *(belum dicek)* | belum |

## Approval & Hak Akses (`approval`)

Tanpa alur lurus: mekanisme yang muncul di semua grup. Sudah ada: `sla-eskalasi`.

- **Lolos otomatis, event approval, preset (#11).** Bagus membuka **Manajemen Workflow → Event approval** dan menunjukkan status tiap event. **Terapkan preset standar**: tampilkan dialog dengan tebakan peran, lalu batalkan tanpa menerapkan, atau terapkan lalu kembalikan. Tunjukkan pengaju yang memegang tahap lebih tinggi sehingga tahap di bawahnya Dilewati.
- **Approver berupa peran dan pengalihan (#12).** Panel approval menampilkan peran plus lokasi. Request **Macet** karena tidak ada pemegang peran, dialihkan lewat **Permintaan Tertunda** dengan alasan; riwayat pengalihan tampil.
- **Kotak Masuk: Tugas dan ambil tugas (#13).** Fajar menekan **Ambil tugas**, Surya melihat kolom Dipegang; Fajar **Lepas**, Surya mengambilnya. Wati tanpa tab, Made tanpa Kotak Masuk.
- **Hak lihat harga dan peran pelapor (#14).** WO yang sama dibuka sebagai Putri (harga tampil), Fajar (tanpa harga), dan Made (tanpa harga, tampilan fokus). Mira membuat tiket, menunya hanya Dasbor dan Keluhan/Tiket. Editor peran berbahasa Indonesia, termasuk pencarian "mekanik".
- **Nomor dokumen (#15).** Ubah format nomor PO di Preferensi, Penomoran Dokumen, buat PO dengan format baru, **kembalikan format sesudahnya**; ubah nomor PO manual dengan alasan dan tunjukkan riwayat nomor.

## Kalau waktu tersisa

- Halaman Bottleneck (FMS-56): durasi status WO dari jalan hari ini.
- Stock opname berlingkup dan lokasi simpan GR/MR.
- Koreksi pembacaan meter (`feat/meter-reading-corrections`, sudah di `development`): antrean anomali, koreksi di dialog tiket, riwayat meter.

# Scenario Runner: Tugas saya, Kerja per tiket, dan Dasbor

Paket konsep untuk tim desain. Isinya prototipe yang sudah berjalan, bukan desain final: alurnya sudah teruji, tampilannya yang perlu diolah. Screenshot ada di folder `screenshots/` (resolusi 2×), token warna dan ukuran yang dipakai sekarang di `tokens.css`.

## 1. Apa ini

Scenario Runner adalah alat internal developer dan QA Fleetify v2. Bentuknya panel web yang berjalan di laptop developer (bukan aplikasi untuk pelanggan). Fungsi utamanya:

- **Memutar skenario uji** di aplikasi Fleetify seperti video: klik, isian, dan pergantian akun terlihat di layar dengan tempo lambat, bisa dijeda dan dicatat temuannya.
- **Mengelola pekerjaan dari tiket Plane** (alat manajemen tugas tim): mengambil tiket, mendokumentasikan keadaan aplikasi sebelum dan sesudah dikerjakan, lalu menghasilkan skenario uji untuk tiket itu.

Paket ini mencakup bagian kedua: tiga halaman baru (**Dasbor**, **Tugas saya**, **Kerja**) dan alur kerja yang menghubungkannya.

## 2. Pengguna dan konteks

- **Pengguna utama:** developer yang memegang tiket (saat ini satu orang, nantinya tim). Bekerja di laptop, sering berdampingan dengan editor kode dan sesi AI (Claude Code).
- **Peran AI:** AI mengerjakan tiket di sesi terpisah (merencanakan, mengubah kode, menulis skenario). Panel **tidak** menjalankan AI; panel mencatat kemajuan dan menampilkan hasilnya. Tombol "Salin perintah AI" menjembatani keduanya.
- **Pemakaian ponsel:** sekunder (memeriksa status). Semua halaman sudah responsif, tetapi desain utamanya desktop.

## 3. Alur kerja per tiket

Setiap tiket Plane melewati lima tahap. Tahap bisa dipindah maju atau mundur, dan setiap perpindahan tercatat di riwayat.

| # | Tahap | Siapa | Hasil |
|---|---|---|---|
| 1 | **Diambil** | Developer menekan **Ambil** di Tugas saya | Salinan tiket tersimpan |
| 2 | **Rencana & sebelum** | AI menulis rencana dan menentukan halaman/data yang perlu dipotret; panel memotret | Screenshot halaman aplikasi + snapshot data **sebelum** perubahan |
| 3 | **Dikerjakan** | AI mengubah kode | Branch dan commit tercatat |
| 4 | **Sesudah & skenario** | Panel memotret ulang; AI menulis skenario uji | Screenshot + data **sesudah**, perbandingan, skenario tertaut tiket |
| 5 | **Selesai** | Developer (dengan konfirmasi) mengirim komentar dan memindah status tiket di Plane | Tiket di Plane diperbarui |

Inti nilai halaman Kerja adalah **perbandingan sebelum/sesudah**: tim bisa melihat apa yang berubah di layar dan di data karena tiket ini.

## 4. Halaman

### 4.1 Dasbor (`01`, `02`)

Halaman pertama di menu. Tujuan: dalam satu pandangan tahu apa yang perlu dikerjakan dan apa yang bermasalah.

- **KPI (5 kotak):** tugas terbuka dari Plane · belum ada skenario · kerja aktif · jalan skenario lulus 7 hari (mis. 7/10, merah bila ada yang gagal) · temuan bug aplikasi. Kotak diberi aksen kuning/merah bila perlu perhatian.
- **Alur kerja per tiket:** papan 5 kolom (tahap 1–5) berisi kartu tiket yang sedang dikerjakan. Kartu menampilkan kunci tiket, judul, dan tiga tanda kelengkapan: sebelum · sesudah · skenario.
- **Jalan skenario 14 hari:** batang bertumpuk per hari (lulus/gagal/dihentikan) dan 6 jalan terakhir.
- **Skenario per grup:** batang jumlah skenario per grup alur bisnis.
- **Tugas Plane per status**, **Aktivitas terbaru** (gabungan aktivitas kerja dan jalan), **Temuan terbaru**.

### 4.2 Tugas saya (`03`–`08`)

Daftar tiket Plane yang di-assign ke pengguna, diambil langsung dari Plane (hanya dibaca). Meniru cara Plane menampilkan tugas.

- **Dua tampilan:** **Papan** (kanban, satu kolom per status Plane, urutan sama dengan Plane; kolom kosong diciutkan jadi lajur sempit berjudul tegak) dan **Daftar** (dikelompokkan per status, baris rapat). Pilihan diingat.
- **Isi tiap tugas:** kunci tiket (tautan ke Plane), ikon prioritas (gaya Plane), judul, label (warna dari Plane), tenggat, **skenario yang menautkan tiket ini** (atau penanda oranye "Belum ada skenario"), dan aksi kerja: tombol **Ambil**, atau chip tahap bila sudah diambil.
- **Saringan:** Semua / Punya skenario / Belum ada skenario, dan tuas "Tampilkan Done & Cancelled" (mati secara bawaan).
- **Ringkasan atas:** tugas terbuka · punya skenario · belum ada skenario.
- Saat ini semua 55 tugas pengguna berstatus "Ready in Staging and for Testing", jadi papan hanya punya satu kolom berisi. Desain sebaiknya juga mempertimbangkan papan dengan isi tersebar di banyak kolom (`04` menampilkan kolom Done/Cancelled).

### 4.3 Kerja satu tiket (`09`–`12`)

Halaman kerja per tiket, dibuka dari Tugas saya atau Dasbor.

- **Kepala:** jejak (Dasbor › kunci tiket · status Plane), judul tiket.
- **Penanda tahap 1–5:** tahap kini disorot, tahap sebelumnya dicentang; bisa diklik untuk memindah tahap.
- **Aksi:** Salin perintah AI (utama) · Potret sebelum/sesudah · Komentar ke Plane… · Pindah status Plane… · Segarkan dari Plane.
- **Ringkasan** (branch, commit, skenario, waktu potret, waktu komentar) dan **Riwayat** (linimasa perpindahan tahap dan kejadian).
- **Rencana:** dokumen teks yang ditulis AI (markdown sederhana).
- **Layar · sebelum dan sesudah:** per halaman yang dipotret, dua screenshot berdampingan. Screenshot berupa halaman penuh (bisa sangat panjang), dipotong dari atas dengan tombol "Ukuran penuh". Halaman yang dibuka sebagai mekanik atau driver berukuran ponsel.
- **Data · sebelum dan sesudah:** per query data, ringkasan beda (+ baris, − baris, berubah dengan nama kolomnya) lalu tabel sebelum dan sesudah berdampingan. Query yang gagal menampilkan pesan galatnya.
- **Tiket Plane:** salinan deskripsi tiket, bisa dilipat.
- **Dialog Plane (`11`, `12`):** komentar dan pindah status **terlihat oleh seluruh tim**, jadi selalu lewat dialog konfirmasi dengan pratinjau isi komentar atau pilihan status baru.

### 4.4 Konteks: Skenario per grup (`13`)

Halaman yang sudah ada sebelumnya, disertakan sebagai konteks. Skenario dikelompokkan per alur bisnis; tiap grup punya satu **alur lurus** (jalur bahagia, chip "Alur lurus") dan beberapa **alur belok** yang menyimpang di satu langkah ("↳ Belok di langkah 14 · …").

## 5. Aturan yang perlu dipertahankan

- **Tulis ke Plane wajib dikonfirmasi** dengan pratinjau dan kata "terlihat oleh tim". Jangan dibuat sekali klik.
- **Warna status dan label datang dari Plane** (data, bisa berubah). Desain jangan bergantung pada warna tertentu; status selalu punya nama/ikon, bukan warna saja.
- **Status tidak boleh hanya warna:** lulus/gagal di grafik dan daftar memakai ikon ✓ × ■ dan label.
- **Persona lapangan berponsel:** screenshot mekanik dan driver berbentuk tegak dan sempit; tata letak perbandingan harus menampung campuran laptop dan ponsel.
- **Screenshot bisa sangat panjang** (halaman penuh, hingga ±8.000 px untuk ponsel).
- **Data dan screenshot hanya lokal** di laptop developer; tidak ada yang diunggah.

## 6. Keadaan yang belum ada di screenshot

| Halaman | Keadaan | Perilaku sekarang |
|---|---|---|
| Tugas saya | Plane belum tersambung | Kotak petunjuk cara memasang kunci Plane |
| Tugas saya | Memuat / galat Plane | Teks "Memuat tugas dari Plane…" / kotak merah berisi pesan + Coba lagi |
| Tugas saya | Saringan tanpa hasil | "Tidak ada tugas yang cocok dengan saringan." |
| Dasbor | Belum ada tiket diambil | Kotak ajakan: buka Tugas saya lalu Ambil |
| Kerja | Belum ada target potret / rencana | Catatan abu-abu di tempat bagian itu |
| Kerja | Sedang memotret (±10–30 detik) | Teks status "Memotret sebelum…", tombol nonaktif |

## 7. Sistem visual sekarang

- Tema gelap "kaca" (latar hampir hitam, panel transparan berlapis). Mode terang belum didesain.
- Token di `tokens.css`: tipografi (sistem/SF), skala teks 11–26 px, radius kartu 12 px, warna status (sukses hijau, peringatan oranye, bahaya merah, info biru).
- Komponen yang dipakai ulang: kotak KPI, kartu bagian berjudul huruf kapital kecil, pil toggle, chip, tombol pil.

## 8. Yang kami minta dari desain

1. Hierarki **Dasbor**: apa yang paling penting dilihat pertama (usulan kami: tiket yang menunggu tindakan dan kegagalan).
2. **Papan kanban** yang tetap berguna saat satu kolom berisi puluhan kartu dan kolom lain kosong.
3. **Perbandingan sebelum/sesudah** untuk screenshot panjang dan campuran ukuran laptop/ponsel (mis. penggeser, sorot area yang berubah, mode tumpuk).
4. Penyajian **beda data** yang mudah dibaca orang non-teknis.
5. Kartu **tahap kerja** dan penanda kemajuan yang jelas di Tugas saya, Dasbor, dan halaman Kerja.
6. Bahasa visual untuk **aksi yang terlihat tim** (menulis ke Plane) agar berbeda dari aksi lokal.
7. Mode terang dan tata letak ponsel.

## 9. Daftar screenshot

| Berkas | Isi |
|---|---|
| `01-dasbor-desktop.png` | Dasbor, halaman penuh, desktop 1440 |
| `02-dasbor-ponsel.png` | Dasbor, halaman penuh, ponsel 390 |
| `03-tugas-papan-desktop.png` | Tugas saya, Papan |
| `04-tugas-papan-dengan-done-cancelled.png` | Papan dengan kolom Done dan Cancelled ditampilkan |
| `05-tugas-daftar-desktop.png` | Tugas saya, Daftar |
| `06-tugas-daftar-saring-punya-skenario.png` | Daftar, saringan "Punya skenario" |
| `07-tugas-papan-ponsel.png` | Papan di ponsel (kolom digeser ke samping) |
| `08-tugas-daftar-ponsel.png` | Daftar di ponsel |
| `09-kerja-desktop.png` | Kerja FMS-87, halaman penuh (tahap 1, sebelum sudah dipotret) |
| `10-kerja-ponsel.png` | Kerja FMS-87 di ponsel |
| `11-kerja-dialog-komentar-plane.png` | Dialog konfirmasi komentar ke Plane |
| `12-kerja-dialog-pindah-status.png` | Dialog konfirmasi pindah status Plane |
| `13-skenario-grup-alur-lurus-belok.png` | Konteks: skenario per grup dengan alur lurus dan belok |

Data di screenshot adalah data uji internal (tiket Plane tim dan tenant uji MBL). Satu query data di FMS-87 ("salah-sengaja") memang dibuat gagal untuk menunjukkan keadaan galat.

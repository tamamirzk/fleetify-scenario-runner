# Spesifikasi Dasbor Scenario Runner

Acuan visual: `desain/Main.dc.html`. Acuan token: `tokens/tokens.css` (asli) dan `tokens/tokens-tambahan.css` (baru).

## 1. Prinsip visual

- **Tema asli dipertahankan.** Latar `--sr-bg` dengan dua gradasi radial halus, panel `--sr-glass` (rgba(24,24,28,.62)) berbatas `--sr-line-2`, radius 14 px, ditambah sorot tipis `inset 0 1px 0 rgba(255,255,255,.06)`.
- **Font tetap `--sr-font`** (sistem/SF Pro, cadangan Inter). Mono (`--sr-font-mono`) hanya untuk kunci tiket (`FMS-87`) dan alamat (`localhost:5173`). Angka besar memakai `font-variant-numeric: tabular-nums`.
- **Netral dulu, warna untuk status.** Grafik memakai tingkat putih transparan. Warna hanya untuk arti:
  - biru `--sr-info`: tahap yang sedang aktif
  - hijau `--sr-success-text`: lulus, sudah ada
  - merah `--sr-danger` / `--sr-danger-text`: gagal
  - oranye `--sr-warning` / `--sr-warning-text`: perlu perhatian
- **Jangan jadikan hijau sebagai aksen utama.** Arahan ini sudah dicoba lalu ditolak karena terlalu hijau dan tebal.
- **Status tidak boleh hanya warna.** Selalu sertakan ikon atau teks: ✓ lulus, × gagal, ■ dihentikan, "! Perhatian".

### Pola kartu (dipakai semua kartu Dasbor)

- **Kepala kartu:** ikon 16 px (`--sr-text-2`), judul 15 px tebal 600, label tambahan opsional, lalu chip aksi di kanan, misalnya "Lihat semua ›" atau pilihan minggu. Chip tingginya 26 px, radius 8 px, batas `--sr-line-2`, latar `rgba(255,255,255,.04)`.
- **Blok angka:** label 11 px huruf kapital (letter-spacing .07em, `--sr-text-2`), di bawahnya angka besar 26–30 px tebal 600, ditambah keterangan kecil 12 px yang boleh berwarna status.
- **Pemisah:** garis tegak 1 px `rgba(255,255,255,.1)` di antara blok angka, dan garis datar `--sr-line` di atas deret angka.

## 2. Susunan Dasbor (atas ke bawah)

1. Kepala halaman: "Scenario Runner · operasional", judul **Dasbor**, tombol **Segarkan**.
2. **Sedang dikerjakan** (panel besar, lebar penuh).
3. **Lima kotak angka**.
4. Baris grafik: **Aktivitas jalan skenario** (± 3/5 lebar) dan **Produktivitas uji** (± 2/5 lebar).
5. Baris bawah (3 kolom): **Skenario per grup** (radar), **Temuan terbaru**, **Aktivitas terbaru**.

Sidebar mengikuti sidebar asli: logo di kiri atas, menu utama, Project › Fleetify v2 › Uji per modul, lalu blok Sasaran dan sumber Plane di bawah.

Di layar sempit, semua baris menumpuk. Gunakan flex-wrap atau grid `auto-fit`, dan sidebar ikut menumpuk di atas.

## 3. Komponen

### 3.1 Sedang dikerjakan

**Kepala:** ikon play, judul "Sedang dikerjakan", label biru "● N tiket aktif", lalu chip "Buka kerja ›" ke halaman Kerja tiket itu.

**Kolom kiri:**
- Chip mono kunci tiket (tautan ke halaman Kerja), status Plane, dan waktu diambil.
- Judul tiket: 19 px, tebal 600.
- **Penanda tahap:** lima kolom. Tiap kolom punya batang setinggi 40 px (radius 8/8/3/3) dan dua baris label (kapital kecil, lalu nama tahap).
  - **Sekarang:** gradasi `--sr-stage-current`, garis atas 2 px `--sr-info`, label "TAHAP n · SEKARANG" berwarna `--sr-info-text`.
  - **Berikutnya:** gradasi `--sr-stage-next`, garis atas `rgba(255,255,255,.22)`, label "TAHAP n · BERIKUTNYA".
  - **Belum:** gradasi `--sr-stage-todo`, garis atas `rgba(255,255,255,.1)`, nama tahap memakai `--sr-text-2`.
  - **Selesai** (belum ada di mock, usulan): gradasi `--sr-stage-done`, garis atas `rgba(255,255,255,.7)`, dan ikon ✓ sebelum nama tahap.
- **Empat angka:** Layar dipotret, Query data, Commit, Skenario. Nilai kosong ditampilkan "–" dengan keterangan "belum …".
- **Kotak langkah berikut:** latar `rgba(255,255,255,.03)`, batas `--sr-line`, radius 12. Isinya ikon panah, label "LANGKAH BERIKUT", teks sesuai tahap, dan tombol utama **Salin perintah AI** (pil putih).

**Kolom kanan** (dipisah garis tegak):
- **Gauge setengah lingkaran:** 20 segmen, 4 segmen per tahap, ukuran 11 × 24 px, radius busur 102 px. Segmen tahap selesai `rgba(255,255,255,.7)`, tahap sekarang `--sr-info`, sisanya `rgba(255,255,255,.08)`. Di tengah tertulis "n / 5" (32 px) dan label "TAHAP KERJA".
- **Keterangan bergaya tooltip:** "‹nama tahap› · sejak HH.MM".
- **Hasil kerja:** penghitung "x / 6", deret enam kotak kecil (terisi `rgba(255,255,255,.82)`), lalu daftar enam baris dengan ikon ✓ hijau atau ○ abu:
  1. Potret sebelum
  2. Rencana
  3. Branch & commit
  4. Potret sesudah
  5. Skenario uji
  6. Komentar Plane

  Item pertama yang belum selesai diberi status "Berikutnya". Item lain yang belum selesai berstatus "Belum".

**Teks langkah berikut per tahap:**

| Tahap sekarang | Teks |
|---|---|
| 1 Diambil | AI menulis rencana dan menentukan halaman serta data yang perlu dipotret. |
| 2 Rencana & sebelum | AI mengubah kode di branch tiket. |
| 3 Dikerjakan | Potret sesudah, lalu AI menulis skenario uji. |
| 4 Sesudah & skenario | Kirim komentar ke Plane dan pindah status (terlihat tim). |
| 5 Selesai | Tiket selesai. Ambil tiket berikutnya di Tugas saya. |

Jika ada query yang gagal, tambahkan kalimat pendek seperti di mock: "Query ‹nama› masih gagal."

**Keadaan:**
- **Tidak ada tiket aktif:** panel tetap tampil, tapi isinya diganti ajakan "Belum ada tiket yang diambil", dengan tombol "Buka Tugas saya" (sesuai KONSEP §6).
- **Lebih dari satu tiket aktif:** tampilkan tiket yang terakhir diperbarui. Label "● N tiket aktif" menjadi tombol yang membuka daftar tiket lain.
- **Sedang memotret:** tombol Salin perintah AI tetap aktif. Kotak langkah berikut menampilkan "Memotret sebelum…".

### 3.2 Lima kotak angka

Semua kotak memakai pola yang sama: ikon dan label kecil, angka 30 px, visual mini setinggi 6 px, lalu keterangan 12 px. Label status ("! Perhatian" oranye, "× n gagal" merah) ditaruh di kanan atas kotak, menggantikan garis tepi berwarna yang lama.

| Kotak | Angka | Visual mini | Keterangan | Label status |
|---|---|---|---|---|
| Tugas terbuka | jumlah tugas Plane terbuka | batang per status Plane, lebar sebanding jumlah | status dominan, chip "Plane ›" | – |
| Belum ada skenario | tugas tanpa skenario | batang cakupan (punya ÷ total) | "x sudah punya · cakupan y%" | "! Perhatian" bila > 0 |
| Kerja aktif | tiket di tahap 1–4 | 5 segmen tahap tiket teratas | "FMS-xx · tahap n dari 5" | – |
| Lulus · 7 hari | lulus / total jalan 7 hari | satu kotak per jalan: putih .5 lulus, merah gagal, putih .14 dihentikan | "✓ a · × b · ■ c dihentikan" | "× n gagal" bila > 0 |
| Temuan bug | temuan bertipe bug aplikasi | satu kotak per temuan, oranye untuk bug | "dari N temuan tercatat" | "! Perhatian" bila > 0 |

Jika total jalan 7 hari lebih dari 20, kotak-kotak mini diganti satu batang bertumpuk dengan urutan warna yang sama.

### 3.3 Aktivitas jalan skenario (heatmap)

- **Kisi:** 24 minggu × 7 hari, kolom per minggu (Senin di atas). Label bulan di atas kolom pertama tiap bulan, dan label Sen / Rab / Jum / Min di kiri. Kotak berbentuk persegi (`aspect-ratio: 1`), radius 3 px, celah 4 px.
- **Tingkat warna** dihitung dari jumlah jalan per hari (`--sr-heat-0` s.d. `--sr-heat-4`): 0, 1–2, 3–4, 5–6, ≥7.
- **Hari yang ada jalan gagal:** titik merah 4 px di pojok kanan atas kotak.
- **Hari ini:** cincin biru, `0 0 0 1.5px var(--sr-bg), 0 0 0 3px var(--sr-info)`.
- **Hari yang belum terjadi** tidak digambar.
- **Tooltip** (title atau popover): "Sen, 16 Nov · 10 jalan · 1 gagal".
- **Legenda di kanan bawah:** "● ada jalan gagal" dan skala "Sedikit □□□□□ Banyak".
- **Angka di bawah kisi:**
  - Total jalan 24 minggu, dengan "✓ x% lulus".
  - Rentetan sekarang, yaitu jumlah hari berturut-turut sampai hari ini yang punya jalan, ditambah "Terpanjang n hari".
  - Hari tersibuk, yaitu hari dengan total jalan terbanyak, ditambah "n jalan tercatat".
- **Kepala kartu:** ikon kisi, judul, dan chip "Lihat semua ›" ke Riwayat & laporan.

### 3.4 Produktivitas uji

- **Kepala:** ikon batang, judul, dan chip pemilih minggu, misalnya "9 Nov – 15 Nov ›". Bawaannya minggu berjalan.
- **Tiga angka:**
  - Jalan selesai, dengan delta dibanding minggu sebelumnya ("+12%" hijau, "−8%" merah).
  - Lulus, dengan "✓ x%".
  - Rata-rata harian, yaitu total ÷ jumlah hari yang sudah lewat di minggu itu, ditulis dengan koma desimal ("6,0 jalan").
- **Grafik:**
  - Tujuh batang (Sen–Min) dengan radius 6/6/2/2, gradasi `--sr-bar-fill`, dan garis atas 2 px `--sr-bar-cap`.
  - Garis bantu putus-putus di 0, ½, dan maks. Sumbu maks = `ceil(maks × 1,5 / 4) × 4`, minimal 4, supaya ada ruang untuk tooltip.
  - **Hari tersibuk** disorot: gradasi `--sr-bar-peak-fill`, garis atas `--sr-bar-peak-cap`, label hari lebih terang, dan tooltip tetap tampil berisi tanggal, jumlah jalan, serta "✓ a · × b".
  - Saat kursor diarahkan ke batang lain, tooltip pindah ke batang itu.

### 3.5 Skenario per grup (radar)

- Satu sumbu per grup alur bisnis. Skala maksimum = grup terbesar, dengan 4 cincin bantu.
- Isi area `rgba(255,255,255,.1)`, garis `rgba(255,255,255,.85)`, titik 3,5 px.
- Label sumbu "Nama grup · n".
- Jika grup kurang dari 3, ganti dengan daftar batang mendatar, seperti Dasbor lama.

### 3.6 Temuan terbaru dan Aktivitas terbaru

Daftar 4 baris, dengan baris dipisah garis `--sr-line`.
- **Temuan:** tipe ("Bug aplikasi" merah, "Catatan" abu), judul dipotong dengan elipsis, dan waktu.
- **Aktivitas:** label pil "Kerja" (biru muda) atau "Jalan" (abu), teks, dan waktu.

## 4. Logo

- Di sidebar, pakai `aset/logo/scenario-runner-app-icon.svg` ukuran 30 × 30 px.
- Di sampingnya teks "Scenario **Runner**": 16 px, "Scenario" tebal 500, "Runner" tebal 700, letter-spacing −0.02em, warna #F7F8FA.
- Favicon memakai `scenario-runner-app-icon-64.png`.
- Versi aksen biru (`app-icon-blue`) hanya opsional, sesuai README logo kit.

## 5. Halaman lain (acuan, bukan cakupan sesi ini)

- **Tugas saya · Papan:**
  - Status kosong diciutkan jadi deret chip.
  - Satu-satunya kolom yang berisi dilebarkan jadi kisi kartu, dikelompokkan per Sedang dikerjakan, Punya skenario, dan Belum ada skenario, masing-masing dengan "Tampilkan n lainnya".
  - Kartu yang sudah diambil menampilkan batang tahap mini dan tombol "Buka kerja".
- **Kerja:**
  - Penanda tahap 1–5 dengan baris "Berikutnya: …".
  - Aksi dibagi dua kelompok: **Lokal** dan **Terlihat tim · Plane**. Kelompok kedua diberi garis putus-putus ungu.
  - Perbandingan layar punya mode Berdampingan / Geser / Tumpuk, tombol *Sorot area berubah* dengan nomor area, dan peta halaman penuh di samping.
  - Beda data dibuka dengan kalimat ringkas dan chip (+ baru / berubah / sama / hilang), lalu tabel gabungan dengan tampilan berdampingan sebagai opsi.
- **Dialog Plane:**
  - Pita ungu "Terlihat oleh seluruh tim di Plane".
  - Pratinjau komentar seperti yang akan tampil di tiket.
  - Tombol kirim ungu (#6D4AFF).
  - Tetap wajib lewat konfirmasi, sesuai KONSEP §5.

Saat halaman-halaman ini dikerjakan nanti, samakan dulu warna dan fontnya ke tema asli seperti Dasbor.

## 6. Kriteria selesai untuk sesi ini

- [ ] Dasbor menampilkan komponen 3.1–3.6 dengan data asli. Tidak ada label "contoh data".
- [ ] Token baru ditambahkan dari `tokens-tambahan.css`. Tidak ada warna hijau di luar arti status.
- [ ] Keadaan kosong: tidak ada tiket aktif, tidak ada jalan dalam 24 minggu (heatmap tetap tampil kosong dengan teks "Belum ada jalan skenario"), dan Plane belum tersambung (kotak angka Plane menampilkan "–" dan tautan pengaturan).
- [ ] Semua status punya ikon atau teks, bukan warna saja. Kontras teks minimal 4,5:1.
- [ ] Tata letak menumpuk dengan rapi di lebar 390 px.
- [ ] Logo terpasang di sidebar dan favicon.

# Perintah untuk sesi AI

Ekstrak paket ini ke dalam repo Scenario Runner, misalnya di `docs/desain/dasbor/`. Sesuaikan path di perintah di bawah, lalu tempel perintahnya ke sesi Claude Code.

---

Kita akan mengimplementasikan desain baru halaman **Dasbor** Scenario Runner. Semua acuannya ada di `docs/desain/dasbor/`.

Baca dulu, dengan urutan ini:
1. `README.md`: isi paket dan cakupan sesi ini (Dasbor saja).
2. `SPEK.md`: spesifikasi komponen, sumber data, keadaan, dan kriteria selesai.
3. `tokens/tokens.css` (token asli) dan `tokens/tokens-tambahan.css` (token baru).
4. `desain/Main.dc.html`: artboard Dasbor dari kanvas desain. Isinya HTML dengan gaya inline. Pakai sebagai acuan struktur dan nilai CSS. Jangan disalin mentah: sintaks `{{…}}`, `<sc-for>`, `<sc-if>`, dan kelas `Component` adalah format kanvas, dan data di dalamnya data contoh.

Yang dikerjakan:
- Ganti Dasbor sekarang dengan susunan di SPEK §2. Komponennya: panel **Sedang dikerjakan**, lima kotak angka, heatmap **Aktivitas jalan skenario**, **Produktivitas uji**, radar **Skenario per grup**, **Temuan terbaru**, dan **Aktivitas terbaru**.
- Semua angka diambil dari data yang sudah ada di Scenario Runner: kerja per tiket, jalan skenario, temuan, dan tugas Plane. Kalau ada data yang belum tersedia untuk sebuah komponen (misalnya riwayat jalan per hari), tanya saya dulu sebelum membuat sumber data baru.
- Tambahkan token dari `tokens-tambahan.css` ke berkas token aplikasi. Jangan ubah nilai token lama.
- Pasang logo dari `aset/logo/` di sidebar dan sebagai favicon (SPEK §4).
- Tangani keadaan kosong dan galat sesuai SPEK §3 dan §6.

Batasan:
- Tetap memakai tema asli. Font sistem, panel kaca gelap, dan warna hanya untuk status. Jangan pakai hijau sebagai aksen.
- Status selalu punya ikon atau teks (✓ × ■ !), bukan warna saja.
- Jangan ubah halaman Tugas saya, Kerja, atau dialog Plane di sesi ini.
- Data dan screenshot tetap lokal. Tidak ada yang diunggah.

Sebelum mulai menulis kode, tuliskan rencana singkat: berkas mana yang diubah, dan dari mana tiap angka di Dasbor diambil. Setelah selesai, cocokkan hasilnya dengan daftar di SPEK §6.

# Scenario Runner · paket sesi kerja (desain Dasbor)

Paket ini untuk sesi kerja yang mengimplementasikan desain baru Scenario Runner, terutama halaman **Dasbor**. Isinya adalah hasil sesi desain di kanvas "Scenario Runner — konsep desain".

## Isi

| Berkas | Isi |
|---|---|
| `PERINTAH-AI.md` | Perintah siap tempel untuk sesi AI (Claude Code) yang mengerjakan implementasi |
| `SPEK.md` | Spesifikasi lengkap: struktur Dasbor, sumber data tiap angka, keadaan kosong/galat, aturan visual, dan catatan untuk halaman lain |
| `tokens/tokens.css` | Token asli dari paket konsep (tidak diubah) |
| `tokens/tokens-tambahan.css` | Token baru yang dipakai komponen Dasbor (heatmap, batang grafik, chip, tooltip, tahap) |
| `aset/logo/` | Logo kit Scenario Runner (SVG dan PNG) beserta README-nya |
| `desain/*.dc.html` | Sumber artboard dari kanvas, sebagai acuan struktur, ukuran, dan gaya |
| `desain/canvas.json` | Susunan artboard di kanvas |
| `referensi/KONSEP.md` | Brief asli dari paket konsep |

## Status tiap halaman

| Halaman | Berkas desain | Status |
|---|---|---|
| Dasbor (desktop, gelap) | `desain/Main.dc.html` | **Siap diimplementasikan.** Memakai tema asli. |
| Tugas saya · Papan | `desain/Tugas-papan.dc.html` | Konsep alur dan tata letak. Warna dan font belum disamakan ke tema asli. |
| Kerja satu tiket | `desain/Kerja.dc.html` | Konsep alur dan tata letak. Warna dan font belum disamakan ke tema asli. |
| Dialog tulis ke Plane | `desain/Dialog-plane.dc.html` | Konsep. Aksi yang terlihat tim diberi warna ungu. |
| Dasbor dan Kerja ponsel (terang) | `desain/*-ponsel-terang.dc.html` | Konsep awal, ditunda dulu. |

Untuk sesi kerja ini, cakupannya **Dasbor saja**. Halaman lain hanya acuan.

## Tentang berkas `.dc.html`

Berkas ini adalah artboard dari kanvas desain. Isinya HTML biasa dengan gaya inline, ditambah sedikit sintaks template (`{{nama}}`, `<sc-for>`, `<sc-if>`) dan kelas `Component` di bagian bawah yang menghitung data contoh. Berkas ini tidak bisa dibuka langsung di peramban tanpa runtime kanvas. Baca sebagai acuan struktur dan nilai CSS, lalu tulis ulang di stack Scenario Runner. Untuk melihat tampilannya, buka kanvasnya.

## Data contoh

Di desain, kartu **Aktivitas jalan skenario** (heatmap) dan **Produktivitas uji** memakai data contoh dan diberi label "contoh data". Label itu **tidak ikut diimplementasikan**. Di aplikasi, kedua kartu membaca data jalan skenario yang asli. Angka lain di Dasbor diambil dari screenshot paket konsep.

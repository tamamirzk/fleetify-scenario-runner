# Rancangan alur Kerja v2

**Status:** disetujui Tams 17 Nov 2026; ketujuh tahap diimplementasikan 17 Nov 2026 (lihat §11 K15–K18 untuk penyesuaian dan yang belum dikerjakan).
**Fungsi dokumen:** acuan tunggal. Setiap tahap implementasi dicocokkan ke kebutuhan bernomor (`R-…`) di sini. Perubahan rancangan hanya lewat entri baru di §11 *Log keputusan*, tidak dengan mengubah diam-diam.
**Menggantikan:** alur 6 tahap di `docs/KERJA.md` dan skill `kerjakan` (keduanya diperbarui saat tahap implementasi terkait selesai).

## 1. Tujuan

Tools ini membantu Tams memonitor, me-review, dan mendokumentasikan pekerjaan AI di v2. Setiap fitur dinilai dengan empat target:

| Target | Artinya |
|---|---|
| **Cepat** | Lebih sedikit menunggu dan lebih sedikit langkah manual per tiket |
| **Mudah** | Tams hanya disentuh di titik keputusan; satu klik untuk lanjut |
| **Terstruktur** | Status dihitung dari gerbang, bukan diklaim; dokumen punya bentuk tetap |
| **Irit token** | Pekerjaan pasti dijalankan CLI/panel; AI hanya dipakai untuk berpikir |

Latar: pada empat tiket meter (FMS-105/154/155/157), catatan tertinggal basi, CI merah setelah push, dan penyebab masalah FMS-155 tidak ditulis. Semuanya karena tahap ditandai selesai tanpa gerbang.

## 2. Peran

- **R-2.1** AI mengerjakan; Tams memantau, memutuskan, dan memverifikasi.
- **R-2.2** Akhir kerja AI adalah **push ke satu branch**. **Tams membuat MR sendiri lewat GitLab**; AI tidak membuat MR.
- **R-2.3** Aksi yang terlihat tim (Plane) dan push selalu lewat klik Tams di panel.

## 3. Fase dan titik sentuh

```
 AI     1. PAHAMI ──► 2. KERJAKAN ──► 3. SERAHKAN ──► 4. MERGE (tim lain)
 Tams        ◆A setujui      ◆B review       ◆C izinkan push      ◆D Plane Code Complete
             rencana         hasil           + Plane              → Selesai
```

| Fase | AI mengerjakan | Hasil | Titik Tams |
|---|---|---|---|
| 1. Pahami | Telusuri kode dan data; **ulangi klaim tiket di data**; potret sebelum | **Brief**: masalah & penyebab, kriteria → cara membuktikan, rencana per lapisan, risiko, pertanyaan + usulan jawaban | **◆A** Setujui / Minta ubah |
| 2. Kerjakan | Kode di branch kerja; tes terfokus; verifikasi per kriteria; potret sesudah | Commit, bukti per kriteria, catatan "Yang dikerjakan" | **◆B** Setuju / Minta ubah |
| 3. Serahkan | Merge `development`, gerbang CI penuh, deskripsi MR dari catatan, draf Plane, panen dokumentasi ke docs-site modul | Branch siap push | **◆C** Push (panel) → Tams buat MR di GitLab; kirim Plane |
| 4. Merge | Panel mendeteksi MR sudah di-merge ke `development` (commit push ada di `origin/development`) | Catatan serah-terima untuk tim staging | **◆D** Plane **Code Complete** → Selesai |

- **R-3.1** ◆A wajib untuk tiket To Do. Tiket Ready in Staging melewati fase 2 (langsung verifikasi).
- **R-3.2** Tiket kecil: ◆A boleh dilewati bila Brief tanpa pertanyaan; ◆B dan ◆C boleh digabung ("Setuju & push"). Tiket dengan migrasi, izin, atau perubahan API: semua titik wajib.
- **R-3.3** Keputusan yang diambil AI sendiri wajib muncul di Brief (◆A) atau di "Yang perlu kamu perhatikan" (◆B), tidak boleh diam-diam.

## 4. Gerbang

Fase dianggap selesai bila gerbangnya lulus, **bukan** karena tahap dipindah manual.

| Gerbang | Kapan | Sifat |
|---|---|---|
| Brief lengkap (masalah & penyebab, kriteria, rencana) | Akhir Pahami | Menolak |
| Tes terfokus lulus | Selama Kerjakan | Menolak |
| Setiap kriteria punya hasil + bukti (gambar/query ada di disk) | Akhir Kerjakan | Menolak |
| Server slot = commit kerja terakhir | Sebelum potret sesudah | Menolak |
| Catatan tanpa "Usulan"/"Pertanyaan terbuka" yang belum dijawab | Akhir Kerjakan | Menolak |
| **Gerbang CI penuh** = langkah persis `.gitlab-ci.yml` (export openapi, cek sinkron `Frontend/openapi.json`, gen:client, check, typecheck, tes) | Serahkan, sebelum push | Menolak |
| Gambar di `verifikasi/` yang tak dirujuk kriteria | Akhir Kerjakan | Peringatan |
| Kegagalan tes yang juga gagal di `development` | Gerbang CI | Peringatan (dicatat, tidak menolak) |

- **R-4.1** Gerbang bertingkat: tes terfokus saat bekerja; CI penuh hanya sekali di Serahkan dan berjalan di latar.
- **R-4.2** Tombol Push di panel hanya aktif bila gerbang CI hijau.

## 5. Pembagian aksi: panel · chat · terminal

| Tempat | Fungsi | Contoh |
|---|---|---|
| **Panel (web)** | Pantau dan putuskan; aksi pasti | Ambil ke slot / Antrekan (Tugas saya), ◆A–◆D, Push, kirim Plane, Jalankan fase, Buka terminal, Workspace |
| **Terminal (tmux)** | Menonton dan menyela Claude yang bekerja | Setujui izin alat, ketik arahan, Esc untuk berhenti |
| **Chat VS Code** | Diskusi yang tak muat di tombol | "Kenapa begini?", "coba cara lain", jelaskan diff |

- **R-5.1** Semua pilihan Tams di panel disimpan ke `kerja.json`; sesi Claude membaca dari sana, sehingga Tams tak perlu mengulang penjelasan.
- **R-5.2** Setiap butir "Butuh kamu" punya tombol aksi utama; bila butuh AI, tombolnya menjalankan fase berikut (§6).

## 6. Menjalankan Claude

- **R-6.1** Satu tiket = satu sesi Claude (`--session-id`, lalu `--resume`), ID-nya di `kerja.json`.
- **R-6.2** Panel menjalankan fase dalam sesi tmux `kerja-<KEY>` di worktree slot tiket, lalu membuka Terminal.app (`osascript`) tersambung ke sesi itu. Menutup jendela tidak menghentikan kerja; tombol **Buka terminal** menyambung lagi.
- **R-6.3** Mode per fase: **Terminal (bawaan)** atau **Latar** (`claude -p --output-format stream-json`, progres hanya di panel).
- **R-6.4** Hook Claude Code (`Notification`, `Stop`) mengabari panel; tiket pindah ke lajur "Butuh kamu" saat Claude menunggu atau selesai. Kartu tiket menampilkan cuplikan terminal (`tmux capture-pane`).
- **R-6.5** Izin alat per fase: Pahami hanya baca; Kerjakan boleh menulis di worktree slotnya; `git push`, Plane, dan migrasi di luar slot **diblok di level alat** (`--disallowedTools`). Batas biaya per fase untuk mode Latar (`--max-budget-usd`; CLI tidak punya `--max-turns`, lihat K15).
- **R-6.6** Penyapuan kode lintas berkas memakai subagent Claude bermodel murah. **Delegasi ke model kantor (`delegate.sh`) sudah tidak tersedia.**

## 7. Lingkungan: slot

| Slot | Worktree | API | Web | Database | Redis DB | Callback login |
|---|---|---|---|---|---|---|
| 1 | `~/work/fleetify/v2-slot1` | 3010 | 5181 | `fleetify_slot1` | 1 | `http://localhost:3010/api/v1/auth/callback` |
| 2 | `~/work/fleetify/v2-slot2` | 3020 | 5182 | `fleetify_slot2` | 2 | `http://localhost:3020/api/v1/auth/callback` |
| 3 | `~/work/fleetify/v2-slot3` | 3030 | 5183 | `fleetify_slot3` | 3 | `http://localhost:3030/api/v1/auth/callback` |

Port di atas bebas per 17 Nov 2026.

- **R-7.1** **Batas kerja: maksimal 3 tiket aktif, satu per slot.** Tiket ke-4 masuk lajur **Antre** (urutan diatur Tams); saat slot kosong, panel menawarkan tiket teratas tanpa menjalankannya otomatis.
- **R-7.1a** **Tiket diambil dari halaman Tugas saya**, dan Tams **memilih slotnya** saat itu. Tombol **Ambil** membuka pilihan:
  - *Slot n · kosong* — worktree slot dipindah ke branch baru dan DB slot di-reset dari template (keterangan ini tertulis di pilihan);
  - *Slot n · klaster `<kunci>`* — gabung ke klaster yang sudah memakai slot itu; tanpa reset DB, branch sama;
  - *Slot n · dipakai `<KEY>`* — tampil tapi nonaktif;
  - *Antrekan* — bila tak ada slot yang cocok, atau Tams memilih menunda.

  Tiket dari Antre juga ditempatkan lewat pilihan yang sama (dari Workspace atau Dashboard).
- **R-7.2** **Batas server dinamis berdasarkan tekanan memori**, bukan angka tetap. Panel **menolak menyalakan server slot baru** saat memori tertekan dan menyarankan slot diam mana yang dimatikan. Selebihnya panel hanya **menyarankan**, tidak mematikan otomatis. (Pengamatan 17 Nov: RAM 8 GiB sudah 94% terpakai sebelum ada slot.)
- **R-7.3** Slot dilepas saat push di Serahkan selesai. Menunggu merge tidak memakai slot. Satu klaster = satu slot.
- **R-7.4** **Postgres 16 dan Redis berjalan native di Mac** (Homebrew); **Authentik tetap di Colima** dengan VM diperkecil. Postgres 14 Homebrew lama (rusak, tak dipakai v2) tidak disentuh.
- **R-7.5** Database emas `fleetify_template` (seed MBL + data uji). Database slot di-reset dari template (`CREATE DATABASE … TEMPLATE`) saat tiket diambil.
- **R-7.6** Halaman **Workspace** di panel:
  - **kartu per slot**: tiket/klaster, fase, status sesi Claude (bekerja / menunggu Tams / diam) + cuplikan terminal, branch, HEAD dibanding commit kerja, status push, server API/web, DB slot (ukuran, waktu reset), RAM dan disk slot. Tombol: Buka terminal, Hentikan, Nyalakan/Matikan server, Migrasi, Reset DB;
  - **layanan bersama**: Postgres, Redis, Authentik/Colima, dengan tombol nyalakan;
  - **Antre**: urutan tiket berikutnya, bisa diatur;
  - **strip komputer** (R-7.9) di atas.
- **R-7.7** Cek kesehatan sebelum potret dan sebelum menjalankan fase; hasilnya juga di Dashboard. (17 Nov: Colima mati setelah restart dan tak ada tanda di panel.)
- **R-7.9** **Monitoring komputer:** CPU (beban), RAM + tekanan memori, disk. Pemakaian dikelompokkan menurut arti (Slot 1/2/3, sesi Claude, VM Colima, Spotlight, aplikasi lain). Peringatan disertai saran tindakan, mis. "matikan server slot 2 yang diam", "bersihkan `runs/` lama / prune Docker", "Spotlight mengindeks `~/work`: kecualikan di Pengaturan" (pengaturan sistem tetap dilakukan Tams sendiri). Versi mini tampil di Dashboard.
- **R-7.8** Worktree lama (`v2`, `v2-test`, `v2-sprint`, `v2-sprint-2`, `v2-design-check`) dicek dulu bahwa tak ada pekerjaan yang belum di-push, baru dipensiunkan.

## 8. Data dan dokumentasi

`kerja.json` mendapat field baru:

| Field | Isi |
|---|---|
| `slot` | 1–3, atau null bila antre/pasca-deploy |
| `klaster` | Kunci klaster bila berbagi branch |
| `sesiClaude` | ID sesi Claude tiket ini |
| `fase`, `gerbang` | Fase sekarang dan hasil tiap gerbang (dihitung, bukan diisi manual) |
| `keputusan[]` | `{apa, siapa, kapan, alasan}` |
| `pertanyaan[]` | `{teks, usulan[], jawaban, dijawabPada}`; tertutup saat dijawab |
| `mintaUbah[]` | Catatan Tams dari ◆A/◆B |
| `cekStaging[]` | `{teks, selesai}` — catatan serah-terima untuk tim staging (K19), bukan tugas Tams |
| `mr` | Link MR yang ditempel Tams |
| `metrik` | Lama per fase, jumlah kerja ulang, perkiraan token |

- **R-8.1** Catatan adalah dokumen hidup dengan bentuk tetap: **Masalah & penyebab · Keputusan · Yang dikerjakan · Verifikasi · Kendala · Catatan untuk tim staging**. Verifikasi, Keputusan, dan Setelah deploy dirender dari data, sehingga tak bisa basi.
- **R-8.2** Untuk tiket berbentuk keluhan, Brief wajib mencoba mengulang klaim di data dan mencatat hasilnya apa adanya, termasuk bila tak terulang.
- **R-8.3** Saat Serahkan, bagian Keputusan dan Yang dikerjakan dipanen ke docs-site `fleetify-ops` halaman modul v2 terkait.
- **R-8.4** Deskripsi MR dibuat otomatis dari catatan; tombol **Salin deskripsi MR** di panel.

## 9. Tampilan

- **R-9.1** Dashboard = *apa yang harus aku lakukan*:
  - lajur **Butuh kamu · AI sedang jalan · Menunggu pihak lain**, plus **Antre**; lajur kiri satu-satunya yang wajib dilihat tiap hari;
  - strip mini: 3 slot (● bekerja · ◆ menunggu · ○ kosong) + kesehatan komputer; klik membuka Workspace;
  - kotak angka hanya yang memicu tindakan: tiket butuh keputusan, CI merah, cek staging terbuka;
  - Temuan terbaru (ringkas).
- **R-9.4** Halaman **Statistik** menampung tren: heatmap jalan skenario, produktivitas uji, radar per grup skenario (dipindah dari Dashboard), dan metrik waktu/token per tiket (R-9.3). Pembagian: **Dashboard = tindakan · Workspace = mesin dan slot · Statistik = tren**.
- **R-9.2** Paket review (◆B) satu layar: kriteria + bukti berdampingan; "Yang perlu kamu perhatikan" (penyimpangan dari tiket, keputusan AI sendiri, temuan di luar cakupan, risiko); ringkasan kode per lapisan; status gerbang.
- **R-9.3** Panel mencatat dan menampilkan metrik per tiket (R-8 `metrik`) agar manfaat tools bisa diukur.

## 10. Irit token (aturan kerja AI)

- **R-10.1** Pekerjaan pasti (push, potret, CI, cek kesehatan, Plane, lingkungan) adalah perintah CLI/panel; AI menjalankan, tidak merakit ulang.
- **R-10.2** Keluaran CLI ringkas: "✓ n/n" atau daftar yang gagal; detail ditulis ke berkas.
- **R-10.3** Serah-terima antarfase lewat `kerja.json` + Brief, bukan riwayat obrolan panjang.
- **R-10.4** Pemeriksaan tampilan lewat DOM/teks; screenshot hanya untuk bukti yang akan dilihat Tams.
- **R-10.5** Pengetahuan lingkungan (koneksi DB, peran, langkah CI, port) dicatat sekali dan dipakai ulang.

## 11. Log keputusan

| # | Tanggal | Keputusan |
|---|---|---|
| K1 | 17 Nov | Alur 4 fase + titik ◆A–◆D; tahap dihitung dari gerbang |
| K2 | 17 Nov | ◆A wajib untuk To Do; gerbang CI dan bukti menolak, lainnya peringatan |
| K3 | 17 Nov | Dokumentasi: sumber lokal `kerja/`, dipanen ke docs-site per modul |
| K4 | 17 Nov | Per tiket dengan field `klaster` |
| K5 | 17 Nov | Akhir kerja AI = push satu branch; Tams membuat MR di GitLab |
| K6 | 17 Nov | 3 slot; maks 3 tiket aktif, tiket ke-4 antre; server maks 2 menyala |
| K7 | 17 Nov | Postgres 16 + Redis native; Authentik tetap di Colima; reset DB slot dari template saat tiket diambil |
| K8 | 17 Nov | Panel menjalankan Claude per fase di tmux + Terminal (bawaan) atau latar; tmux dipasang |
| K9 | 17 Nov | Delegasi model kantor tidak tersedia; penyapuan memakai subagent bermodel murah |
| K10 | 17 Nov | Dokumen ini di `docs/` scenario-runner |
| K11 | 17 Nov | Halaman **Workspace** (bukan "Lingkungan"): kartu slot, layanan bersama, Antre, strip komputer |
| K12 | 17 Nov | Statistik skenario pindah ke halaman Statistik; Dashboard berisi lajur tindakan + strip slot/komputer |
| K13 | 17 Nov | Monitoring komputer; batas server dinamis (menolak slot baru saat memori tertekan, selebihnya hanya saran) — menggantikan "maks 2 server" di K6 |
| K14 | 17 Nov | Tiket diambil dari Tugas saya dengan memilih slot (kosong / gabung klaster / Antrekan) |
| K15 | 17 Nov | Tahap 3: batas per fase memakai `--max-budget-usd` (tidak ada `--max-turns`); sesi Claude berjalan di akar scenario-runner dengan worktree v2 sebagai `--add-dir`; larangan push terbukti berlaku di mode izin `acceptEdits` dan `auto`, termasuk saat `git *` diizinkan |
| K16 | 17 Nov | Tahap 5: Postgres 16 dan Redis native di port **5433** dan **6380** (Docker tetap 5432/6379 untuk Authentik dan v2-test); Redis native memakai `requirepass` yang sudah ada. Isolasi sesi antar-slot lewat **nama cookie per slot** (`SESSION_COOKIE_NAME`/`REFRESH_COOKIE_NAME` + `_slotN`), bukan nama host. API slot dipanggil langsung (proxy `/api` di `vite.config.ts` v2 selalu ke :3000). Slot terisi selalu bisa dipilih sebagai *gabung klaster*. VM Colima belum diperkecil: masih menampung DB v2-test sampai v2-test dipensiunkan |
| K17 | 17 Nov | Tahap 6: lajur juga mencakup ◆C (Serahkan → Push → buat MR) dan ◆D (cek staging tercentang → Plane); "Menunggu pihak lain" = sudah di-push dan ber-MR dengan cek staging terbuka. Catatan mendapat bagian **Perlu diperhatikan** (sumber paket review). Tombol ◆B **Setuju & Serahkan** langsung menjalankan fase Serahkan; **Minta ubah** menjalankan fase Lanjutkan. Belum dikerjakan: gabungan ◆B+◆C untuk tiket kecil (R-3.2) dan pengaturan urutan Antre |
| K18 | 17 Nov | Tahap 7: metrik = waktu kalender per tahap dari riwayat, kerja ulang (tahap mundur, minta ubah, CI gagal), token dari transkrip sesi Claude yang dijalankan dari panel (sesi chat VS Code tidak terhubung ke tiket). Panen ke `database/v2/<modul>/progres-plane/<kunci>.md` + `00-indeks-kerja.md` (preseden folder progres-plane); `alur.md`/`status.md` yang dikurasi tidak disentuh; commit fleetify-ops oleh Tams |
| K19 | 17 Nov | **Tugas Tams berhenti saat MR di-merge ke `development`**; deploy dan pengecekan staging dikerjakan tim lain. Fase 4 menjadi *Merge*: panel mendeteksi merge sendiri, lalu ◆D = kirim Plane **Code Complete** → Selesai. `cekStaging` menjadi catatan serah-terima untuk tim staging (deskripsi MR, panen docs), bukan gerbang atau angka tugas. Menggantikan ◆D di K1 dan K17 |

## 12. Tidak termasuk

- AI membuat MR (lihat R-2.2).
- Desain ponsel panel (ditunda sejak paket desain Laporan Kerja).
- Delegasi ke model kantor.

## 13. Tahap implementasi

Urutan = yang paling cepat balik modal dulu. Satu tahap baru dimulai setelah tahap sebelumnya memenuhi "Selesai bila".

| # | Tahap | Kebutuhan | Selesai bila |
|---|---|---|---|
| 1 | Perintah CLI pasti, keluaran ringkas | R-10.1, R-10.2, R-4.1 | `kerja gerbang`, `kerja potret`, `kerja kesehatan` mengeluarkan satu baris ringkas + berkas detail; gerbang CI mengulang `.gitlab-ci.yml` persis dan menandai kegagalan yang juga ada di `development` |
| 2 | Brief, template catatan, log keputusan | R-3.3, R-8.1, R-8.2, R-5.1 | `kerja.json` punya `keputusan/pertanyaan/mintaUbah`; catatan dirender dari data; gerbang "catatan tanpa usulan terbuka" menolak |
| 3 | Panel menjalankan Claude per fase | R-6.1–R-6.5, R-5.2 | Dari panel: Jalankan fase → sesi tmux + Terminal; hook memindah tiket ke "Butuh kamu"; izin per fase terbukti memblok `git push` |
| 4 | Gerbang bertingkat + Push dari panel | R-4.1, R-4.2, R-2.3, R-8.4 | Tombol Push nonaktif saat CI merah; push sukses tercatat; Salin deskripsi MR |
| 5 | Slot, Postgres/Redis native, Workspace, monitoring komputer | R-7.1–R-7.9 | 3 slot jalan dengan port/DB/Redis/callback sendiri; Ambil di Tugas saya memilih slot (kosong/klaster/Antrekan); reset dari template; halaman Workspace; strip komputer dengan saran; slot baru ditolak saat memori tertekan |
| 6 | Dashboard tiga lajur, paket review, halaman Statistik | R-9.1, R-9.2, R-9.4 | Semua tiket aktif tampil di lajur yang benar; ◆B bisa diputuskan dari satu layar; grafik skenario pindah ke Statistik |
| 7 | Pengukuran + panen docs-site | R-9.3, R-8.3 | Metrik per tiket tampil; panen ke docs-site lulus `npm run check-v2` |

## 14. Menjaga agar tidak melenceng

1. Sebelum memulai tahap, baca ulang baris tahap di §13 dan kebutuhan yang dirujuknya.
2. Setiap commit implementasi menyebut kebutuhan yang dipenuhinya, misalnya `(R-4.2)`.
3. Di akhir tahap, laporan ke Tams berupa daftar kebutuhan tahap itu dengan tanda ✓/× dan buktinya.
4. Bila di tengah jalan ternyata rancangan perlu berubah: berhenti, usulkan ke Tams, lalu tambahkan entri di §11 sebelum melanjutkan.
5. `docs/KERJA.md` dan skill `kerjakan` diperbarui di tahap yang mengubah perilaku yang mereka jelaskan, supaya tidak ada dua aturan yang bertengkar.

# Kerja: monitoring dan dokumentasi tugas Plane

**Tugas saya** dan halaman **Kerja** adalah alat untuk memonitor dan mendokumentasikan setiap tugas Plane. Pembagian perannya:

- **Tiket To Do**: AI yang mengimplementasikan di v2. Pengguna memonitor dan memverifikasi.
- **Tiket Ready in Staging**: fiturnya sudah ada di v2, jadi tahap Dikerjakan dilewati. Isi kerjanya adalah memahami tiket, memverifikasi kriterianya, dan menyimpan buktinya.

Skenario per modul punya tujuan lain: dokumentasi alur, pengingat flow, dan bahan review. Sebuah tugas hanya menautkan skenario bila alurnya baru atau berubah.

Panel tidak memanggil AI. Bantuan AI berjalan di sesi Claude Code lewat `/kerjakan FMS-87` (skill di `.claude/skills/kerjakan/`), sedangkan panel mencatat dan menampilkan hasilnya.

## Tahap

| Tahap | Isi | Hasil |
|---|---|---|
| 1. Diambil | Tombol **Ambil** di Tugas saya, atau `bun run kerja ambil FMS-87` | `tiket.md` (salinan tiket) dan `kerja.json` |
| 2. Dipelajari | Tulis catatan: apa yang diminta, di mana fiturnya di v2, dan kriteria yang dicek. Tentukan target potret, lalu potret sebelum | `catatan.md`, `sebelum/` |
| 3. Dikerjakan (AI) | Hanya bila fiturnya belum ada. AI mengimplementasikan di v2 di branch tiket; pengguna memonitor | Branch dan commit tercatat (`bun run kerja catat --branch --commit`) |
| 4. Diverifikasi | Cek tiap kriteria di v2 lokal, lalu catat hasilnya beserta temuan. Pengguna memeriksa hasilnya | Daftar verifikasi ✓/×/○ di `kerja.json` |
| 5. Didokumentasikan | Potret sesudah. Tautkan skenario modul bila alurnya baru atau berubah | `sesudah/`, beda sebelum/sesudah, skenario tertaut (opsional) |
| 6. Selesai | Setelah dikonfirmasi pengguna: komentar verifikasi dan pindah status di Plane | Komentar dan status tercatat |

Tahap bisa dipindah maju atau mundur, lewat penanda tahap di halaman Kerja atau dengan `bun run kerja tahap`. Tiap perpindahan tercatat di riwayat. `kerja.json` yang masih memakai nama tahap lama dipetakan otomatis: `rencana` jadi Dipelajari, `dokumentasi` jadi Didokumentasikan.

## Penyimpanan

Data kerja disimpan di `kerja/<KEY>/` di akar repo. Folder ini **di-ignore git** (seperti `runs/`), jadi tidak ikut ter-push. Isinya:

- `kerja.json`: keadaan, hasil verifikasi, serta branch dan commit v2 untuk tiket yang dikerjakan AI;
- `tiket.md`;
- `catatan.md`;
- `sebelum/` dan `sesudah/`: `<nama>.png` dan `<nama>.json`.

Berkas `rencana.md` lama masih terbaca sebagai catatan.

## Target potret

```json
{
  "layar": [
    { "nama": "daftar-order", "sebagai": "mbl.planner", "rute": "/work-orders/orders", "keterangan": "Daftar Order" }
  ],
  "db": [
    { "nama": "kebijakan-order", "sql": "SELECT inspection_policy, count(*)::int AS jumlah FROM orders WHERE company_id = $1 GROUP BY 1", "keterangan": "Sebaran kebijakan pemeriksaan" }
  ]
}
```

- **Layar**:
  - Semua screenshot diambil dalam satu jendela yang berganti akun, seperti jalan skenario.
  - Driver dan mekanik memakai ukuran ponsel.
  - Tiap target menghasilkan satu screenshot halaman penuh.
- **DB**:
  - Semua query berjalan dalam satu transaksi `READ ONLY` di DB lokal (`V2_DATABASE_URL`).
  - Hanya `SELECT` atau `WITH`, satu pernyataan per query. `$1` adalah company_id tenant.
  - Hasil dibatasi 500 baris per query.
  - Query yang gagal tidak membatalkan query lain.
  - Query yang baik untuk verifikasi biasanya menghitung pelanggaran aturan, dengan hasil yang diharapkan 0.
- **Kunci tenant**: potret memegang kunci tenant. Potret ditolak bila ada jalan skenario yang aktif, dan sebaliknya.
- **Beda DB di panel**: baris dikenali lewat kolom `id` bila ada, sehingga terlihat baris yang ditambah, dihapus, atau berubah beserta kolomnya. Kalau tidak ada `id`, baris dikenali lewat isinya.

## Verifikasi per kriteria

```bash
bun run kerja cek FMS-87 lulus "Alasan wajib saat melewati pemeriksaan" "Dialog menolak tanpa alasan"
bun run kerja cek FMS-87 gagal "Approval penawaran tetap wajib" "MBL: penawaran lolos otomatis"
bun run kerja cek FMS-87 belum "Default tenant wajib"
```

Kriteria dengan nama yang sama akan ditimpa, tanpa membedakan huruf besar dan kecil. Hasilnya tampil di halaman Kerja dan Dashboard, dan ikut terkirim di komentar Plane.

## Perintah

```bash
bun run kerja daftar
bun run kerja ambil FMS-87
bun run kerja lihat FMS-87
bun run kerja target FMS-87 target.json
bun run kerja tahap FMS-87 dipelajari "catatan"
bun run kerja potret FMS-87 sebelum            # atau sesudah; --rinci untuk progres
bun run kerja kesehatan [FMS-87]               # layanan v2, Prisma, worktree API, komputer
bun run kerja gerbang FMS-87 fokus             # saat bekerja: hanya yang berubah
bun run kerja gerbang FMS-87 ci                # sebelum push: ulang .gitlab-ci.yml v2
bun run kerja cek FMS-87 lulus "kriteria" "bukti"
bun run kerja catat FMS-87 --branch feat/x --commit abc123 --skenario slug --worktree ~/work/fleetify/v2
bun run kerja plane FMS-87 komentar "catatan"  # pratinjau; tambah --ya untuk mengirim
bun run kerja plane FMS-87 status "Done"       # pratinjau; tambah --ya untuk memindah
```

## Catatan: dokumen hidup

`catatan.md` hanya berisi bagian **tulisan**: Masalah & penyebab, Rencana, Yang dikerjakan, Kendala (kerangkanya dibuat saat `ambil`). Bagian **data** disimpan di `kerja.json` dan dirender ke catatan yang tampil di panel, sehingga tidak bisa basi:

| Bagian | Sumber | Perintah |
|---|---|---|
| Pertanyaan terbuka | `pertanyaan[]` | `kerja tanya KEY "…" --usul "a"`; dijawab di panel (kartu **Butuh keputusanmu**) atau `kerja jawab KEY <no> "…"` |
| Keputusan | `keputusan[]` (+ jawaban pertanyaan) | `kerja putuskan KEY "…" --alasan "…" [--oleh ai\|tams]`; keputusan AI tampil "AI — tinjau" |
| Minta ubah | `mintaUbah[]` | `kerja minta-ubah KEY A\|B "…"`, `kerja ubah-selesai KEY <no>` |
| Verifikasi | `verifikasi[]` | `kerja cek …` (bagian "Verifikasi" tulisan lama diganti data) |
| Catatan untuk tim staging | `cekStaging[]` (serah-terima, bukan tugasmu) | `kerja staging KEY tambah "…" \| centang <no> \| batal <no>` |

**Gerbang catatan** (`kerja catatan KEY [brief|akhir]`, `--render` mencetak dokumennya):
- **brief** (syarat maju ke Dikerjakan/Diverifikasi): Masalah & penyebab dan Rencana terisi, minimal satu kriteria.
- **akhir** (syarat maju ke Didokumentasikan/Selesai): Masalah & penyebab dan Yang dikerjakan terisi, semua kriteria sudah dicek, tak ada pertanyaan/minta ubah terbuka, tak ada bagian berjudul "Usulan…"/"Pertanyaan terbuka", tak ada teks "menunggu keputusan" atau "perlu disetujui sebelum".

Pindah tahap (CLI atau panel) menolak maju bila gerbangnya belum lulus, dengan daftar alasannya. Mundur selalu boleh.

## Dashboard, Statistik, dan review

- **Dashboard** (`#/dasbor`) = apa yang harus kamu lakukan: strip mini (3 slot + komputer, klik ke Workspace), tiga lajur **Butuh kamu · AI sedang jalan · Menunggu pihak lain** (plus Antre dan Ditunda), angka tindakan (Butuh kamu, slot terpakai, CI merah, MR menunggu merge, tugas Plane belum diambil), dan temuan terbaru.
- **Butuh kamu** memberi satu aksi per tiket: Jawab · Buka terminal · Jalankan Pahami · ◆A Setujui & Kerjakan · ◆B Review · ◆C Jalankan Serahkan / Push / Salin deskripsi MR · ◆D Plane **Code Complete** → Selesai. Tiket yang sudah di-push dan ber-MR pindah ke **Menunggu pihak lain** sampai MR di-merge ke `development`; panel mendeteksi merge sendiri (commit push ada di `origin/development`). **Tugasmu berhenti di merge ke development** — deploy dan cek staging dikerjakan tim lain (K19).
- **Statistik** (`#/statistik`) = tren: tugas Plane, sedang dikerjakan, heatmap jalan skenario, produktivitas uji, radar per grup, aktivitas.
- **Paket review ◆B** muncul di Ringkasan Kerja saat hasil siap direview: kriteria + bukti di kiri; di kanan *Yang perlu kamu perhatikan* (keputusan yang diambil AI sendiri, kriteria belum lulus, peringatan gerbang, bagian catatan **Perlu diperhatikan**) dan perubahan kode per lapisan; di atas status gerbang fokus/CI dan catatan akhir. **Setuju & Serahkan** mencatat keputusan, memajukan tahap ke Didokumentasikan, dan menjalankan fase Serahkan; **Minta ubah** mencatat permintaan ubah ◆B dan menjalankan fase Lanjutkan.

## Metrik dan panen dokumentasi

- **Metrik per tiket** (Statistik, CLI `kerja metrik [KEY]`): waktu kalender per tahap (termasuk menunggu), kerja ulang (tahap mundur, permintaan ubah, gerbang CI gagal), dan token sesi Claude yang dijalankan dari panel. Kerja di chat VS Code tidak terhubung ke tiket, jadi tidak terhitung.
- **Panen** (tombol **Panen dokumentasi** di kartu Serahkan, CLI `kerja panen KEY [--modul fleet] [--tulis]`): catatan dipanen ke `fleetify-ops/docs-site/database/v2/<modul>/progres-plane/<kunci>.md` (masalah, keputusan, yang dikerjakan, perlu diperhatikan, verifikasi, cek setelah deploy) plus indeks `00-indeks-kerja.md`, lalu `npm run check-v2`. Tanpa `--tulis` hanya pratinjau. Modul ditebak dari judul tiket (`[MBL] Fleet - …` → `fleet`) atau disimpan di `kerja.json` (`modul`). Halaman `alur.md`/`status.md` tidak disentuh; commit di fleetify-ops dilakukan Tams.

## Slot dan Workspace

Tiga slot v2 untuk kerja paralel (`docs/RANCANGAN-KERJA-V2.md` §7):

| Slot | Worktree | API | Web | DB (Postgres native :5433) | Redis native :6380 |
|---|---|---|---|---|---|
| 1 | `~/work/fleetify/v2-slot1` | 3010 | 5181 | `fleetify_slot1` | DB 1 |
| 2 | `~/work/fleetify/v2-slot2` | 3020 | 5182 | `fleetify_slot2` | DB 2 |
| 3 | `~/work/fleetify/v2-slot3` | 3030 | 5183 | `fleetify_slot3` | DB 3 |

- **Ambil di Tugas saya** membuka pilihan slot: *kosong* (branch `feat/<key>` dari development, server slot dimatikan, DB di-reset dari `fleetify_template` lalu dimigrasi, ±15 detik), *gabung klaster* (branch dan DB yang sama), atau *Antrekan*. CLI: `kerja slot KEY <n>`, `kerja antre KEY`, `kerja lepas KEY`.
- **Workspace** (`#/workspace`, CLI `kerja workspace`): strip komputer (CPU, memori, disk, pemakaian memori per kelompok, peringatan + saran), kartu per slot (tiket, sesi Claude, git, server, DB; Nyalakan/Matikan, Migrasi, Reset DB), layanan bersama, dan Antre dengan tombol Tempatkan.
- Server slot berjalan di tmux `slot-<n>` (jendela `api` dan `web`). Menyalakan slot ditolak saat memori tertekan (bebas < 15%), dengan saran slot diam yang bisa dimatikan.
- Potret dan `kerja kesehatan KEY` otomatis memakai lingkungan slot tiket (web, API, DB). Sesi admin tersimpan per port (`.cache/owner-state-<port>.json`); cookie sesi tiap slot bernama sendiri sehingga login antar-slot tidak saling menimpa.
- Slot dilepas otomatis setelah push dari panel. Tiket tanpa slot memakai lingkungan bawaan (`V2_BACKEND_DIR`, web :5173).
- `fleetify_template` = data uji MBL + skema development; perbarui dengan migrasi slot bila tertinggal.

## Sesi Claude dari panel

Halaman Kerja punya kartu **Sesi AI**; Dashboard punya lajur **Butuh kamu** dan **AI sedang jalan**.

- **Jalankan fase** (Pahami, Kerjakan, Serahkan, atau Lanjutkan dengan arahan) menjalankan `claude` di sesi tmux `kerja-<KEY>`, dari akar scenario-runner dengan worktree v2 sebagai `--add-dir`. Satu tiket = satu sesi Claude (`--session-id`, lalu `--resume`), ID-nya di `kerja.json` (`sesi`).
- **Mode Terminal** (bawaan) membuka Terminal.app yang tersambung ke sesi itu: kamu bisa menonton, menyetujui izin, atau mengetik arahan. Menutup jendela tidak menghentikan kerja; **Buka terminal** menyambung lagi (atau `tmux attach -t kerja-<KEY>`). Bila sesi masih hidup, fase berikutnya dikirim ke sesi yang sama sehingga konteksnya tetap.
- **Mode Latar** memakai `claude -p` dengan batas biaya per fase; progres ringkas tampil sebagai cuplikan di panel.
- **Izin per fase:** Pahami hanya boleh menulis di `kerja/`; Kerjakan boleh menulis di worktree. Semua fase melarang `git push`, `kerja plane`, dan `prisma migrate deploy` di level alat; push dan Plane hanya lewat tombol panel.
- **Hook** (`UserPromptSubmit`, `Notification`, `Stop`, `SessionEnd`) mengabari panel lewat `POST /api/kerja/<KEY>/kabar`: status sesi menjadi *bekerja*, *menunggu kamu*, atau *berhenti*.
- **Butuh kamu** memberi satu tombol per tiket: Jawab (pertanyaan terbuka), Buka terminal (Claude menunggu), Jalankan Pahami (Brief belum ada), Setujui & Kerjakan (◆A), atau Review (◆B).

## Serahkan: gerbang CI, push, MR

Kartu **Serahkan** di halaman Kerja (muncul bila kerja punya branch atau commit):

- **Jalankan gerbang CI** menjalankan `kerja gerbang KEY ci` di latar; hasilnya tersimpan di `kerja.json` dan kartu diperbarui sendiri.
- **Push** hanya aktif bila: worktree di branch kerja (bukan `main`/`master`/`development`/`staging`, bukan detached), bersih, ada commit baru, dan gerbang CI terakhir **✓ atau !** pada HEAD yang sama. Alasan yang belum terpenuhi tertulis di kartu. Syarat yang sama diperiksa ulang di server.
- Klik Push membuka dialog berisi branch, remote, dan daftar commit; setelah dikonfirmasi panel menjalankan `git push` biasa (tanpa force; `-u` bila belum ada upstream) dan mencatatnya di semua tiket se-klaster (branch sama).
- **Kamu yang membuat MR di GitLab.** **Salin deskripsi MR** menyusun teks dari catatan: masalah & penyebab, yang dikerjakan, keputusan, verifikasi, commit, daftar cek setelah deploy, dan hasil gerbang CI; tiket se-klaster digabung. Tempel link MR-nya ke kartu supaya tersimpan.
- AI tidak bisa push: `git push`, `kerja plane`, dan pemanggilan API panel (`curl …:5800`) diblok di level alat untuk semua fase. Tidak ada perintah CLI untuk push.

## Gerbang dan kesehatan

Keluaran ketiga perintah ini sengaja ringkas: satu baris vonis (`✓`, `!` peringatan, `×` gagal), lalu hanya yang bermasalah beserta saran. Detail lengkap ditulis ke berkas (`kerja/<KEY>/gerbang/*.log`).

- **`kesehatan`** memeriksa Postgres, Redis, Authentik, API, web, kesegaran Prisma client (berkas dan proses API), worktree mana yang melayani API (dan apakah sudah memuat commit kerja), serta disk, memori, dan CPU. Potret menjalankan cek web/API/DB lebih dulu dan menolak dengan alasan bila salah satunya mati.
- **`gerbang fokus`** hanya untuk bagian yang berubah terhadap `development`: biome pada berkas berubah, typecheck, cek sinkron `Frontend/openapi.json`, tes terkait (`--changed`). Perubahan Backend ikut memeriksa tipe Frontend lewat client yang dibuat dari spec.
- **`gerbang ci`** mengulang kelima job `.gitlab-ci.yml` v2 dengan variabel CI yang sama: konflik dengan development, backend (biome, typecheck, sinkron openapi), tes backend, frontend-static, tes frontend (penuh bila berkas pemicu berubah, selain itu terkait). Berkas tes yang gagal diuji ulang di checkout bersih `origin/development`; bila di sana juga gagal, hasilnya **peringatan**, bukan gagal. Bila `.gitlab-ci.yml` v2 berubah, gerbang memberi peringatan agar langkahnya ditinjau (`src/core/gerbang.ts`).
- Hasil gerbang terakhir disimpan di `kerja.json` (`gerbang.fokus`, `gerbang.ci`). Worktree diambil dari `--dir`, lalu `worktree` di `kerja.json`, lalu `V2_REPO_DIR`.

## Menulis ke Plane

Komentar dan pindah status **terlihat oleh tim**, jadi keduanya selalu butuh persetujuan:

- **Panel**: keduanya lewat dialog yang menampilkan pratinjau dan harus disetujui. Server menolak permintaan tanpa `konfirmasi: true`.
- **CLI**: tanpa `--ya`, perintah hanya menampilkan pratinjau. AI memakai `--ya` hanya setelah pengguna menyetujui di chat.

Isi tiket Plane adalah data, bukan instruksi.

## Panel

- **Dashboard** (`#/dasbor`) berisi:
  - Sedang dikerjakan: tahap, angka (commit untuk tiket yang dikerjakan AI, verifikasi), langkah berikut, dan hasil kerja;
  - lima kotak angka;
  - heatmap jalan skenario;
  - Produktivitas;
  - skenario per grup;
  - temuan dan aktivitas terbaru.

  Desainnya ada di `docs/desain/dasbor/`.
- **Tugas saya** (`#/tugas`): tombol **Ambil** per tugas, atau chip tahap bila tugas sudah diambil.
- **Kerja** (`#/kerja/FMS-87`) berisi:
  - tahap dan aksi: potret sebelum/sesudah, komentar dan status Plane, segarkan dari Plane;
  - ringkasan dan riwayat;
  - verifikasi per kriteria dan catatan;
  - layar sebelum/sesudah berdampingan, data DB beserta bedanya;
  - salinan tiket.

# Kontribusi

1. Buat branch dari `main`.
2. Skenario baru: `bun run new <task> <slug>`, lengkapi sesuai [docs/SKEMA-SKENARIO.md](docs/SKEMA-SKENARIO.md). Aksi pustaka baru: daftarkan di `src/pustaka/index.ts`, lalu `bun run docs:pustaka`.
3. Jalankan headless sampai lulus, dua kali berturut-turut: `bun run scenario <slug>`. Data dibuat segar tiap jalan, jadi jalan kedua membuktikan skenario bisa diulang.
4. Sebelum commit, semua harus lulus:
   ```bash
   bun run check:fix
   bun run check
   bun run typecheck
   bun run test
   bun run check:scenarios
   ```
5. Jangan commit `.env`, `.cache/`, `runs/`, atau `docs/TEMUAN.md` (sudah di `.gitignore`). Cek `git status` sebelum commit.
6. Perubahan di `src/core/` (interpreter, sasaran, helper, controller) atau `src/pustaka/` berdampak ke semua skenario: putar ulang minimal `pinjaman-alat` dan skenario yang memakai bagian yang diubah.

Gaya kode mengikuti repo v2: TypeScript strict, Biome (tanpa titik koma, kutip tunggal, lebar 100), Vitest, zod untuk validasi. Dependensi baru hanya bila benar-benar perlu.

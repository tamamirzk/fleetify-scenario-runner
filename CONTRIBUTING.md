# Kontribusi

1. Buat branch dari `main`.
2. Skenario baru: `bun run new <id>`, lengkapi sesuai [docs/MENULIS-SKENARIO.md](docs/MENULIS-SKENARIO.md).
3. Jalankan headless sampai lulus, dua kali berturut-turut: `bun run scenario <id>`. Data dibuat segar tiap jalan, jadi jalan kedua membuktikan skenario bisa diulang.
4. Sebelum commit, semua harus lulus:
   ```bash
   bun run check:fix
   bun run check
   bun run typecheck
   bun run test
   bun run check:scenarios
   ```
5. Jangan commit `.env`, `.cache/`, `runs/`, atau `docs/TEMUAN.md` (sudah di `.gitignore`). Cek `git status` sebelum commit.
6. Perubahan di `src/core/` (helper, controller, tipe) berdampak ke semua skenario: putar ulang minimal `pinjaman-alat` dan skenario yang memakai bagian yang diubah.

Gaya kode mengikuti repo v2: TypeScript strict, Biome (tanpa titik koma, kutip tunggal, lebar 100), Vitest, zod untuk validasi. Dependensi baru hanya bila benar-benar perlu.

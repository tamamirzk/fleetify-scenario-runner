# Menulis skenario

Standar ini berlaku untuk semua skenario. Sebagian ditegakkan otomatis oleh `bun run check:scenarios` (ditandai **[otomatis]**); sisanya diperiksa saat review.

## Mulai

```bash
bun run new retur-rusak        # scenarios/retur-rusak.ts dari templates/scenario.ts
bun run check:scenarios
bun run scenario retur-rusak   # headless
```

Contoh lengkap: `scenarios/pinjaman-alat.ts`.

## Bentuk berkas

```ts
import { defineScenario } from '../src/core/types.ts'

interface Data {
  docs: { label: string; nomor: string; url: string }[]
  mr_id: string
}

export default defineScenario<Data>({
  meta: { id: 'retur-rusak', title, group: 'material', tickets: ['FMS-62'], estimasi: '6 menit',
    tujuan, personas: [{ who: 'mbl.storekeeper', peran: 'menerima retur' }],
    data: ['…'], setelan: [], prasyarat: [], catatan: [] },
  async setup(ctx) { /* lewat API, data segar */ return { mr_id, docs } },
  steps: [
    { id: 'terima', who: 'mbl.storekeeper', title: 'Wati menerima retur', expect: 'Status Diterima',
      reach: async (ctx, d) => { /* opsional: bawa data ke awal langkah ini */ },
      run: async (ctx, d) => { /* aksi di layar */ } },
  ],
  async cleanup(ctx, d) { /* wajib bila meta.setelan terisi */ },
})
```

## Standar

### 1. Satu skenario, satu berkas
`scenarios/<id>.ts`, nama kebab-case tanpa awalan, `export default` bertipe `Scenario` lewat `defineScenario`. `meta.id` sama dengan nama berkas. **[otomatis]**

### 2. `meta` lengkap
`id`, `title`, `group` (`material`, `approval`, `wo`, `pb`, `akses`, `lingkungan`), `tickets` (format `FMS-123`), `estimasi` (`"<n> menit"`), `tujuan` (satu kalimat "Membuktikan …"), `personas` (setiap persona yang terlibat beserta perannya, termasuk yang hanya lewat API), `data` (yang dibuat `setup`), `setelan`, `prasyarat`, `catatan`. Field asing ditolak. **[otomatis]**

### 3. Data segar tiap jalan
`setup()` membuat barang dan dokumen baru lewat API. Skenario tidak boleh bergantung pada dokumen atau stok yang sudah ada, dan tidak boleh menulis id dari DB tertentu (**[otomatis]**: UUID di berkas skenario ditolak).
- Barang: `ctx.kit.newItem(ctx, rc, whId, { sku, name, quantity | serials, kind })` dengan `ctx.kit.stamp()` di SKU dan nama. Saldo awal hanya sah untuk barang yang belum pernah masuk gudang; barang baru tidak bisa memakai pelacakan Batch.
- Master yang memang dari seed dicari lewat API: `ctx.kit.findWarehouse(rc, 'WH-ALPHA')`, `findWorkshop(rc, 'Workshop Site Alpha')`, `findVehicle(rc, 'DT-014')`, `findApprovalFlow(rc, nama)`, `ctx.lib.personaUserId('mbl.mechanic')`.
- Isi `docs: [{ label, nomor, url }]` supaya panel menampilkan dokumen yang dibuat. Langkah boleh menambah field data (mis. nomor ADJ); runner menyimpannya ke `data.json` setelah tiap langkah.

### 4. DB hanya lewat API aplikasi
Akses DB atau proses luar (`node:child_process`, `psql`, `DATABASE_URL`) ditolak kecuali `meta.pengecualian` berisi `{ aturan: 'db-lewat-api', alasan }` dengan alasan yang jelas. **[otomatis]** Pengecualian disepakati tim dulu. Saat ini hanya `sla-eskalasi`.

### 5. Satu jendela
Runner membuka satu jendela untuk persona langkah pertama. Ganti akun cukup dengan `who` pada langkah; runner memanggil `become()` dan menampilkan banner "Ganti akun". Persona lain di belakang layar memakai `ctx.as(who)` (sesi API tanpa jendela, ditutup otomatis). Jangan membuat browser atau konteks sendiri.

### 6. Semua aksi lewat helper
Aksi terlihat memakai `ctx.k.click`, `ctx.k.fill`, `ctx.k.pick` (combobox → opsi), `ctx.k.search` (ketik di autocomplete → opsi), `ctx.say`, dan `ctx.open`. Hanya helper ini yang melewati gerbang jeda dan satu aksi. Aksi Playwright mentah (`.click(`, `.fill(`, `.press(`, `.check(`, …) di `scenarios/` ditolak. **[otomatis]** Tahanan memakai `ctx.wait(ms)`; `waitForTimeout` ditolak. **[otomatis]** Membaca (`waitFor`, `innerText`, `count`, `isDisabled`) boleh langsung.

### 7. Langkah
Setiap langkah punya `id` kebab-case yang unik, `title` (kalimat aktif: siapa melakukan apa), dan `expect` (yang harus terlihat di layar). `who` harus persona yang dikenal dan tercantum di `meta.personas`. **[otomatis]**
- Tiap langkah membuka sendiri halaman yang dipakainya (`ctx.open(route)`), supaya bisa diputar mulai dari langkah itu.
- Beri `reach` bila keadaan awal langkah bisa dibangun lewat API. Tanpa `reach`, langkah hanya bisa dimulai memakai data jalan yang berhenti tepat sebelum langkah itu; panel menandainya.
- Periksa hasil yang penting dan `throw new Error(…)` bila salah. Kejanggalan yang belum pasti salah dicatat dengan `ctx.note(teks)`.

### 8. Setelan dikembalikan
Bila skenario mengubah setelan (alur approval, preferensi, penomoran), tulis di `meta.setelan` dan kembalikan atau periksa di `cleanup()`, yang tetap berjalan saat jalan gagal atau dihentikan. Bila perubahan memang harus menetap (mis. prasyarat lingkungan), isi `meta.setelanMenetap` dengan alasannya. **[otomatis]**

### 9. Bahasa dan selector
Teks banner, judul, dan catatan berbahasa Indonesia. Selector memakai peran dan label (`getByRole`, `getByLabel`) dengan teks dari `Frontend/src/shared/i18n/locales/id.json` repo v2, bukan kelas CSS, kecuali tidak ada pilihan lain.

### 10. Kualitas
Sebelum commit: `bun run check`, `bun run typecheck`, `bun run test`, `bun run check:scenarios`, dan skenario lulus headless dua kali berturut-turut. Perubahan pada `controller` dan aturan meta disertai tes Vitest di `test/`.

## Isi `ctx`

Di `setup`, `reach`, dan `cleanup` (`BaseCtx`): `as(who)`, `api.get/send(target, …)`, `ok(res, label)`, `log`, `lib` (mis. `lib.rows(body)`, `lib.personaUserId`), `kit` (mis. `kit.newItem`, `kit.stamp`, `kit.find*`, `kit.photoUrl`).

Di langkah (`StepCtx`), tambahan: `page` (jendela satu-satunya), `k` (helper aksi terlihat dan `k.panel(page)` untuk panel Persetujuan), `say(teks, ms)` (banner bernomor `n/total`), `wait(ms)`, `open(route)`, `shot(nama)`, `note(teks)`, `become(who)`, `n`, `total`.

Foto lewat jalur "tempel URL" (penyimpanan media lokal biasanya tidak dikonfigurasi): `ctx.kit.addPhotoByUrl(page, scope, ctx.kit.photoUrl('nama'))`.

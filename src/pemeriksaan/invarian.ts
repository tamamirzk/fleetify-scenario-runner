// Invarian DB pasca-skenario: SQL hanya SELECT terhadap DB Postgres lokal v2. Tiap SQL menerima
// $1 = company_id tenant dan mengembalikan baris yang MELANGGAR (nol baris = lulus).
// Nama tabel/kolom mengikuti v2/Backend/prisma/schema/*.prisma (@@map / @map). Berkas ini murni
// (tanpa koneksi) supaya bisa dipakai skema zod dan dokumentasi; pelaksananya di jalankan.ts.
// Dokumentasi: docs/PEMERIKSAAN.md (daftar invarian dibuat ulang oleh bun run docs:pustaka).

export interface Invarian {
  id: string
  judul: string
  keterangan: string
  /**
   * `pelanggaran` (bawaan): baris hasil = pelanggaran; dibandingkan baseline vs akhir lewat
   * kolomKunci. `kenaikan`: baris hasil = snapshot penghitung; pelanggaran bila nilai kolomAngka
   * di akhir lebih besar daripada baseline untuk kunci yang sama.
   */
  mode?: 'pelanggaran' | 'kenaikan'
  /** Teks SQL, atau fungsi dari himpunan tabel yang ada di DB (untuk cabang opsional). */
  sql: string | ((tabel: ReadonlySet<string>) => string)
  /** Kolom identitas baris pelanggaran, untuk membandingkan baseline vs akhir. */
  kolomKunci: string[]
  /** Mode kenaikan: kolom angka yang tidak boleh naik. */
  kolomAngka?: string[]
  /** Tabel yang wajib ada; bila tidak ada di DB ini, invarian dilewati (bukan galat). */
  tabel: string[]
}

/** Status WO yang sudah tertutup (TERMINAL_WORK_ORDER_STATUSES, work-order/domain/workOrderAccess.ts). */
const WO_TERTUTUP = `('COMPLETED','VERIFIED','INVOICED','CANCELLED_PENDING_RETURN','CANCELLED','REJECTED')`
const PO_BISA_TERIMA = `('OPEN','APPROVED','ORDERED','PARTIALLY_RECEIVED')`

/**
 * Tabel append-only: tidak boleh ada UPDATE/DELETE. Dasar: daftar `append_only` di
 * v2/Backend/prisma/rls.sql dan penelusuran penulis di src (tidak ada `.update/.delete` pada
 * delegasi Prisma-nya). Dikeluarkan dengan sengaja: `work_order_photos` (UPDATE sah kolom
 * removed_*), `gl_journal_lines` (baris jurnal DRAFT dihapus saat diubah, JournalRepository.ts),
 * `material_request_line_gaps` (status berubah, materialRequestGaps.ts).
 */
export const TABEL_APPEND_ONLY = [
  'ledger_entries',
  'work_order_value_changes',
  'approval_actions',
  'approval_reassignments',
  'tire_lifecycle_histories',
  'work_order_part_documentation_versions',
  'warehouse_stock_movements',
  'audit_logs',
  'order_schedule_changes',
] as const

/** Dua kaki tiap movement: gudang tujuan (kolom *_current) dan, untuk TRANSFER, gudang asal. */
const KAKI_MOVEMENT = `
  SELECT m.id, m.warehouse_id, m.part_id, m.created_at, m.direction::text AS arah,
         m.qty_before_current AS sebelum, m.qty_after_current AS sesudah,
         CASE m.direction::text WHEN 'OUT' THEN -m.quantity ELSE m.quantity END AS delta
    FROM warehouse_stock_movements m WHERE m.company_id = $1::uuid
  UNION ALL
  SELECT m.id, m.previous_warehouse_id, m.part_id, m.created_at, 'TRANSFER-ASAL',
         m.qty_before_previous, m.qty_after_previous, -m.quantity
    FROM warehouse_stock_movements m
   WHERE m.company_id = $1::uuid AND m.direction = 'TRANSFER' AND m.previous_warehouse_id IS NOT NULL`

/** Satu cabang approval-yatim: request PENDING yang dokumennya tidak lagi menunggu. */
interface CabangYatim {
  jenis: string
  tabel: string[]
  /** FROM … (alias d) yang mengembalikan satu baris per dokumen r.document_id. */
  from: string
  /** Ekspresi boolean "dokumen masih menunggu" (NULL/false = yatim). */
  menunggu: string
  status: string
}

const byStatus = (jenis: string, tabel: string, menunggu = 'PENDING_APPROVAL'): CabangYatim => ({
  jenis,
  tabel: [tabel],
  from: `LEFT JOIN ${tabel} d ON d.id = r.document_id`,
  menunggu: `d.status::text = '${menunggu}'`,
  status: 'd.status::text',
})

/** Padanan CHECKS di v2/Backend/scripts/report-orphan-approval-requests.ts. */
const CABANG_YATIM: CabangYatim[] = [
  byStatus('ASSET_DISPOSAL', 'asset_disposals'),
  byStatus('INVENTORY_COST_ADJUSTMENT', 'inventory_cost_adjustments'),
  byStatus('MATERIAL_REQUEST', 'material_requests'),
  byStatus('OTHER_DEPOSIT', 'cash_transactions'),
  byStatus('OTHER_PAYMENT', 'cash_transactions'),
  byStatus('PURCHASE_ORDER', 'purchase_orders'),
  byStatus('PURCHASE_REQUEST', 'purchase_requests'),
  byStatus('SALES_ORDER', 'sales_orders'),
  byStatus('STOCK_ADJUSTMENT', 'stock_adjustment_requests'),
  byStatus('STOCK_OPNAME', 'stock_opnames'),
  byStatus('TIRE_REPOSITION', 'tire_reposition_requests'),
  byStatus('TIRE_REPOSITION_TASK', 'tire_reposition_tasks'),
  byStatus('TIRE_RETREAD_ORDER', 'tire_retread_orders'),
  byStatus('USED_TIRE_SCRAP', 'used_tire_scrap_batches'),
  byStatus('USER_MEMBERSHIP', 'user_company_memberships'),
  byStatus('VEHICLE_COMPLAINT', 'vehicle_complaints'),
  byStatus('WAREHOUSE_MUTATION', 'warehouse_mutations'),
  byStatus('WORK_ORDER_MATERIAL_RETURN', 'work_order_material_return_requests'),
  {
    jenis: 'DIAGNOSTIC',
    tabel: ['diagnoses', 'orders'],
    from: `LEFT JOIN diagnoses d ON d.id = r.document_id LEFT JOIN orders o ON o.id = d.order_id`,
    menunggu: `d.status::text = 'COMPLETED' AND coalesce(o.status::text, '') NOT IN ('CANCELLED','COMPLETED')`,
    status: `d.status::text || coalesce(' / order ' || o.status::text, '')`,
  },
  {
    jenis: 'GOODS_RECEIPT',
    tabel: ['goods_receipts', 'purchase_orders'],
    from: `LEFT JOIN goods_receipts d ON d.id = r.document_id LEFT JOIN purchase_orders po ON po.id = d.po_id`,
    menunggu: `d.approval_status::text = 'PENDING_APPROVAL' AND (d.po_id IS NULL OR po.status::text IN ${PO_BISA_TERIMA})`,
    status: `d.approval_status::text || coalesce(' / PO ' || po.status::text, '')`,
  },
  {
    jenis: 'PERIODIC_MANUAL_RECORD',
    tabel: ['orders', 'periodic_manual_records'],
    from: `LEFT JOIN orders o ON o.id = r.document_id
           LEFT JOIN LATERAL (SELECT status FROM periodic_manual_records
                               WHERE order_id = o.id ORDER BY created_at DESC LIMIT 1) d ON true`,
    menunggu: `o.id IS NOT NULL AND d.status::text = 'PENDING_APPROVAL'`,
    status: `coalesce(d.status::text, 'kosong')`,
  },
  {
    jenis: 'VEHICLE_MUTATION',
    tabel: ['vehicle_mutations', 'vehicles'],
    from: `LEFT JOIN vehicle_mutations d ON d.id = r.document_id LEFT JOIN vehicles v ON v.id = d.vehicle_id`,
    menunggu: `d.status::text = 'PENDING_APPROVAL' AND v.id IS NOT NULL`,
    status: `d.status::text || CASE WHEN d.id IS NOT NULL AND v.id IS NULL THEN ' / kendaraan dihapus' ELSE '' END`,
  },
  {
    jenis: 'WORK_ORDER',
    tabel: ['work_orders'],
    from: `LEFT JOIN work_orders d ON d.id = r.document_id`,
    menunggu: `CASE WHEN r.action = 'execution_review' THEN d.status::text IN ('WAITING_VERIFICATION','CHECK')
                    ELSE d.status::text = 'WAITING_APPROVAL' END`,
    status: 'd.status::text',
  },
  {
    jenis: 'WORK_ORDER_ADJUSTMENT',
    tabel: ['work_order_adjustments', 'work_orders'],
    from: `LEFT JOIN work_order_adjustments d ON d.id = r.document_id LEFT JOIN work_orders wo ON wo.id = d.work_order_id`,
    menunggu: `d.status::text = 'PENDING_APPROVAL' AND wo.status::text NOT IN ${WO_TERTUTUP}`,
    status: `d.status::text || coalesce(' / WO ' || wo.status::text, '')`,
  },
  {
    jenis: 'WORK_ORDER_OFFER',
    tabel: ['work_order_offers', 'orders', 'work_orders'],
    from: `LEFT JOIN work_order_offers d ON d.id = r.document_id
           LEFT JOIN orders ord ON ord.id = d.order_id
           LEFT JOIN work_orders two ON two.id = d.target_work_order_id`,
    menunggu: `d.status::text = 'PENDING_APPROVAL'
               AND coalesce(ord.status::text, '') NOT IN ('COMPLETED','CANCELLED')
               AND (d.offer_type::text <> 'RPL_ADDITION' OR d.target_work_order_id IS NULL
                    OR two.status::text NOT IN ${WO_TERTUTUP})`,
    status: `d.status::text || coalesce(' / ' || coalesce(two.status::text, ord.status::text), '')`,
  },
  {
    jenis: 'WORK_ORDER_SHIFT',
    tabel: ['work_order_shift_logs', 'work_orders'],
    from: `LEFT JOIN work_order_shift_logs d ON d.id = r.document_id LEFT JOIN work_orders wo ON wo.id = d.wo_id`,
    menunggu: `wo.status::text NOT IN ${WO_TERTUTUP}`,
    status: `'WO ' || wo.status::text`,
  },
  {
    jenis: 'WORK_ORDER_SPAREPART_REQUEST',
    tabel: ['work_order_sparepart_requests', 'work_orders'],
    from: `LEFT JOIN work_order_sparepart_requests d ON d.id = r.document_id LEFT JOIN work_orders wo ON wo.id = d.work_order_id`,
    menunggu: `d.status::text = 'PENDING_APPROVAL' AND wo.status::text NOT IN ${WO_TERTUTUP}`,
    status: `d.status::text || coalesce(' / WO ' || wo.status::text, '')`,
  },
]

export const JENIS_DOKUMEN_YATIM = CABANG_YATIM.map((c) => c.jenis)

function sqlYatim(tabel: ReadonlySet<string>): string {
  const cabang = CABANG_YATIM.filter((c) => c.tabel.every((t) => tabel.has(t)))
  const union = cabang
    .map(
      (c) => `SELECT r.id AS request_id, r.document_type, r.action, r.title,
                     r.current_step_order::text AS tahap, coalesce(${c.status}, 'dokumen hilang') AS status_dokumen
                FROM r ${c.from}
               WHERE r.document_type = '${c.jenis}' AND NOT coalesce(${c.menunggu}, false)`,
    )
    .join('\n UNION ALL\n')
  return `WITH r AS (SELECT * FROM approval_requests WHERE company_id = $1::uuid AND status = 'PENDING')
${union || `SELECT NULL::uuid AS request_id, NULL::text AS document_type, NULL::text AS action, NULL::text AS title, NULL::text AS tahap, NULL::text AS status_dokumen WHERE false`}
ORDER BY 2, 4`
}

export const INVARIAN: readonly Invarian[] = [
  {
    id: 'stok-available',
    judul: 'Stok tersedia = on hand − reservasi',
    keterangan:
      'warehouse_stock.quantity_available harus sama dengan GREATEST(quantity_on_hand − quantity_reserved, 0); untuk gudang bertipe SCRAP harus 0 (availableQuantity di inventory/domain/warehouseTypeRules.ts).',
    sql: `SELECT w.code AS gudang, w.type::text AS tipe_gudang, p.sku, p.name AS barang,
                 s.quantity_on_hand::text AS on_hand, s.quantity_reserved::text AS reserved,
                 s.quantity_available::text AS available,
                 (CASE WHEN w.type::text = 'SCRAP' THEN 0 ELSE GREATEST(s.quantity_on_hand - s.quantity_reserved, 0) END)::text AS seharusnya
            FROM warehouse_stock s
            JOIN warehouses w ON w.id = s.warehouse_id
            JOIN parts p ON p.id = s.part_id
           WHERE s.company_id = $1::uuid
             AND s.quantity_available <> CASE WHEN w.type::text = 'SCRAP' THEN 0
                                             ELSE GREATEST(s.quantity_on_hand - s.quantity_reserved, 0) END
           ORDER BY w.code, p.sku`,
    kolomKunci: ['gudang', 'sku'],
    tabel: ['warehouse_stock', 'warehouses', 'parts'],
  },
  {
    id: 'stok-nonnegatif',
    judul: 'Kuantitas stok tidak negatif',
    keterangan:
      'quantity_on_hand, quantity_reserved, dan quantity_in_transit di warehouse_stock tidak boleh negatif.',
    sql: `SELECT w.code AS gudang, p.sku, p.name AS barang,
                 s.quantity_on_hand::text AS on_hand, s.quantity_reserved::text AS reserved,
                 s.quantity_in_transit::text AS in_transit
            FROM warehouse_stock s
            JOIN warehouses w ON w.id = s.warehouse_id
            JOIN parts p ON p.id = s.part_id
           WHERE s.company_id = $1::uuid
             AND (s.quantity_on_hand < 0 OR s.quantity_reserved < 0 OR s.quantity_in_transit < 0)
           ORDER BY w.code, p.sku`,
    kolomKunci: ['gudang', 'sku'],
    tabel: ['warehouse_stock', 'warehouses', 'parts'],
  },
  {
    id: 'stok-ledger',
    judul: 'Ledger movement menyambung dan cocok dengan on hand',
    keterangan:
      'Tiga pemeriksaan atas warehouse_stock_movements per (gudang, barang), TRANSFER dihitung dua kaki (kolom *_current = gudang tujuan, *_previous = gudang asal): (aritmetika) qty_after = qty_before ± quantity sesuai arah; (rantai) qty_after baris sebelumnya = qty_before baris berikutnya, urut created_at lalu id — baris yang created_at-nya kembar dengan baris lain di pasangan yang sama dilewati karena urutannya tak terjamin; (saldo-akhir) warehouse_stock.quantity_on_hand sama dengan qty_after movement terakhir. Baris tanpa qty_before/qty_after (data lama) tidak dinilai. Ini bentuk yang pasti benar; rekonsiliasi penuh "selisih on hand = jumlah movement selama jalan" tidak dipakai karena baseline tidak menyimpan saldo per baris.',
    sql: `WITH kaki AS (${KAKI_MOVEMENT}),
      urut AS (
        SELECT k.*, lag(k.sesudah) OVER (PARTITION BY k.warehouse_id, k.part_id ORDER BY k.created_at, k.id) AS sesudah_sebelumnya,
               count(*) OVER (PARTITION BY k.warehouse_id, k.part_id, k.created_at) AS kembar,
               lag(k.created_at) OVER (PARTITION BY k.warehouse_id, k.part_id ORDER BY k.created_at, k.id) AS created_sebelumnya
          FROM kaki k),
      terakhir AS (
        SELECT DISTINCT ON (warehouse_id, part_id) warehouse_id, part_id, created_at
          FROM kaki ORDER BY warehouse_id, part_id, created_at DESC),
      masalah AS (
        SELECT 'aritmetika' AS masalah, u.warehouse_id, u.part_id, u.id AS movement_id, u.arah, u.created_at,
               u.sebelum::text AS sebelum, u.sesudah::text AS sesudah, (u.sebelum + u.delta)::text AS seharusnya
          FROM urut u WHERE u.sebelum IS NOT NULL AND u.sesudah IS NOT NULL AND u.sesudah <> u.sebelum + u.delta
        UNION ALL
        SELECT 'rantai', u.warehouse_id, u.part_id, u.id, u.arah, u.created_at,
               u.sebelum::text, u.sesudah::text, u.sesudah_sebelumnya::text
          FROM urut u
         WHERE u.sebelum IS NOT NULL AND u.sesudah_sebelumnya IS NOT NULL AND u.kembar = 1
           AND u.created_sebelumnya <> u.created_at AND u.sebelum <> u.sesudah_sebelumnya
        UNION ALL
        SELECT 'saldo-akhir', s.warehouse_id, s.part_id, NULL, NULL, t.created_at,
               NULL, s.quantity_on_hand::text, (SELECT string_agg(k.sesudah::text, ' | ') FROM kaki k
                 WHERE k.warehouse_id = s.warehouse_id AND k.part_id = s.part_id AND k.created_at = t.created_at)
          FROM warehouse_stock s
          JOIN terakhir t ON t.warehouse_id = s.warehouse_id AND t.part_id = s.part_id
         WHERE s.company_id = $1::uuid
           AND NOT EXISTS (SELECT 1 FROM kaki k WHERE k.warehouse_id = s.warehouse_id AND k.part_id = s.part_id
                              AND k.created_at = t.created_at AND k.sesudah IS NOT NULL AND k.sesudah = s.quantity_on_hand)
           AND EXISTS (SELECT 1 FROM kaki k WHERE k.warehouse_id = s.warehouse_id AND k.part_id = s.part_id
                              AND k.created_at = t.created_at AND k.sesudah IS NOT NULL))
      SELECT m.masalah, w.code AS gudang, p.sku, m.movement_id::text AS movement_id, m.arah,
             to_char((m.created_at AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS') AS waktu,
             m.sebelum, m.sesudah, m.seharusnya
        FROM masalah m
        JOIN warehouses w ON w.id = m.warehouse_id
        JOIN parts p ON p.id = m.part_id
       ORDER BY 1, 2, 3, m.created_at`,
    kolomKunci: ['masalah', 'gudang', 'sku', 'movement_id'],
    tabel: ['warehouse_stock_movements', 'warehouse_stock', 'warehouses', 'parts'],
  },
  {
    id: 'akun-saldo',
    judul: 'Saldo akun = jumlah ledger',
    keterangan:
      'accounts.balance_rupiah (agregat cache) harus sama dengan jumlah bertanda ledger_entries per akun: DEBIT +, CREDIT − (FinanceRepository.listAccounts, reconciled_rupiah).',
    sql: `SELECT a.id::text AS account_id, a.owner_type::text AS owner_type, a.account_type::text AS account_type,
                 a.balance_rupiah::text AS saldo_cache, coalesce(l.jumlah, 0)::text AS jumlah_ledger
            FROM accounts a
            LEFT JOIN (SELECT account_id,
                              sum(CASE entry_type::text WHEN 'DEBIT' THEN amount_rupiah ELSE -amount_rupiah END) AS jumlah
                         FROM ledger_entries WHERE company_id = $1::uuid GROUP BY account_id) l ON l.account_id = a.id
           WHERE a.company_id = $1::uuid AND a.balance_rupiah <> coalesce(l.jumlah, 0)
           ORDER BY a.created_at`,
    kolomKunci: ['account_id'],
    tabel: ['accounts', 'ledger_entries'],
  },
  {
    id: 'wo-nilai',
    judul: 'Total WO = sebelum pajak + pajak',
    keterangan:
      'work_orders.after_tax_rupiah harus sama dengan before_tax_rupiah + tax_rupiah (NULL dihitung 0), seperti scripts/report-work-order-total-gap.ts. WO seed lama tanpa before_tax ikut terjaring; itu muncul sebagai "sudah ada sebelumnya".',
    sql: `SELECT w.wo_number, w.status::text AS status, w.before_tax_rupiah::text AS sebelum_pajak,
                 w.tax_rupiah::text AS pajak, w.after_tax_rupiah::text AS total
            FROM work_orders w
           WHERE w.company_id = $1::uuid
             AND coalesce(w.after_tax_rupiah, 0) <> coalesce(w.before_tax_rupiah, 0) + coalesce(w.tax_rupiah, 0)
           ORDER BY w.created_at DESC`,
    kolomKunci: ['wo_number'],
    tabel: ['work_orders'],
  },
  {
    id: 'wo-nilai-rantai',
    judul: 'Total WO = akhir rantai perubahan nilai',
    keterangan:
      'Untuk WO yang punya baris work_order_value_changes, after_tax_rupiah harus sama dengan value_after_rupiah baris dengan sequence tertinggi, dan tiap baris harus memenuhi after = before + change (recordWorkOrderValueChangeInTx, shared/work-order/workOrderValueChange.ts).',
    sql: `SELECT w.wo_number, 'akhir-rantai' AS masalah, c.sequence::text AS sequence, c.kind::text AS kind,
                 w.after_tax_rupiah::text AS total_wo, c.value_after_rupiah::text AS nilai_rantai
            FROM work_orders w
            JOIN LATERAL (SELECT * FROM work_order_value_changes c WHERE c.work_order_id = w.id
                           ORDER BY c.sequence DESC LIMIT 1) c ON true
           WHERE w.company_id = $1::uuid AND coalesce(w.after_tax_rupiah, 0) <> c.value_after_rupiah
          UNION ALL
          SELECT w.wo_number, 'aritmetika', c.sequence::text, c.kind::text,
                 (c.value_before_rupiah + c.value_change_rupiah)::text, c.value_after_rupiah::text
            FROM work_order_value_changes c JOIN work_orders w ON w.id = c.work_order_id
           WHERE c.company_id = $1::uuid AND c.value_after_rupiah <> c.value_before_rupiah + c.value_change_rupiah
           ORDER BY 1, 2, 3`,
    kolomKunci: ['wo_number', 'masalah', 'sequence'],
    tabel: ['work_orders', 'work_order_value_changes'],
  },
  {
    id: 'approval-yatim',
    judul: 'Request approval PENDING atas dokumen yang sudah berhenti menunggu',
    keterangan: `approval_requests berstatus PENDING yang dokumennya sudah terminal, dibatalkan, atau hilang. Padanan SELECT dari scripts/report-orphan-approval-requests.ts, dibatasi ke document_type yang skrip itu tangani (${JENIS_DOKUMEN_YATIM.length} jenis); cabang yang tabelnya tidak ada di DB ini dilewati.`,
    sql: sqlYatim,
    kolomKunci: ['request_id'],
    tabel: ['approval_requests'],
  },
  {
    id: 'approval-satu-tahap',
    judul: 'Request PENDING punya tepat satu tahap berjalan',
    keterangan:
      'Per approval_requests PENDING: tepat satu approval_request_steps berstatus PENDING pada step_order = current_step_order, dan tidak ada tahap PENDING di bawah current_step_order (tahap di bawahnya harus APPROVED/SKIPPED/ESCALATED). Tahap di atas current_step_order memang masih PENDING (menunggu giliran), jadi tidak dinilai.',
    sql: `SELECT r.id::text AS request_id, r.document_type, r.action, r.title, r.current_step_order::text AS tahap_kini,
                 count(*) FILTER (WHERE s.status::text = 'PENDING' AND s.step_order = r.current_step_order)::text AS tahap_berjalan,
                 count(*) FILTER (WHERE s.status::text = 'PENDING' AND s.step_order < r.current_step_order)::text AS tahap_lampau_pending,
                 string_agg(s.step_order || ':' || s.status::text, ' ' ORDER BY s.step_order) AS tahap
            FROM approval_requests r
            LEFT JOIN approval_request_steps s ON s.request_id = r.id
           WHERE r.company_id = $1::uuid AND r.status = 'PENDING'
           GROUP BY r.id
          HAVING count(*) FILTER (WHERE s.status::text = 'PENDING' AND s.step_order = r.current_step_order) <> 1
              OR count(*) FILTER (WHERE s.status::text = 'PENDING' AND s.step_order < r.current_step_order) > 0
           ORDER BY r.created_at`,
    kolomKunci: ['request_id'],
    tabel: ['approval_requests', 'approval_request_steps'],
  },
  {
    id: 'alat-pinjaman',
    judul: 'Pinjaman alat: kembali + dihapusbukukan ≤ dipinjam ≤ diserahkan',
    keterangan:
      'Per pinjaman alat (material_request_tool_loans, FMS-63): returned_quantity + written_off_quantity ≤ quantity dan tidak negatif; per baris MR TOOL: jumlah quantity pinjaman ≤ material_request_lines.issued_qty. Tabel pinjaman per peminjam hanya ada di skema cabang yang memuat FMS-63; di DB tanpa tabel itu invarian dilewati.',
    sql: `SELECT 'pinjaman' AS masalah, mr.request_number AS mr, l.description AS baris, t.borrower_name AS peminjam,
                 t.id::text AS loan_id, t.quantity::text AS dipinjam, t.returned_quantity::text AS kembali,
                 t.written_off_quantity::text AS dihapusbukukan, l.issued_qty::text AS diserahkan
            FROM material_request_tool_loans t
            JOIN material_request_lines l ON l.id = t.request_line_id
            JOIN material_requests mr ON mr.id = l.request_id
           WHERE t.company_id = $1::uuid
             AND (t.returned_quantity + t.written_off_quantity > t.quantity
                  OR t.quantity < 0 OR t.returned_quantity < 0 OR t.written_off_quantity < 0)
          UNION ALL
          SELECT 'baris', mr.request_number, l.description, NULL, l.id::text, sum(t.quantity)::text,
                 sum(t.returned_quantity)::text, sum(t.written_off_quantity)::text, l.issued_qty::text
            FROM material_request_lines l
            JOIN material_requests mr ON mr.id = l.request_id
            JOIN material_request_tool_loans t ON t.request_line_id = l.id
           WHERE l.company_id = $1::uuid AND l.item_kind::text = 'TOOL'
           GROUP BY mr.request_number, l.id, l.description, l.issued_qty
          HAVING sum(t.quantity) > l.issued_qty
           ORDER BY 1, 2, 3`,
    kolomKunci: ['masalah', 'loan_id'],
    tabel: ['material_request_tool_loans', 'material_request_lines', 'material_requests'],
  },
  {
    id: 'alat-reservasi',
    judul: 'Reservasi alat tidak melebihi pinjaman + WO aktif',
    keterangan:
      'Untuk barang TOOL: warehouse_stock.quantity_reserved ≤ pinjaman terbuka (baris MR TOOL diserahkan, belum kembali) + sisa booking WO aktif (stock_quantity − yang sudah diserahkan). Terjemahan SELECT dari scripts/report-tool-reservation-leak.ts (reservasi ganda alat sebelum perbaikan FMS-63). Semantik ini milik cabang di mana peminjaman alat = reservasi; bila server meminjamkan alat dengan stok keluar, baris di sini bisa menyesatkan.',
    sql: `WITH handed AS (
            SELECT r.work_order_id, r.warehouse_id, l.part_id, sum(l.issued_qty) AS quantity
              FROM material_request_lines l JOIN material_requests r ON r.id = l.request_id
             WHERE r.company_id = $1::uuid AND l.issued_qty > 0 AND r.status::text NOT IN ('CANCELLED','REJECTED')
             GROUP BY 1, 2, 3),
          loans AS (
            SELECT r.warehouse_id, l.part_id, sum(l.issued_qty) AS quantity
              FROM material_request_lines l JOIN material_requests r ON r.id = l.request_id
             WHERE r.company_id = $1::uuid AND l.item_kind::text = 'TOOL' AND l.issued_qty > 0
               AND l.returned_at IS NULL AND r.status::text <> 'REJECTED'
             GROUP BY 1, 2),
          booked AS (
            SELECT d.warehouse_id, d.part_id, sum(GREATEST(d.stock_quantity - coalesce(h.quantity, 0), 0)) AS quantity
              FROM work_order_details d JOIN work_orders w ON w.id = d.work_order_id
              LEFT JOIN handed h ON h.work_order_id = d.work_order_id AND h.warehouse_id = d.warehouse_id AND h.part_id = d.part_id
             WHERE w.company_id = $1::uuid AND w.spk_created_at IS NOT NULL
               AND w.status::text NOT IN ${WO_TERTUTUP} AND d.stock_quantity > 0
             GROUP BY 1, 2)
          SELECT w.code AS gudang, p.sku, s.quantity_on_hand::text AS on_hand, s.quantity_reserved::text AS reserved,
                 coalesce(l.quantity, 0)::text AS pinjaman, coalesce(b.quantity, 0)::text AS wo_aktif,
                 (s.quantity_reserved - coalesce(l.quantity, 0) - coalesce(b.quantity, 0))::text AS tanpa_dokumen
            FROM warehouse_stock s
            JOIN parts p ON p.id = s.part_id
            JOIN warehouses w ON w.id = s.warehouse_id
            LEFT JOIN loans l ON l.warehouse_id = s.warehouse_id AND l.part_id = s.part_id
            LEFT JOIN booked b ON b.warehouse_id = s.warehouse_id AND b.part_id = s.part_id
           WHERE s.company_id = $1::uuid AND p.item_kind::text = 'TOOL'
             AND s.quantity_reserved > coalesce(l.quantity, 0) + coalesce(b.quantity, 0)
           ORDER BY w.code, p.sku`,
    kolomKunci: ['gudang', 'sku'],
    tabel: [
      'warehouse_stock',
      'parts',
      'warehouses',
      'material_request_lines',
      'material_requests',
      'work_order_details',
      'work_orders',
    ],
  },
  {
    id: 'append-only',
    judul: 'Tabel append-only tidak di-UPDATE/DELETE',
    keterangan: `Snapshot pg_stat_user_tables (n_tup_upd, n_tup_del) untuk ${TABEL_APPEND_ONLY.join(', ')}; kenaikan antara baseline dan akhir = pelanggaran. Statistik ini global per database (bukan per tenant), jadi aktivitas server atau sesi lain pada database yang sama ikut terhitung; penghitung juga baru diperbarui beberapa ratus milidetik setelah transaksi. Tanpa baseline (bun run pemeriksaan) hanya menampilkan nilai penghitung.`,
    mode: 'kenaikan',
    sql: `SELECT relname AS tabel, n_tup_upd::text AS n_tup_upd, n_tup_del::text AS n_tup_del
            FROM pg_stat_user_tables
           WHERE schemaname = 'public' AND relname IN (${TABEL_APPEND_ONLY.map((t) => `'${t}'`).join(', ')})
           ORDER BY relname`,
    kolomKunci: ['tabel'],
    kolomAngka: ['n_tup_upd', 'n_tup_del'],
    tabel: [],
  },
]

export const INVARIAN_IDS = INVARIAN.map((i) => i.id) as [string, ...string[]]
export const petaInvarian = (): Map<string, Invarian> => new Map(INVARIAN.map((i) => [i.id, i]))

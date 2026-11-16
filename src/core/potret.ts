// Potret dokumentasi Kerja (sebelum/sesudah): screenshot halaman sebagai persona + snapshot query DB.
// Halaman: satu jendela, berganti akun seperti jalan skenario (persona ponsel memakai ukuran ponsel).
// DB: satu transaksi READ ONLY, $1 = company_id tenant, maks. BATAS_BARIS baris per query.
// Memegang kunci tenant selama memotret supaya tidak bertabrakan dengan jalan skenario.
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { dbUrlPemeriksaan } from '../pemeriksaan/jalankan.ts'
import { config } from './config.ts'
import {
  dirKerja,
  type Fase,
  type HasilDb,
  type HasilLayar,
  type Kerja,
  type Potret,
} from './kerja.ts'
import { ambilKunci, lepasKunci } from './kunci.ts'
import * as lib from './lib.ts'
import type { PersonaId } from './personas.ts'

const BATAS_BARIS = 500
const firstLine = (e: unknown) => String((e as Error)?.message ?? e).split('\n')[0] ?? ''

async function potretLayar(k: Kerja, dir: string, log: (l: string) => void): Promise<HasilLayar[]> {
  const out: HasilLayar[] = []
  if (!k.target.layar.length) return out
  const lama = lib.controller()
  lib.setController({
    gate: async () => {},
    hold: (ms) => new Promise((r) => setTimeout(r, ms)),
    log,
  })
  const browser = await lib.sharedBrowser({ headed: false })
  const first = k.target.layar[0]?.sebagai as PersonaId
  const p = await lib.asPersona(browser, first, { trace: false })
  let siapa: PersonaId = first
  try {
    for (const t of k.target.layar) {
      try {
        if (t.sebagai !== siapa) {
          await lib.become(p.page, t.sebagai as PersonaId)
          siapa = t.sebagai as PersonaId
        }
        await lib.open(p.page, t.rute)
        await p.page.waitForTimeout(2500)
        const file = `${t.nama}.png`
        await p.page.screenshot({ path: path.join(dir, file), fullPage: true })
        out.push({ nama: t.nama, sebagai: t.sebagai, rute: t.rute, file })
        log(`Layar ${t.nama}: ${lib.personaName(t.sebagai)} ${t.rute}`)
      } catch (e) {
        out.push({
          nama: t.nama,
          sebagai: t.sebagai,
          rute: t.rute,
          file: null,
          galat: firstLine(e),
        })
        log(`Layar ${t.nama} gagal: ${firstLine(e)}`)
      }
    }
  } finally {
    await p.ctx.close().catch(() => {})
    lib.setController(lama)
  }
  return out
}

type Klien = { unsafe<T = Record<string, unknown>>(q: string, p?: unknown[]): Promise<T[]> }

async function potretDb(k: Kerja, dir: string, log: (l: string) => void): Promise<HasilDb[]> {
  if (!k.target.db.length) return []
  const url = dbUrlPemeriksaan()
  if (!url)
    return k.target.db.map((t) => ({
      nama: t.nama,
      file: null,
      baris: 0,
      galat: 'DB lokal tidak dikonfigurasi (V2_DATABASE_URL)',
    }))
  const { SQL } = await import('bun')
  const sql = new SQL(url, { max: 1 })
  try {
    return await sql.begin('isolation level repeatable read read only', async (tx) => {
      const c = tx as unknown as Klien
      await c.unsafe(`SET LOCAL statement_timeout = '20s'`)
      const t0 = await c.unsafe<{ id: string }>('SELECT id FROM companies WHERE slug = $1', [
        config.tenantSlug,
      ])
      const companyId = t0[0]?.id
      if (!companyId) throw new Error(`Tenant "${config.tenantSlug}" tidak ada`)
      const out: HasilDb[] = []
      for (const t of k.target.db) {
        try {
          // Savepoint: query yang gagal tidak membatalkan query berikutnya.
          await c.unsafe('SAVEPOINT q')
          const q = t.sql.replace(/;\s*$/, '')
          const rows = await c.unsafe(
            `SELECT * FROM (${q}) q LIMIT ${BATAS_BARIS}`,
            q.includes('$1') ? [companyId] : [],
          )
          await c.unsafe('RELEASE SAVEPOINT q')
          const file = `${t.nama}.json`
          writeFileSync(
            path.join(dir, file),
            `${JSON.stringify({ nama: t.nama, sql: t.sql, baris: rows }, null, 2)}\n`,
          )
          out.push({ nama: t.nama, file, baris: rows.length })
          log(`DB ${t.nama}: ${rows.length} baris`)
        } catch (e) {
          await c.unsafe('ROLLBACK TO SAVEPOINT q').catch(() => {})
          out.push({ nama: t.nama, file: null, baris: 0, galat: firstLine(e) })
          log(`DB ${t.nama} gagal: ${firstLine(e)}`)
        }
      }
      return out
    })
  } finally {
    await sql.close().catch(() => {})
  }
}

/** Potret sebelum/sesudah sesuai `target`; folder fase lama diganti. */
export async function potret(
  k: Kerja,
  fase: Fase,
  log: (l: string) => void = () => {},
): Promise<Potret> {
  if (!k.target.layar.length && !k.target.db.length)
    throw new Error(
      `${k.key} belum punya target potret (bun run kerja target ${k.key} <berkas.json>)`,
    )
  const dir = path.join(dirKerja(k.key), fase)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  ambilKunci(config.tenantSlug, `kerja/${k.key}/${fase}`)
  try {
    const layar = await potretLayar(k, dir, log)
    const db = await potretDb(k, dir, log)
    return { at: new Date().toISOString(), layar, db }
  } finally {
    lepasKunci(config.tenantSlug)
  }
}

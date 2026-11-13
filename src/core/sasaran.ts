// Sasaran JSON → Locator Playwright. Selector berbasis peran, label, dan teks yang terlihat.
import type { Locator, Page } from 'playwright'
import { pola } from './placeholder.ts'
import type { Sasaran } from './skema.ts'

const KARTU =
  'xpath=ancestor::div[contains(@class,"MuiCard-root") or contains(@class,"MuiPaper-root")][1]'

export function cariLocator(root: Page | Locator, s: Sasaran): Locator {
  const scope = s.dalam ? cariLocator(root, s.dalam) : root
  const nama = (t: string) => ({ name: pola(t), exact: s.persis })
  const teks = (t: string) => ({ hasText: pola(t) })
  let loc: Locator
  if (s.tombol !== undefined) loc = scope.getByRole('button', nama(s.tombol))
  else if (s.tautan !== undefined) loc = scope.getByRole('link', nama(s.tautan))
  else if (s.combobox !== undefined) loc = scope.getByRole('combobox', nama(s.combobox))
  else if (s.kotakCentang !== undefined) loc = scope.getByRole('checkbox', nama(s.kotakCentang))
  else if (s.opsi !== undefined) loc = scope.getByRole('option', nama(s.opsi))
  else if (s.label !== undefined) loc = scope.getByLabel(pola(s.label), { exact: s.persis })
  else if (s.teks !== undefined) loc = scope.getByText(pola(s.teks), { exact: s.persis })
  else if (s.placeholder !== undefined)
    loc = scope.getByPlaceholder(pola(s.placeholder), { exact: s.persis })
  else if (s.peran !== undefined)
    // biome-ignore lint/suspicious/noExplicitAny: peran ARIA divalidasi skema sebagai teks
    loc = scope.getByRole(s.peran as any, s.nama !== undefined ? nama(s.nama) : {})
  else if (s.dialog !== undefined) {
    loc = scope.getByRole('dialog')
    if (s.dialog !== true) loc = loc.filter(teks(s.dialog))
  } else if (s.baris !== undefined) loc = scope.locator('tr').filter(teks(s.baris))
  else if (s.blok !== undefined) {
    loc = scope.locator('div, li, tr')
    for (const t of Array.isArray(s.blok) ? s.blok : [s.blok]) loc = loc.filter(teks(t))
  } else if (s.kartuPersetujuan)
    loc = scope
      .getByText('Persetujuan', { exact: true })
      .filter({ visible: true })
      .first()
      .locator(KARTU)
  else throw new Error(`Sasaran tidak dikenal: ${JSON.stringify(s)}`)
  loc = loc.filter({ visible: true })
  // Blok = pembungkus terkecil yang memuat semua teks, yaitu yang paling akhir di DOM.
  const ke = s.ke ?? (s.blok !== undefined ? 'terakhir' : 0)
  return ke === 'terakhir' ? loc.last() : loc.nth(ke)
}

const kutip = (t: string) => `“${t}”`

/** Uraian sasaran untuk panel, mis. tombol “Ajukan” di dialog “Kembalikan alat”. */
export function uraiSasaran(s: Sasaran): string {
  let u: string
  if (s.tombol !== undefined) u = `tombol ${kutip(s.tombol)}`
  else if (s.tautan !== undefined) u = `tautan ${kutip(s.tautan)}`
  else if (s.combobox !== undefined) u = `pilihan ${kutip(s.combobox)}`
  else if (s.kotakCentang !== undefined) u = `kotak centang ${kutip(s.kotakCentang)}`
  else if (s.opsi !== undefined) u = `opsi ${kutip(s.opsi)}`
  else if (s.label !== undefined) u = `isian ${kutip(s.label)}`
  else if (s.teks !== undefined) u = kutip(s.teks)
  else if (s.placeholder !== undefined) u = `isian ${kutip(s.placeholder)}`
  else if (s.peran !== undefined) u = s.nama ? `${s.peran} ${kutip(s.nama)}` : s.peran
  else if (s.dialog !== undefined) u = s.dialog === true ? 'dialog' : `dialog ${kutip(s.dialog)}`
  else if (s.baris !== undefined) u = `baris ${kutip(s.baris)}`
  else if (s.blok !== undefined)
    u = `bagian ${kutip((Array.isArray(s.blok) ? s.blok : [s.blok]).join(' · '))}`
  else u = 'panel Persetujuan'
  u = u.replaceAll(/“\/\^?(.*?)\$?\/[a-z]*”/g, '“$1”')
  return s.dalam ? `${u} di ${uraiSasaran(s.dalam)}` : u
}

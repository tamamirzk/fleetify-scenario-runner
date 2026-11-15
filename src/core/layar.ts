// Implementasi Layar dengan Playwright: semua aksi terlihat lewat lib/kit, jadi melewati
// gerbang jeda, satu aksi, kecepatan, dan hentikan.
import type { Page } from 'playwright'
import type { Layar, Pola } from './interpreter.ts'
import * as kitModule from './kit.ts'
import * as lib from './lib.ts'
import type { PersonaId } from './personas.ts'
import { cariLocator } from './sasaran.ts'
import type { Sasaran } from './skema.ts'

const BATAS_OPSIONAL = 2500

export interface LayarOpsi {
  page: Page
  total: number
  nomor: () => number
  shot(nama: string): Promise<string | null>
  sebagai(who: PersonaId): Promise<void>
}

export function layarPlaywright(o: LayarOpsi): Layar {
  const { page } = o
  const k = kitModule.kit({ total: o.total })
  const ctl = () => lib.controller()
  const loc = (s: Sasaran) => cariLocator(page, s)
  const ada = (s: Sasaran) =>
    loc(s)
      .waitFor({ state: 'visible', timeout: BATAS_OPSIONAL })
      .then(() => true)
      .catch(() => false)
  return {
    buka: (route) => lib.open(page, route),
    banner: (teks, ms) => k.say(page, `${o.nomor()}/${o.total} · ${teks}`, ms),
    tahan: (ms) => ctl().hold(ms),
    async klik(s, { tahan, opsional }) {
      if (opsional && !(await ada(s))) return false
      await lib.showClick(page, loc(s), tahan)
      return true
    },
    async klikTangkap(s, tahan, url, metode) {
      const resp = page.waitForResponse(
        (r) => url.test(r.url()) && (!metode || r.request().method() === metode),
        { timeout: 20_000 },
      )
      await lib.showClick(page, loc(s), tahan)
      return (await resp).json()
    },
    async isi(s, nilai, { tahan, opsional }) {
      if (
        opsional &&
        !(
          (await ada(s)) &&
          (await loc(s)
            .isEditable()
            .catch(() => false))
        )
      )
        return false
      await lib.showFill(page, loc(s), nilai, tahan)
      return true
    },
    pilih: (s, opsi: Pola, tahan) =>
      tahan === undefined ? k.pick(page, loc(s), opsi) : pilihCepat(page, s, opsi, tahan),
    cari: (s, ketik, opsi) => k.search(page, loc(s), ketik, opsi),
    async tunggu(s, { hilang, batas }) {
      await ctl().gate()
      await loc(s).waitFor({ state: hilang ? 'hidden' : 'visible', timeout: batas })
    },
    async tungguUrl(p, batas) {
      await page.waitForURL(p, { timeout: batas })
    },
    async gulir(s, opsional) {
      await ctl().gate()
      if (opsional && !(await ada(s))) return false
      await loc(s).scrollIntoViewIfNeeded()
      return true
    },
    terlihat: (s, batas) =>
      loc(s)
        .waitFor({ state: 'visible', timeout: batas })
        .then(() => true)
        .catch(() => false),
    hilang: (s, batas) =>
      loc(s)
        .waitFor({ state: 'hidden', timeout: batas })
        .then(() => true)
        .catch(() => false),
    nonaktif: (s) => loc(s).isDisabled(),
    url: () => page.url(),
    async teksElemen(s, batas) {
      const l = loc(s)
      const ada = await l
        .waitFor({ state: 'visible', timeout: batas })
        .then(() => true)
        .catch(() => false)
      return ada ? l.innerText({ timeout: 3000 }).catch(() => null) : null
    },
    teksHalaman: () => page.locator('body').innerText(),
    screenshot: (nama) => o.shot(nama),
    sebagai: (who) => o.sebagai(who),
  }
}

/** Pilih opsi combobox dengan tahanan sendiri (isian sampingan). */
async function pilihCepat(page: Page, s: Sasaran, opsi: Pola, tahan: number) {
  await lib.showClick(page, cariLocator(page, s), tahan)
  const option = page.getByRole('option', { name: opsi }).first()
  await option.waitFor({ state: 'visible', timeout: 10_000 })
  await lib.controller().gate()
  await option.click({ timeout: 10_000 })
  await page
    .getByRole('listbox')
    .waitFor({ state: 'hidden', timeout: 5_000 })
    .catch(() => {})
}

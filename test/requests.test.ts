// Pencatat request tulis: request yang dikirim di ujung langkah ditunggu sampai selesai, supaya tercatat
// di langkah itu (bukan hilang saat langkah berikutnya berpindah halaman).
import { EventEmitter } from 'node:events'
import type { Page, Request, Response } from 'playwright'
import { describe, expect, it } from 'vitest'
import { PencatatRequest } from '../src/core/requests.ts'
import type { RequestTulis } from '../src/core/run-types.ts'

const req = (method: string, url: string) =>
  ({
    method: () => method,
    url: () => url,
    timing: () => ({ responseEnd: 120 }),
  }) as unknown as Request
const res = (r: Request, status = 200) =>
  ({ request: () => r, url: () => r.url(), status: () => status }) as unknown as Response

describe('pencatat request: tunggu request tulis', () => {
  it('menunggu POST yang masih berjalan, lalu mencatatnya di langkah aktif; GET dan non-API diabaikan', async () => {
    const page = new EventEmitter()
    const dicatat: [number, RequestTulis][] = []
    const p = new PencatatRequest((n, r) => dicatat.push([n, r]))
    p.pasangBrowser(page as unknown as Page)
    p.aktif(2)
    const submit = req(
      'POST',
      'http://localhost:3000/api/v1/inventory/material-requests/abc/submit',
    )
    page.emit('request', submit)
    page.emit('request', req('GET', 'http://localhost:3000/api/v1/inventory/material-requests'))
    page.emit('request', req('POST', 'http://localhost:5173/@vite/client'))
    expect(p.sisaTulis).toBe(1)
    setTimeout(() => {
      page.emit('response', res(submit))
      page.emit('requestfinished', submit)
    }, 80)
    expect(await p.tungguTulis(2000)).toBe(0)
    expect(dicatat.map(([n, r]) => [n, r.method, r.path, r.sumber])).toEqual([
      [2, 'POST', '/inventory/material-requests/abc/submit', 'browser'],
    ])
  })

  it('batas habis: kembalikan jumlah yang masih berjalan; request gagal dilepas', async () => {
    const page = new EventEmitter()
    const p = new PencatatRequest(() => {})
    p.pasangBrowser(page as unknown as Page)
    const a = req('PATCH', 'http://localhost:3000/api/v1/x')
    page.emit('request', a)
    expect(await p.tungguTulis(60)).toBe(1)
    page.emit('requestfailed', a)
    expect(await p.tungguTulis(60)).toBe(0)
  })
})

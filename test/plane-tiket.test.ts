import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { config } from '../src/core/config.ts'
import { ambilTiket } from '../src/core/plane.ts'

const asli = { ...config.plane }
const isu = {
  id: 'isu-10',
  sequence_id: 10,
  name: 'Maintenance Schedule Engine',
  description_html: '<p>Isi</p>',
  priority: 'high',
  state: { name: 'Ready in Staging and for Testing' },
}

function palsu(rute: Record<string, { status: number; body: unknown }>) {
  const diminta: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const jalur = String(url).replace('https://plane.test/api/v1', '')
      diminta.push(jalur)
      const r = Object.entries(rute).find(([awal]) => jalur.startsWith(awal))?.[1] ?? {
        status: 404,
        body: {},
      }
      return new Response(JSON.stringify(r.body), { status: r.status })
    }),
  )
  return diminta
}

beforeEach(() => {
  Object.assign(config.plane, {
    url: 'https://plane.test',
    apiKey: 'k',
    workspace: 'fleetify',
    project: 'FMS',
  })
})
afterEach(() => {
  vi.unstubAllGlobals()
  Object.assign(config.plane, asli)
})

describe('ambilTiket', () => {
  it('membaca satu isu per kunci tanpa mengunduh semua isu project', async () => {
    const diminta = palsu({
      '/workspaces/fleetify/projects/?': { status: 200, body: [{ id: 'p1', identifier: 'FMS' }] },
      '/workspaces/fleetify/projects/': { status: 200, body: [{ id: 'p1', identifier: 'FMS' }] },
      '/workspaces/fleetify/issues/FMS-10/': { status: 200, body: isu },
    })
    const t = await ambilTiket('FMS-10')
    expect(t).toMatchObject({
      id: 'isu-10',
      judul: 'Maintenance Schedule Engine',
      status: 'Ready in Staging and for Testing',
      prioritas: 'high',
      projectId: 'p1',
    })
    expect(diminta.some((j) => j.includes('/projects/p1/issues/'))).toBe(false)
  })

  it('jatuh ke daftar isu bila jalur per-kunci tidak ada', async () => {
    const diminta = palsu({
      '/workspaces/fleetify/projects/p1/issues/': {
        status: 200,
        body: { results: [isu], next_page_results: false },
      },
      '/workspaces/fleetify/projects/': { status: 200, body: [{ id: 'p1', identifier: 'FMS' }] },
    })
    const t = await ambilTiket('FMS-10')
    expect(t.status).toBe('Ready in Staging and for Testing')
    expect(diminta.some((j) => j.startsWith('/workspaces/fleetify/issues/FMS-10/'))).toBe(true)
    expect(diminta.some((j) => j.includes('/projects/p1/issues/'))).toBe(true)
  })
})

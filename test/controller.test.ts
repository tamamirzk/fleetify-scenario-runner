import { describe, expect, it } from 'vitest'
import { Controller, clampSpeed, Stopped } from '../src/core/controller.ts'

const settled = async (p: Promise<unknown>, ms = 50) =>
  Promise.race([p.then(() => true), new Promise((r) => setTimeout(() => r(false), ms))])

describe('Controller.gate', () => {
  it('lewat langsung bila tidak dijeda', async () => {
    expect(await settled(new Controller().gate())).toBe(true)
  })

  it('menahan aksi selama jeda lalu lepas saat lanjut', async () => {
    const c = new Controller()
    c.pause()
    const g = c.gate()
    expect(await settled(g)).toBe(false)
    c.resume()
    expect(await settled(g)).toBe(true)
  })

  it('satu aksi meloloskan tepat satu gate, lalu tetap jeda', async () => {
    const c = new Controller()
    c.pause()
    c.step()
    expect(await settled(c.gate())).toBe(true)
    expect(c.paused).toBe(true)
    expect(await settled(c.gate())).toBe(false)
    c.stop()
  })

  it('melempar Stopped saat dihentikan, juga saat sedang jeda', async () => {
    const c = new Controller()
    c.pause()
    const g = c.gate()
    c.stop()
    await expect(g).rejects.toBeInstanceOf(Stopped)
    await expect(c.gate()).rejects.toBeInstanceOf(Stopped)
  })
})

describe('Controller.hold', () => {
  it('diskalakan mode dan kecepatan', async () => {
    const c = new Controller({ scale: 0.1, speed: 2 })
    const t0 = Date.now()
    await c.hold(1000) // 1000 × 0.1 / 2 = 50 ms
    const ms = Date.now() - t0
    expect(ms).toBeGreaterThanOrEqual(40)
    expect(ms).toBeLessThan(200)
  })

  it('berhenti selama jeda', async () => {
    const c = new Controller({ scale: 0.01 })
    c.pause()
    const h = c.hold(1000)
    expect(await settled(h, 80)).toBe(false)
    c.resume()
    expect(await settled(h, 200)).toBe(true)
  })

  it('melempar Stopped saat dihentikan', async () => {
    const c = new Controller()
    const h = c.hold(10_000)
    c.stop()
    await expect(h).rejects.toBeInstanceOf(Stopped)
  })
})

describe('kecepatan', () => {
  it('dibatasi 0,25–3 dan nilai tak sah jadi 1', () => {
    expect(clampSpeed(10)).toBe(3)
    expect(clampSpeed(0.1)).toBe(0.25)
    expect(clampSpeed(0.25)).toBe(0.25)
    expect(clampSpeed(Number.NaN)).toBe(1)
    const c = new Controller()
    c.setSpeed('1.5')
    expect(c.speed).toBe(1.5)
  })
})

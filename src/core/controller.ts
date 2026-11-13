// Controller satu jalan: jeda, satu aksi, kecepatan, hentikan. Murni (tanpa browser),
// sehingga bisa diuji. Semua aksi terlihat memanggil gate(); semua tahanan lewat hold().
import { EventEmitter } from 'node:events'

export class Stopped extends Error {
  constructor() {
    super('Dihentikan')
  }
}

export const SPEED_MIN = 0.5
export const SPEED_MAX = 3
const WAKE_MS = 1000
const TICK_MS = 100

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

export interface ControllerOptions {
  /** Pengali tahanan: 1 untuk headed, kecil untuk headless (lihat HEADLESS_HOLD). */
  scale?: number
  speed?: number
}

export class Controller extends EventEmitter {
  readonly scale: number
  speed: number
  paused = false
  allowOne = false
  stopRequested = false
  private waiters: Array<() => void> = []

  constructor({ scale = 1, speed = 1 }: ControllerOptions = {}) {
    super()
    this.scale = scale
    this.speed = clampSpeed(speed)
  }

  private wake() {
    for (const w of this.waiters.splice(0)) w()
  }

  private waitChange(ms: number) {
    return new Promise<void>((resolve) => {
      const t = setTimeout(resolve, ms)
      this.waiters.push(() => {
        clearTimeout(t)
        resolve()
      })
    })
  }

  log(line: string) {
    this.emit('log', line)
  }

  /** Dipanggil sebelum setiap aksi terlihat. Menunggu selama jeda; melempar Stopped saat dihentikan. */
  async gate(): Promise<void> {
    for (;;) {
      if (this.stopRequested) throw new Stopped()
      if (!this.paused) return
      if (this.allowOne) {
        this.allowOne = false
        this.emit('change')
        return
      }
      await this.waitChange(WAKE_MS)
    }
  }

  /** Tahan `ms` nominal, diskalakan mode dan kecepatan; berhenti selama jeda. */
  async hold(ms: number): Promise<void> {
    let left = ms * this.scale
    while (left > 0) {
      if (this.stopRequested) throw new Stopped()
      if (this.paused && !this.allowOne) {
        await this.waitChange(WAKE_MS)
        continue
      }
      const tick = Math.min(TICK_MS, left / this.speed)
      await sleep(tick)
      left -= tick * this.speed
    }
  }

  pause() {
    this.paused = true
    this.emit('change')
  }

  resume() {
    this.paused = false
    this.allowOne = false
    this.wake()
    this.emit('change')
  }

  /** Satu aksi: tetap dijeda, tapi izinkan satu gate() lewat. */
  step() {
    this.paused = true
    this.allowOne = true
    this.wake()
    this.emit('change')
  }

  stop() {
    this.stopRequested = true
    this.wake()
    this.emit('change')
  }

  setSpeed(s: unknown) {
    this.speed = clampSpeed(Number(s))
    this.wake()
    this.emit('change')
  }
}

export function clampSpeed(s: number): number {
  if (!Number.isFinite(s) || s <= 0) return 1
  return Math.min(SPEED_MAX, Math.max(SPEED_MIN, s))
}

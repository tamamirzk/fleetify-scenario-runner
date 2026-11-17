// Peringkas keluaran `claude -p --output-format stream-json` untuk mode Latar: satu baris per
// langkah (teks atau alat), supaya layar tmux dan cuplikan di panel tetap terbaca (R-6.3).
import { barisStream } from './core/sesi.ts'

const dekoder = new TextDecoder()
let sisa = ''
for await (const potong of Bun.stdin.stream()) {
  sisa += dekoder.decode(potong, { stream: true })
  const baris = sisa.split('\n')
  sisa = baris.pop() ?? ''
  for (const b of baris) {
    if (!b.trim()) continue
    try {
      const out = barisStream(JSON.parse(b))
      if (out) console.log(out)
    } catch {
      console.log(b)
    }
  }
}

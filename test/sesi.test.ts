import { describe, expect, it } from 'vitest'
import { butuhKamu } from '../src/core/butuh-kamu.ts'
import type { Kerja } from '../src/core/kerja.ts'
import {
  argsClaude,
  barisStream,
  izinFase,
  kutipShell,
  LARANG_UMUM,
  perintahTmux,
  promptFase,
  settingsHook,
  statusDariHook,
} from '../src/core/sesi.ts'

describe('sesi: izin per fase (R-6.5)', () => {
  it('semua fase melarang push, tulis Plane, dan migrasi deploy', () => {
    for (const f of ['pahami', 'kerjakan', 'serahkan', 'lanjut'] as const) {
      const { larang } = izinFase(f, '/w/v2')
      expect(larang).toEqual(
        expect.arrayContaining([
          'Bash(git push *)',
          'Bash(git push)',
          'Bash(bun run kerja plane *)',
        ]),
      )
    }
    expect(LARANG_UMUM).toContain('Bash(* prisma migrate deploy*)')
  })

  it('Pahami tidak boleh menulis di worktree v2; Kerjakan boleh', () => {
    expect(izinFase('pahami', '/w/v2').larang).toContain('Edit(//w/v2/**)')
    expect(izinFase('pahami', '/w/v2').izin).toContain('Edit(./kerja/**)')
    expect(izinFase('kerjakan', '/w/v2').izin).toContain('Edit(//w/v2/**)')
    expect(izinFase('kerjakan', '/w/v2').larang).not.toContain('Edit(//w/v2/**)')
    expect(izinFase('serahkan', '/w/v2').izin).toContain('Bash(git merge *)')
  })
})

describe('sesi: perintah claude', () => {
  const dasar = {
    key: 'FMS-9',
    fase: 'pahami' as const,
    sesiId: 'id-1',
    worktree: '/w/v2',
    port: 5800,
  }

  it('sesi pertama memakai --session-id, berikutnya --resume (R-6.1)', () => {
    expect(argsClaude({ ...dasar, mode: 'terminal', baru: true }).slice(0, 3)).toEqual([
      'claude',
      '--session-id',
      'id-1',
    ])
    expect(argsClaude({ ...dasar, mode: 'terminal', baru: false }).slice(0, 3)).toEqual([
      'claude',
      '--resume',
      'id-1',
    ])
  })

  it('mode Latar: -p stream-json, tanpa prompt izin, dengan batas biaya; Terminal tidak', () => {
    const latar = argsClaude({ ...dasar, mode: 'latar', baru: true })
    expect(latar).toEqual(
      expect.arrayContaining([
        '-p',
        'stream-json',
        '--permission-prompts',
        'none',
        '--max-budget-usd',
      ]),
    )
    expect(argsClaude({ ...dasar, mode: 'terminal', baru: true })).not.toContain('-p')
    expect(latar.at(-2)).toBe('--')
    expect(latar.at(-1)).toContain('/kerjakan FMS-9 — fase PAHAMI')
    expect(perintahTmux(latar, 'latar')).toContain('| bun ')
  })

  it('prompt selalu melarang push dan Plane; Lanjutkan membawa arahan Tams', () => {
    for (const f of ['pahami', 'kerjakan', 'serahkan'] as const)
      expect(promptFase('FMS-9', f, { worktree: '/w' })).toContain('Jangan push')
    expect(promptFase('FMS-9', 'lanjut', { worktree: '/w', teks: 'pakai merge' })).toContain(
      'Arahan Tams: pakai merge',
    )
  })

  it('hook mengabari panel untuk empat event (R-6.4)', () => {
    const h = JSON.parse(settingsHook('FMS-9', 5800)).hooks
    expect(Object.keys(h)).toEqual(['UserPromptSubmit', 'Notification', 'Stop', 'SessionEnd'])
    expect(h.Stop[0].hooks[0].command).toContain('http://127.0.0.1:5800/api/kerja/FMS-9/kabar')
  })

  it('kutip shell aman untuk tanda petik tunggal', () => {
    expect(kutipShell("it's")).toBe(`'it'\\''s'`)
  })
})

describe('sesi: hook dan stream', () => {
  it('event → status', () => {
    expect(statusDariHook('UserPromptSubmit')?.status).toBe('bekerja')
    expect(statusDariHook('Notification', 'Claude needs permission')).toEqual({
      status: 'menunggu',
      pesan: 'Claude needs permission',
    })
    expect(statusDariHook('Stop')?.status).toBe('menunggu')
    expect(statusDariHook('SessionEnd')?.status).toBe('berhenti')
    expect(statusDariHook('PreToolUse')).toBeNull()
  })

  it('stream-json diringkas jadi teks dan langkah alat', () => {
    expect(
      barisStream({
        type: 'assistant',
        message: {
          content: [
            { type: 'text', text: 'Membaca tiket' },
            {
              type: 'tool_use',
              name: 'Bash',
              input: { command: 'bun run kerja lihat FMS-9\nlagi' },
            },
          ],
        },
      }),
    ).toBe('Membaca tiket\n▸ Bash: bun run kerja lihat FMS-9')
    expect(barisStream({ type: 'result', subtype: 'success', total_cost_usd: 0.123 })).toBe(
      '■ selesai (success) · $0.12',
    )
    expect(barisStream({ type: 'system' })).toBeNull()
  })
})

describe('butuh kamu (R-5.2)', () => {
  const ok = { ok: true, masalah: [] }
  const belum = { ok: false, masalah: ['x'] }
  const kerja = (o: Partial<Kerja>) =>
    ({
      key: 'FMS-9',
      judul: 'J',
      tahap: 'dipelajari',
      pertanyaan: [],
      mintaUbah: [],
      keputusan: [],
      cekStaging: [],
      ...o,
    }) as Kerja

  it('pertanyaan terbuka didahulukan', () => {
    const b = butuhKamu(
      kerja({
        pertanyaan: [{ id: 1, teks: 't', usulan: [], at: '', jawaban: null, dijawabPada: null }],
      }),
      { brief: ok, akhir: ok },
    )
    expect(b?.aksi).toEqual({ jenis: 'buka', label: 'Jawab' })
  })

  it('Claude menunggu → buka terminal; Claude bekerja → tidak menunggu Tams', () => {
    const sesi = { id: 'i', fase: 'pahami' as const, mode: 'terminal' as const, mulai: '', at: '' }
    expect(
      butuhKamu(kerja({ sesi: { ...sesi, status: 'menunggu', pesan: 'izin Bash' } }), {
        brief: ok,
        akhir: ok,
      })?.aksi.jenis,
    ).toBe('terminal')
    expect(
      butuhKamu(kerja({ sesi: { ...sesi, status: 'bekerja' } }), { brief: ok, akhir: ok }),
    ).toBeNull()
  })

  it('tanpa sesi: Brief belum → Pahami; Brief siap → ◆A Setujui & Kerjakan; hasil siap → ◆B Review', () => {
    expect(butuhKamu(kerja({}), { brief: belum, akhir: belum })?.aksi).toMatchObject({
      jenis: 'fase',
      fase: 'pahami',
    })
    const a = butuhKamu(kerja({}), { brief: ok, akhir: belum })
    expect(a).toMatchObject({ titik: 'A', aksi: { fase: 'kerjakan' } })
    expect(butuhKamu(kerja({ tahap: 'diverifikasi' }), { brief: ok, akhir: ok })?.titik).toBe('B')
    expect(butuhKamu(kerja({ tahap: 'selesai' }), { brief: ok, akhir: ok })).toBeNull()
    expect(butuhKamu(kerja({ ditunda: { at: '' } }), { brief: belum, akhir: belum })).toBeNull()
  })
})

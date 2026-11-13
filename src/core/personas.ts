// Persona tenant MBL (seed v2). Kunci = awalan email anggota, dipakai untuk impersonasi.
export const PERSONAS = {
  'mbl.superintendent': 'Bagus (Superintendent)',
  'mbl.plant-superintendent': 'Andi (Plant Superintendent)',
  'mbl.planner': 'Putri (Planner)',
  'mbl.foreman.beta': 'Bima (Foreman Beta)',
  'mbl.foreman': 'Fajar (Foreman)',
  'mbl.supervisor': 'Surya (Supervisor)',
  'mbl.mechanic': 'Made (Mekanik)',
  'mbl.storekeeper': 'Wati (Penjaga Gudang)',
  'mbl.purchasing': 'Purnomo (Purchasing)',
  'mbl.dispatcher': 'Dedi (Dispatcher)',
  'mbl.mcr': 'Mira (Pelapor)',
} as const

export type PersonaId = keyof typeof PERSONAS
export const PERSONA_IDS = Object.keys(PERSONAS) as [PersonaId, ...PersonaId[]]

export const personaName = (who: string): string => (PERSONAS as Record<string, string>)[who] ?? who

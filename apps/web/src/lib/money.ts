const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

export const formatBRL = (cents: number) => brl.format(cents / 100)

/** "349,90", "R$ 1.200" ou "1200.5" → centavos. Vazio → null. Inválido → NaN. */
export function parseBRL(input: string): number | null {
  const clean = input.replace(/[R$\s]/g, '')
  if (!clean) return null
  const normalized = clean.includes(',') ? clean.replace(/\./g, '').replace(',', '.') : clean
  const value = Number(normalized)
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : NaN
}

/** Centavos → texto para o campo do painel ("349,90"). */
export const centsToInput = (cents: number | null) =>
  cents == null ? '' : (cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

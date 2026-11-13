import { centsToInput } from '../../lib/money'

// O que o favorito "＋ Lista E&T" manda da página da loja, e como lemos o preço.

export type Incoming = { url: string; title?: string; price?: string; image?: string }
/** Resposta para a aba da loja: conferido, precisa de confirmação no painel, ou foi para a fila. */
export type Reply = 'et-ok' | 'et-wait' | 'et-draft'
export type CheckHandler = (d: Incoming, from: MessageEventSource | null) => Reply | null

/** "R$ 1.299,90", "R$29,90 - R$49,90", "41.99" → texto "1.299,90" pronto para o campo. */
export function priceInput(raw: string) {
  const token = raw.replace(/\s/g, '').match(/\d[\d.,]*/)?.[0]
  if (!token) return ''
  let n: number
  if (token.includes(',')) n = Number(token.replace(/\./g, '').replace(',', '.'))
  else if (/\.\d{1,2}$/.test(token)) n = Number(token)
  else n = Number(token.replace(/\./g, ''))
  return Number.isFinite(n) && n > 0 ? centsToInput(Math.round(n * 100)) : ''
}

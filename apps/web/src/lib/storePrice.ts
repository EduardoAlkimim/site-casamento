import type { Gift } from './api'
import { formatBRL } from './money'

// Item comprado numa loja (Shopee etc.): o preço muda lá todo dia, então o
// site mostra como referência ("≈") — ninguém estranha a diferença.
export const isStorePrice = (g: Pick<Gift, 'purchaseMode' | 'externalUrl' | 'hasLink'>) =>
  g.purchaseMode !== 'site' && Boolean(g.externalUrl || g.hasLink)

export const priceLabel = (g: Gift) => (g.priceCents == null ? null : `${isStorePrice(g) ? '≈ ' : ''}${formatBRL(g.priceCents)}`)

export const STORE_PRICE_NOTE = 'Valor de referência: pode mudar na loja.'

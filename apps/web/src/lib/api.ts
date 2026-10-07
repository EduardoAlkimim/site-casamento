// Cliente da API. Sempre em /api no mesmo domínio do site (proxy do Vite em
// dev, rewrite da Vercel em produção), então os cookies são de primeira parte.

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method: init.method ?? (init.body ? 'POST' : 'GET'),
    credentials: 'same-origin',
    headers: init.body ? { 'content-type': 'application/json' } : undefined,
    body: init.body ? JSON.stringify(init.body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Não foi possível falar com o servidor. Tente de novo.')
  return data as T
}

export type Page = {
  slug: string
  title: string
  locked: boolean
  lockMessage: string | null
  heading: string | null
  intro: string | null
}
export type Padrinho = { id: number; name: string; role: 'padrinho' | 'madrinha'; personalMessage: string }
export type ManualSection = { id: number; title: string; body: string }
export type AdminPadrinho = Padrinho & { createdAt: string; lastSeenAt: string | null }

export type GiftStatus = 'disponivel' | 'reservado' | 'presenteado'
export type Gift = {
  id: number
  name: string
  description: string
  image: string | null
  imageUrl: string | null
  priceCents: number | null
  status: GiftStatus
  purchaseMode: 'site' | 'link' | 'reserva'
  externalUrl: string | null
  roomId: number | null
  /** Item de reserva com link de loja (o link só chega depois de reservar). */
  hasLink?: boolean
  /** Só vêm para os noivos (painel). */
  reservedBy?: string | null
  reservedContact?: string | null
  reservedAt?: string | null
}
export type GiftRoom = { id: number; name: string }
export type ChaEvent = { date: string; time: string; venue: string; address: string }
export type GiftListName = 'casamento' | 'cha'
export type GiftListData = {
  page: { title: string; heading: string | null; intro: string | null }
  gifts: Gift[]
  rooms: GiftRoom[]
  event?: ChaEvent
}

/** Envia uma imagem (já reduzida) para o painel. */
export async function uploadImage(file: Blob): Promise<{ image: string; url: string }> {
  const form = new FormData()
  form.append('file', file, 'foto.webp')
  const res = await fetch('/api/admin/uploads', { method: 'POST', body: form, credentials: 'same-origin' })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'Não foi possível enviar a foto.')
  return data
}

export type PaymentConfig = { enabled: boolean; publicKey: string | null }
export type PaymentCreated = {
  id: string
  status: string
  message: string | null
  pix: { qrCode: string; qrCodeBase64: string; expiresAt: string | null } | null
}
export type AdminPayment = {
  id: string
  giftName: string
  amountCents: number
  method: 'pix' | 'card'
  payerName: string
  payerEmail: string
  status: string
  message: string | null
  createdAt: string
  approvedAt: string | null
}

export type PageText = { title: string; heading: string | null; intro: string | null }
export type StoryMoment = { id: number; dateLabel: string; title: string; body: string; image: string | null; imageUrl: string | null }
export type InfoBlock = {
  id: number
  kind: 'destaque' | 'faq'
  title: string
  subtitle: string
  body: string
  address: string
  mapUrl: string | null
}
export type GuestMessage = { id: number; name: string; body: string; createdAt: string }
export type AdminMessage = GuestMessage & { status: 'pendente' | 'aprovado' | 'oculto' }

export type SiteTexts = {
  phrase: string
  dayTitle: string
  dayTitleEm: string
  ceremonyTime: string
  venue: string
  city: string
}
export type Pendencia = { area: string; label: string; anchor: string }

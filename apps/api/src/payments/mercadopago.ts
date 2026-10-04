import { config } from '../config.ts'

// Cliente mínimo da API de pagamentos do Mercado Pago (REST, sem SDK, para
// gastar pouca memória na VM). Doc: https://www.mercadopago.com.br/developers/pt/reference/payments/_payments/post

const API = 'https://api.mercadopago.com/v1/payments'

export type MpPayment = {
  id: number
  status: string
  status_detail: string
  external_reference: string | null
  transaction_amount: number
  point_of_interaction?: {
    transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string }
  }
  date_of_expiration?: string | null
}

export class MpError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(method: 'GET' | 'POST', url: string, body?: unknown, idempotencyKey?: string): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${config.mpAccessToken}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(20_000),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    const cause = Array.isArray(data.cause) ? data.cause.map((c: { description?: string }) => c.description).join('; ') : ''
    throw new MpError(res.status, `${data.message ?? 'erro'}${cause ? ` (${cause})` : ''}`)
  }
  return data as T
}

const splitName = (full: string) => {
  const [first, ...rest] = full.trim().split(/\s+/)
  return { first_name: first, last_name: rest.join(' ') || first }
}

type Common = {
  amountCents: number
  description: string
  payerName: string
  payerEmail: string
  /** Nosso id público; vira a chave de idempotência e a referência externa. */
  reference: string
  notificationUrl: string | null
}

export function createPixPayment(p: Common) {
  return request<MpPayment>(
    'POST',
    API,
    {
      transaction_amount: p.amountCents / 100,
      description: p.description,
      payment_method_id: 'pix',
      external_reference: p.reference,
      notification_url: p.notificationUrl ?? undefined,
      // QR Code vale 30 minutos.
      date_of_expiration: new Date(Date.now() + 30 * 60_000).toISOString().replace('Z', '-00:00'),
      payer: { email: p.payerEmail, ...splitName(p.payerName) },
    },
    p.reference,
  )
}

export type CardData = {
  token: string
  paymentMethodId: string
  issuerId?: string | number | null
  installments: number
  identificationType?: string
  identificationNumber?: string
}

export function createCardPayment(p: Common & { card: CardData }) {
  return request<MpPayment>(
    'POST',
    API,
    {
      transaction_amount: p.amountCents / 100,
      description: p.description,
      token: p.card.token,
      payment_method_id: p.card.paymentMethodId,
      issuer_id: p.card.issuerId ? Number(p.card.issuerId) : undefined,
      installments: p.card.installments,
      external_reference: p.reference,
      notification_url: p.notificationUrl ?? undefined,
      payer: {
        email: p.payerEmail,
        ...splitName(p.payerName),
        identification: p.card.identificationNumber
          ? { type: p.card.identificationType ?? 'CPF', number: p.card.identificationNumber }
          : undefined,
      },
    },
    p.reference,
  )
}

export const getPayment = (providerId: string) => request<MpPayment>('GET', `${API}/${encodeURIComponent(providerId)}`)

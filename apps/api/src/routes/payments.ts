import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { isAdmin, requireAdmin } from '../auth.ts'
import { config } from '../config.ts'
import { db } from '../db.ts'
import { createCardPayment, createPixPayment, getPayment, MpError, type CardData, type MpPayment } from '../payments/mercadopago.ts'
import { brl, notify } from '../notify.ts'

const LIST_PAGE = { casamento: 'presentes', cha: 'cha-de-panela' } as const
const enabled = () => Boolean(config.mpAccessToken && config.mpPublicKey)

// O Mercado Pago só consegue avisar um endereço público com HTTPS.
const notificationUrl = () =>
  config.publicSiteUrl.startsWith('https://') ? `${config.publicSiteUrl}/api/pagamentos/webhook` : null

type PaymentRow = {
  id: number
  publicId: string
  giftId: number | null
  giftName: string
  amountCents: number
  method: 'pix' | 'card'
  payerName: string
  status: string
  providerId: string | null
  updatedAt: string
}

const SELECT = `SELECT id, public_id AS publicId, gift_id AS giftId, gift_name AS giftName, amount_cents AS amountCents,
  method, payer_name AS payerName, status, provider_id AS providerId, updated_at AS updatedAt FROM payments`

/** Grava o status vindo do Mercado Pago e mantém o presente coerente. */
function applyStatus(row: Pick<PaymentRow, 'id' | 'giftId'>, mp: MpPayment) {
  const wasApproved = Boolean(
    (db.prepare('SELECT approved_at FROM payments WHERE id = ?').get(row.id) as { approved_at: string | null } | undefined)?.approved_at,
  )
  db.prepare(
    `UPDATE payments SET status = ?, status_detail = ?, provider_id = COALESCE(provider_id, ?), updated_at = datetime('now'),
       approved_at = CASE WHEN ? = 'approved' AND approved_at IS NULL THEN datetime('now') ELSE approved_at END
     WHERE id = ?`,
  ).run(mp.status, mp.status_detail, String(mp.id), mp.status, row.id)

  // Aviso por e-mail só na primeira vez que o pagamento é aprovado.
  if (mp.status === 'approved' && !wasApproved) {
    const p = db
      .prepare('SELECT gift_name AS gift, amount_cents AS cents, method, payer_name AS name, payer_email AS email FROM payments WHERE id = ?')
      .get(row.id) as { gift: string; cents: number; method: string; name: string; email: string }
    notify(`🎁 Presente recebido: ${p.gift}`, 'Vocês ganharam um presente!', [
      ['Presente', p.gift],
      ['Valor', brl(p.cents)],
      ['De', p.name],
      ['E-mail', p.email],
      ['Forma', p.method === 'pix' ? 'PIX' : 'Cartão'],
    ])
  }

  if (!row.giftId) return
  if (mp.status === 'approved') {
    db.prepare("UPDATE gifts SET status = 'presenteado' WHERE id = ?").run(row.giftId)
  } else if (['refunded', 'charged_back', 'cancelled'].includes(mp.status)) {
    // Estornado: o presente volta para a lista, se não houver outro pagamento aprovado.
    const other = db.prepare("SELECT 1 FROM payments WHERE gift_id = ? AND status = 'approved'").get(row.giftId)
    if (!other) db.prepare("UPDATE gifts SET status = 'disponivel' WHERE id = ? AND status = 'presenteado'").run(row.giftId)
  }
}

async function refreshFromProvider(providerId: string) {
  const mp = await getPayment(providerId)
  const row = db.prepare(`${SELECT} WHERE provider_id = ? OR public_id = ?`).get(String(mp.id), mp.external_reference ?? '') as
    | PaymentRow
    | undefined
  if (row) applyStatus(row, mp)
  return mp
}

// Mensagens para o convidado a partir do status_detail do Mercado Pago.
function friendlyRejection(detail: string | null): string {
  const map: Record<string, string> = {
    cc_rejected_insufficient_amount: 'O cartão não tem limite suficiente.',
    cc_rejected_bad_filled_security_code: 'O código de segurança (CVV) não confere.',
    cc_rejected_bad_filled_date: 'A data de validade não confere.',
    cc_rejected_bad_filled_other: 'Algum dado do cartão não confere. Confira e tente de novo.',
    cc_rejected_call_for_authorize: 'O banco pediu para você autorizar o pagamento. Ligue para o banco e tente de novo.',
    cc_rejected_card_disabled: 'O cartão está bloqueado. Ative com o banco ou use outro.',
    cc_rejected_duplicated_payment: 'Já existe um pagamento igual a este. Confira seu e-mail.',
    cc_rejected_high_risk: 'O pagamento foi recusado por segurança. Tente com PIX ou outro cartão.',
    cc_rejected_max_attempts: 'Muitas tentativas com este cartão. Tente com PIX ou outro cartão.',
  }
  return (detail && map[detail]) || 'O pagamento não foi aprovado. Tente outro cartão ou pague com PIX.'
}

type CreateBody = {
  giftId: number
  payerName: string
  payerEmail: string
  method: 'pix' | 'card'
  card?: CardData
}

export async function paymentRoutes(app: FastifyInstance) {
  app.get('/pagamentos/config', async () => ({ enabled: enabled(), publicKey: enabled() ? config.mpPublicKey : null }))

  app.post<{ Body: CreateBody }>(
    '/pagamentos',
    {
      config: { rateLimit: { max: 10, timeWindow: '5 minutes' } },
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['giftId', 'payerName', 'payerEmail', 'method'],
          properties: {
            giftId: { type: 'integer', minimum: 1 },
            payerName: { type: 'string', minLength: 3, maxLength: 120 },
            payerEmail: { type: 'string', format: 'email', maxLength: 160 },
            method: { type: 'string', enum: ['pix', 'card'] },
            card: {
              type: 'object',
              additionalProperties: false,
              required: ['token', 'paymentMethodId', 'installments'],
              properties: {
                token: { type: 'string', minLength: 10, maxLength: 100 },
                paymentMethodId: { type: 'string', maxLength: 40 },
                issuerId: { type: ['string', 'integer', 'null'] },
                installments: { type: 'integer', minimum: 1, maximum: 12 },
                identificationType: { type: 'string', maxLength: 10 },
                identificationNumber: { type: 'string', maxLength: 20 },
              },
            },
          },
        },
      },
    },
    async (req, reply) => {
      if (!enabled()) return reply.code(503).send({ error: 'Os pagamentos pelo site ainda não foram ativados.' })
      const body = req.body
      if (body.method === 'card' && !body.card) return reply.code(400).send({ error: 'Dados do cartão ausentes.' })

      // Preço e disponibilidade vêm sempre do banco, nunca do navegador.
      const gift = db
        .prepare('SELECT id, list, name, price_cents AS priceCents, status, purchase_mode AS mode FROM gifts WHERE id = ?')
        .get(body.giftId) as
        | { id: number; list: keyof typeof LIST_PAGE; name: string; priceCents: number | null; status: string; mode: string }
        | undefined
      if (!gift) return reply.code(404).send({ error: 'Presente não encontrado.' })
      const page = db.prepare('SELECT locked FROM pages WHERE slug = ?').get(LIST_PAGE[gift.list]) as { locked: number }
      if (page.locked && !isAdmin(req)) return reply.code(423).send({ error: 'Esta lista ainda não foi liberada.' })
      if (gift.mode !== 'site' || !gift.priceCents) return reply.code(409).send({ error: 'Este presente não é pago pelo site.' })
      if (gift.status !== 'disponivel') return reply.code(409).send({ error: 'Este presente já foi escolhido por outra pessoa.' })
      // Um PIX em aberto segura o presente por 30 min (a mesma pessoa pode tentar de novo).
      const holding = db
        .prepare(
          `SELECT 1 FROM payments WHERE gift_id = ? AND status IN ('creating', 'pending', 'in_process')
             AND created_at > datetime('now', '-30 minutes') AND lower(payer_email) <> lower(?)`,
        )
        .get(gift.id, body.payerEmail.trim())
      if (holding) {
        return reply.code(409).send({ error: 'Alguém está finalizando este presente agora. Tente de novo em alguns minutos.' })
      }

      const publicId = randomBytes(12).toString('base64url')
      const { lastInsertRowid } = db
        .prepare(
          `INSERT INTO payments (public_id, gift_id, gift_name, amount_cents, method, payer_name, payer_email)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(publicId, gift.id, gift.name, gift.priceCents, body.method, body.payerName.trim(), body.payerEmail.trim())
      const row = { id: Number(lastInsertRowid), giftId: gift.id }

      const common = {
        amountCents: gift.priceCents,
        description: `Presente de casamento: ${gift.name}`.slice(0, 120),
        payerName: body.payerName,
        payerEmail: body.payerEmail,
        reference: publicId,
        notificationUrl: notificationUrl(),
      }

      let mp: MpPayment
      try {
        mp = body.method === 'pix' ? await createPixPayment(common) : await createCardPayment({ ...common, card: body.card! })
      } catch (err) {
        db.prepare("UPDATE payments SET status = 'error', status_detail = ?, updated_at = datetime('now') WHERE id = ?").run(
          String((err as Error).message).slice(0, 300),
          row.id,
        )
        req.log.error({ err }, 'mercadopago: falha ao criar pagamento')
        const status = err instanceof MpError && err.status < 500 ? 400 : 502
        return reply.code(status).send({ error: 'Não foi possível iniciar o pagamento. Confira os dados ou tente com PIX.' })
      }

      applyStatus(row, mp)
      const pix = mp.point_of_interaction?.transaction_data
      return {
        id: publicId,
        status: mp.status,
        message: mp.status === 'rejected' ? friendlyRejection(mp.status_detail) : null,
        pix:
          body.method === 'pix' && pix?.qr_code
            ? { qrCode: pix.qr_code, qrCodeBase64: pix.qr_code_base64, expiresAt: mp.date_of_expiration ?? null }
            : null,
      }
    },
  )

  // Consulta do convidado (polling do PIX). Se o webhook atrasar, confere direto no MP.
  app.get<{ Params: { id: string } }>('/pagamentos/:id', async (req, reply) => {
    let row = db.prepare(`${SELECT} WHERE public_id = ?`).get(req.params.id) as PaymentRow | undefined
    if (!row) return reply.code(404).send({ error: 'Pagamento não encontrado.' })
    const stale = Date.now() - new Date(row.updatedAt.replace(' ', 'T') + 'Z').getTime() > 8_000
    if (row.providerId && ['pending', 'in_process'].includes(row.status) && stale) {
      try {
        await refreshFromProvider(row.providerId)
        row = db.prepare(`${SELECT} WHERE id = ?`).get(row.id) as PaymentRow
      } catch (err) {
        req.log.warn({ err }, 'mercadopago: falha ao atualizar status')
      }
    }
    return { status: row.status, giftName: row.giftName, amountCents: row.amountCents }
  })

  app.post<{ Params: { id: string }; Body: { message: string } }>(
    '/pagamentos/:id/recado',
    {
      config: { rateLimit: { max: 5, timeWindow: '5 minutes' } },
      schema: {
        body: {
          type: 'object',
          required: ['message'],
          properties: { message: { type: 'string', minLength: 1, maxLength: 1000 } },
        },
      },
    },
    async (req, reply) => {
      const result = db
        .prepare("UPDATE payments SET message = ?, updated_at = datetime('now') WHERE public_id = ? AND message IS NULL")
        .run(req.body.message.trim(), req.params.id)
      if (result.changes === 0) return reply.code(409).send({ error: 'Este recado já foi enviado.' })
      const p = db.prepare('SELECT gift_name AS gift, payer_name AS name FROM payments WHERE public_id = ?').get(req.params.id) as {
        gift: string
        name: string
      }
      notify(`💌 Recado de ${p.name}`, `${p.name} deixou um recado`, [['Junto com', p.gift]], req.body.message.trim())
      return { ok: true }
    },
  )

  // Aviso do Mercado Pago. Nunca confiamos no corpo: o status é buscado na API.
  app.post<{ Body: { type?: string; action?: string; data?: { id?: string | number } } }>(
    '/pagamentos/webhook',
    async (req, reply) => {
      const query = req.query as Record<string, string>
      const providerId = String(req.body?.data?.id ?? query['data.id'] ?? query.id ?? '')
      const type = req.body?.type ?? query.type ?? query.topic
      if (type !== 'payment' || !/^\d+$/.test(providerId)) return reply.code(200).send({ ignored: true })
      if (config.mpWebhookSecret && !validSignature(req, providerId)) return reply.code(401).send({ error: 'assinatura inválida' })
      try {
        const mp = await refreshFromProvider(providerId)
        req.log.info({ providerId, status: mp.status }, 'mercadopago: webhook')
      } catch (err) {
        // Pagamento inexistente para esta conta: responde 200 para o MP não repetir o aviso.
        if (err instanceof MpError && err.status === 404) return reply.code(200).send({ ignored: true })
        req.log.error({ err, providerId }, 'mercadopago: falha no webhook')
        return reply.code(500).send({ error: 'falha ao consultar pagamento' })
      }
      return { ok: true }
    },
  )

  app.get('/admin/pagamentos', { preHandler: requireAdmin }, async () => ({
    payments: db
      .prepare(
        `SELECT public_id AS id, gift_name AS giftName, amount_cents AS amountCents, method, payer_name AS payerName,
                payer_email AS payerEmail, status, message, created_at AS createdAt, approved_at AS approvedAt
         FROM payments WHERE status NOT IN ('creating', 'error') ORDER BY id DESC LIMIT 500`,
      )
      .all(),
  }))
}

// x-signature: "ts=...,v1=..." — HMAC-SHA256 de "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
function validSignature(req: FastifyRequest, providerId: string): boolean {
  const header = String(req.headers['x-signature'] ?? '')
  const parts = Object.fromEntries(header.split(',').map(p => p.trim().split('=') as [string, string]))
  if (!parts.ts || !parts.v1) return false
  const manifest = `id:${providerId};request-id:${req.headers['x-request-id'] ?? ''};ts:${parts.ts};`
  const expected = createHmac('sha256', config.mpWebhookSecret).update(manifest).digest()
  const given = Buffer.from(parts.v1, 'hex')
  return given.length === expected.length && timingSafeEqual(given, expected)
}

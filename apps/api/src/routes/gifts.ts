import type { FastifyInstance } from 'fastify'
import { requireAdmin } from '../auth.ts'
import { db } from '../db.ts'
import { assertUnlocked } from './public.ts'
import { imageUrl, removeUpload } from './uploads.ts'

// Duas listas com a mesma estrutura; cada uma pertence a uma página bloqueável.
const LISTS = { casamento: 'presentes', cha: 'cha-de-panela' } as const
type List = keyof typeof LISTS
const isList = (v: string): v is List => v in LISTS

type GiftRow = {
  id: number
  name: string
  description: string
  image: string | null
  priceCents: number | null
  status: 'disponivel' | 'reservado' | 'presenteado'
  purchaseMode: 'site' | 'link'
  externalUrl: string | null
}

const listGifts = (list: List) =>
  (
    db
      .prepare(
        `SELECT id, name, description, image, price_cents AS priceCents, status,
                purchase_mode AS purchaseMode, external_url AS externalUrl
         FROM gifts WHERE list = ? ORDER BY position`,
      )
      .all(list) as GiftRow[]
  ).map(g => ({ ...g, imageUrl: imageUrl(g.image) }))

const pageText = (list: List) =>
  db.prepare('SELECT title, heading, intro FROM pages WHERE slug = ?').get(LISTS[list]) as {
    title: string
    heading: string | null
    intro: string | null
  }

const giftBody = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 120 },
    description: { type: 'string', maxLength: 600 },
    image: { type: ['string', 'null'], pattern: '^[a-f0-9]{32}\\.(webp|jpg|png)$' },
    priceCents: { type: ['integer', 'null'], minimum: 1, maximum: 100_000_000 },
    status: { type: 'string', enum: ['disponivel', 'reservado', 'presenteado'] },
    purchaseMode: { type: 'string', enum: ['site', 'link'] },
    externalUrl: { type: ['string', 'null'], maxLength: 500, pattern: '^https?://' },
  },
}

type GiftInput = Partial<Omit<GiftRow, 'id'>>

export async function giftRoutes(app: FastifyInstance) {
  // Público: só entrega a lista se a página estiver liberada.
  app.get<{ Params: { list: string } }>('/listas/:list', async (req, reply) => {
    const { list } = req.params
    if (!isList(list)) return reply.code(404).send({ error: 'Lista não encontrada.' })
    if (!assertUnlocked(LISTS[list], req, reply)) return reply
    return { page: pageText(list), gifts: listGifts(list) }
  })

  app.register(async admin => {
    admin.addHook('preHandler', requireAdmin)

    admin.get<{ Params: { list: string } }>('/admin/listas/:list', async (req, reply) => {
      const { list } = req.params
      if (!isList(list)) return reply.code(404).send({ error: 'Lista não encontrada.' })
      return { page: pageText(list), gifts: listGifts(list) }
    })

    admin.post<{ Params: { list: string }; Body: GiftInput }>(
      '/admin/listas/:list/presentes',
      { schema: { body: { ...giftBody, required: ['name'] } } },
      async (req, reply) => {
        const { list } = req.params
        if (!isList(list)) return reply.code(404).send({ error: 'Lista não encontrada.' })
        const g = req.body
        db.prepare(
          `INSERT INTO gifts (list, position, name, description, image, price_cents, status, purchase_mode, external_url)
           VALUES (?, (SELECT COALESCE(MAX(position), 0) + 1 FROM gifts WHERE list = ?), ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          list,
          list,
          g.name!.trim(),
          (g.description ?? '').trim(),
          g.image ?? null,
          g.priceCents ?? null,
          g.status ?? 'disponivel',
          g.purchaseMode ?? 'site',
          g.externalUrl ?? null,
        )
        return reply.code(201).send({ gifts: listGifts(list) })
      },
    )

    admin.patch<{ Params: { id: string }; Body: GiftInput }>(
      '/admin/presentes/:id',
      { schema: { body: giftBody } },
      async (req, reply) => {
        const id = Number(req.params.id)
        const current = db.prepare('SELECT list, image FROM gifts WHERE id = ?').get(id) as
          | { list: List; image: string | null }
          | undefined
        if (!current) return reply.code(404).send({ error: 'Presente não encontrado.' })

        // Campos ausentes ficam como estão; null explícito limpa o campo.
        const columns: Record<keyof GiftInput, string> = {
          name: 'name',
          description: 'description',
          image: 'image',
          priceCents: 'price_cents',
          status: 'status',
          purchaseMode: 'purchase_mode',
          externalUrl: 'external_url',
        }
        const entries = Object.entries(req.body).filter(([k]) => k in columns) as [keyof GiftInput, unknown][]
        if (entries.length) {
          const sets = entries.map(([k]) => `${columns[k]} = ?`).join(', ')
          const values = entries.map(([, v]) => (typeof v === 'string' ? v.trim() : v)) as (string | number | null)[]
          db.prepare(`UPDATE gifts SET ${sets} WHERE id = ?`).run(...values, id)
        }
        if ('image' in req.body && req.body.image !== current.image) await removeUpload(current.image)
        return { gifts: listGifts(current.list) }
      },
    )

    admin.post<{ Params: { id: string }; Body: { direction: 'up' | 'down' } }>(
      '/admin/presentes/:id/mover',
      {
        schema: {
          body: { type: 'object', required: ['direction'], properties: { direction: { type: 'string', enum: ['up', 'down'] } } },
        },
      },
      async (req, reply) => {
        const current = db.prepare('SELECT id, list, position FROM gifts WHERE id = ?').get(Number(req.params.id)) as
          | { id: number; list: List; position: number }
          | undefined
        if (!current) return reply.code(404).send({ error: 'Presente não encontrado.' })
        const neighbor = db
          .prepare(
            req.body.direction === 'up'
              ? 'SELECT id, position FROM gifts WHERE list = ? AND position < ? ORDER BY position DESC LIMIT 1'
              : 'SELECT id, position FROM gifts WHERE list = ? AND position > ? ORDER BY position ASC LIMIT 1',
          )
          .get(current.list, current.position) as { id: number; position: number } | undefined
        if (neighbor) {
          db.exec('BEGIN')
          db.prepare('UPDATE gifts SET position = ? WHERE id = ?').run(neighbor.position, current.id)
          db.prepare('UPDATE gifts SET position = ? WHERE id = ?').run(current.position, neighbor.id)
          db.exec('COMMIT')
        }
        return { gifts: listGifts(current.list) }
      },
    )

    admin.delete<{ Params: { id: string } }>('/admin/presentes/:id', async (req, reply) => {
      const current = db.prepare('SELECT list, image FROM gifts WHERE id = ?').get(Number(req.params.id)) as
        | { list: List; image: string | null }
        | undefined
      if (!current) return reply.code(404).send({ error: 'Presente não encontrado.' })
      db.prepare('DELETE FROM gifts WHERE id = ?').run(Number(req.params.id))
      await removeUpload(current.image)
      return { gifts: listGifts(current.list) }
    })
  })
}

import type { FastifyInstance } from 'fastify'
import { requireAdmin } from '../auth.ts'
import { db } from '../db.ts'
import { assertUnlocked } from './public.ts'
import { imageUrl, removeUpload } from './uploads.ts'
import { notify } from '../notify.ts'

// Duas listas com a mesma estrutura; cada uma pertence a uma página bloqueável.
const LISTS = { casamento: 'presentes', cha: 'cha-de-panela' } as const
type List = keyof typeof LISTS
const isList = (v: string): v is List => v in LISTS

type Mode = 'site' | 'link' | 'reserva'
type GiftRow = {
  id: number
  name: string
  description: string
  image: string | null
  priceCents: number | null
  status: 'disponivel' | 'reservado' | 'presenteado'
  purchaseMode: Mode
  externalUrl: string | null
  roomId: number | null
  reservedBy: string | null
  reservedContact: string | null
  reservedAt: string | null
}

/** Quem reservou só aparece para os noivos. */
const listGifts = (list: List, forAdmin = false) =>
  (
    db
      .prepare(
        `SELECT id, name, description, image, price_cents AS priceCents, status,
                purchase_mode AS purchaseMode, external_url AS externalUrl, room_id AS roomId,
                reserved_by AS reservedBy, reserved_contact AS reservedContact, reserved_at AS reservedAt
         FROM gifts WHERE list = ? ORDER BY position`,
      )
      .all(list) as GiftRow[]
  ).map(({ reservedBy, reservedContact, reservedAt, ...g }) => ({
    ...g,
    imageUrl: imageUrl(g.image),
    // Item de reserva: o link da loja só é entregue depois que a pessoa reserva
    // (senão dava para comprar sem reservar e o casal ganhava repetido).
    ...(g.purchaseMode === 'reserva' && !forAdmin ? { externalUrl: null, hasLink: Boolean(g.externalUrl) } : {}),
    ...(forAdmin ? { reservedBy, reservedContact, reservedAt } : {}),
  }))

const listRooms = (list: List) =>
  db.prepare('SELECT id, name FROM gift_rooms WHERE list = ? ORDER BY position').all(list) as { id: number; name: string }[]

const pageText = (list: List) =>
  db.prepare('SELECT title, heading, intro FROM pages WHERE slug = ?').get(LISTS[list]) as {
    title: string
    heading: string | null
    intro: string | null
  }

/* ── Dados do evento do chá (data, horário, local, endereço) ─────────── */
const EVENT_KEYS = { date: 'cha.date', time: 'cha.time', venue: 'cha.venue', address: 'cha.address' } as const
const readEvent = () => {
  const get = db.prepare('SELECT value FROM settings WHERE key = ?')
  return Object.fromEntries(
    Object.entries(EVENT_KEYS).map(([k, key]) => [k, (get.get(key) as { value: string } | undefined)?.value ?? '']),
  ) as Record<keyof typeof EVENT_KEYS, string>
}

const listData = (list: List, forAdmin = false) => ({
  page: pageText(list),
  gifts: listGifts(list, forAdmin),
  rooms: listRooms(list),
  ...(list === 'cha' ? { event: readEvent() } : {}),
})

const giftBody = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 120 },
    description: { type: 'string', maxLength: 600 },
    image: { type: ['string', 'null'], pattern: '^[a-f0-9]{32}\\.(webp|jpg|png)$' },
    priceCents: { type: ['integer', 'null'], minimum: 1, maximum: 100_000_000 },
    status: { type: 'string', enum: ['disponivel', 'reservado', 'presenteado'] },
    purchaseMode: { type: 'string', enum: ['site', 'link', 'reserva'] },
    externalUrl: { type: ['string', 'null'], maxLength: 500, pattern: '^https?://' },
    roomId: { type: ['integer', 'null'], minimum: 1 },
  },
}

type GiftInput = Partial<Omit<GiftRow, 'id' | 'reservedBy' | 'reservedContact' | 'reservedAt'>>

const COLUMNS: Record<keyof GiftInput, string> = {
  name: 'name',
  description: 'description',
  image: 'image',
  priceCents: 'price_cents',
  status: 'status',
  purchaseMode: 'purchase_mode',
  externalUrl: 'external_url',
  roomId: 'room_id',
}

const defaultMode = (list: List): Mode => (list === 'cha' ? 'reserva' : 'site')

/** Cômodo precisa existir e ser da mesma lista. */
const roomBelongs = (roomId: number | null | undefined, list: List) =>
  roomId == null || Boolean(db.prepare('SELECT 1 FROM gift_rooms WHERE id = ? AND list = ?').get(roomId, list))

export async function giftRoutes(app: FastifyInstance) {
  // Público: só entrega a lista se a página estiver liberada.
  app.get<{ Params: { list: string } }>('/listas/:list', async (req, reply) => {
    const { list } = req.params
    if (!isList(list)) return reply.code(404).send({ error: 'Lista não encontrada.' })
    if (!assertUnlocked(LISTS[list], req, reply)) return reply
    return listData(list)
  })

  // "Eu vou levar": reserva o item com o nome de quem vai levar.
  app.post<{ Params: { id: string }; Body: { name: string; contact?: string } }>(
    '/listas/presentes/:id/reservar',
    {
      config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
      schema: {
        body: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', minLength: 2, maxLength: 80 },
            contact: { type: 'string', maxLength: 80 },
          },
        },
      },
    },
    async (req, reply) => {
      const gift = db
        .prepare('SELECT id, list, purchase_mode AS mode, external_url AS url FROM gifts WHERE id = ?')
        .get(Number(req.params.id)) as { id: number; list: List; mode: Mode; url: string | null } | undefined
      if (!gift) return reply.code(404).send({ error: 'Item não encontrado.' })
      if (!assertUnlocked(LISTS[gift.list], req, reply)) return reply
      if (gift.mode !== 'reserva') return reply.code(409).send({ error: 'Este item não é reservado pelo site.' })
      // Só reserva se ainda estiver livre (evita duas pessoas levando o mesmo).
      const r = db
        .prepare(
          `UPDATE gifts SET status = 'reservado', reserved_by = ?, reserved_contact = ?, reserved_at = datetime('now')
           WHERE id = ? AND status = 'disponivel'`,
        )
        .run(req.body.name.trim(), (req.body.contact ?? '').trim() || null, gift.id)
      if (r.changes === 0) return reply.code(409).send({ error: 'Alguém acabou de reservar este item. Escolha outro?' })
      const info = db
        .prepare('SELECT g.name, r.name AS room FROM gifts g LEFT JOIN gift_rooms r ON r.id = g.room_id WHERE g.id = ?')
        .get(gift.id) as { name: string; room: string | null }
      notify(`🧺 ${req.body.name.trim()} vai levar: ${info.name}`, `${req.body.name.trim()} reservou um item`, [
        ['Item', info.name],
        ['Cômodo', info.room],
        ['Lista', gift.list === 'cha' ? 'Chá de Panela' : 'Casamento'],
        ['Contato', (req.body.contact ?? '').trim() || null],
      ])
      return { ok: true, url: gift.url }
    },
  )

  app.register(async admin => {
    admin.addHook('preHandler', requireAdmin)

    admin.get<{ Params: { list: string } }>('/admin/listas/:list', async (req, reply) => {
      const { list } = req.params
      if (!isList(list)) return reply.code(404).send({ error: 'Lista não encontrada.' })
      return listData(list, true)
    })

    admin.post<{ Params: { list: string }; Body: GiftInput }>(
      '/admin/listas/:list/presentes',
      { schema: { body: { ...giftBody, required: ['name'] } } },
      async (req, reply) => {
        const { list } = req.params
        if (!isList(list)) return reply.code(404).send({ error: 'Lista não encontrada.' })
        const g = req.body
        if (!roomBelongs(g.roomId, list)) return reply.code(400).send({ error: 'Cômodo inválido.' })
        db.prepare(
          `INSERT INTO gifts (list, position, name, description, image, price_cents, status, purchase_mode, external_url, room_id)
           VALUES (?, (SELECT COALESCE(MAX(position), 0) + 1 FROM gifts WHERE list = ?), ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          list,
          list,
          g.name!.trim(),
          (g.description ?? '').trim(),
          g.image ?? null,
          g.priceCents ?? null,
          g.status ?? 'disponivel',
          g.purchaseMode ?? defaultMode(list),
          g.externalUrl ?? null,
          g.roomId ?? null,
        )
        return reply.code(201).send(listData(list, true))
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
        if ('roomId' in req.body && !roomBelongs(req.body.roomId, current.list)) {
          return reply.code(400).send({ error: 'Cômodo inválido.' })
        }

        // Campos ausentes ficam como estão; null explícito limpa o campo.
        const entries = Object.entries(req.body).filter(([k]) => k in COLUMNS) as [keyof GiftInput, unknown][]
        if (entries.length) {
          const sets = entries.map(([k]) => `${COLUMNS[k]} = ?`).join(', ')
          const values = entries.map(([, v]) => (typeof v === 'string' ? v.trim() : v)) as (string | number | null)[]
          db.prepare(`UPDATE gifts SET ${sets} WHERE id = ?`).run(...values, id)
        }
        // Voltou a ficar disponível: esquece quem tinha reservado.
        if (req.body.status === 'disponivel') {
          db.prepare('UPDATE gifts SET reserved_by = NULL, reserved_contact = NULL, reserved_at = NULL WHERE id = ?').run(id)
        }
        if ('image' in req.body && req.body.image !== current.image) await removeUpload(current.image)
        return listData(current.list, true)
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
        return listData(current.list, true)
      },
    )

    admin.delete<{ Params: { id: string } }>('/admin/presentes/:id', async (req, reply) => {
      const current = db.prepare('SELECT list, image FROM gifts WHERE id = ?').get(Number(req.params.id)) as
        | { list: List; image: string | null }
        | undefined
      if (!current) return reply.code(404).send({ error: 'Presente não encontrado.' })
      db.prepare('DELETE FROM gifts WHERE id = ?').run(Number(req.params.id))
      await removeUpload(current.image)
      return listData(current.list, true)
    })

    /* ── Cômodos ───────────────────────────────────────────────────── */
    const roomName = { type: 'object', required: ['name'], properties: { name: { type: 'string', minLength: 1, maxLength: 40 } } }

    admin.post<{ Params: { list: string }; Body: { name: string } }>(
      '/admin/listas/:list/comodos',
      { schema: { body: roomName } },
      async (req, reply) => {
        const { list } = req.params
        if (!isList(list)) return reply.code(404).send({ error: 'Lista não encontrada.' })
        db.prepare(
          `INSERT INTO gift_rooms (list, position, name)
           VALUES (?, (SELECT COALESCE(MAX(position), 0) + 1 FROM gift_rooms WHERE list = ?), ?)`,
        ).run(list, list, req.body.name.trim())
        return reply.code(201).send(listData(list, true))
      },
    )

    admin.patch<{ Params: { id: string }; Body: { name: string } }>(
      '/admin/comodos/:id',
      { schema: { body: roomName } },
      async (req, reply) => {
        const room = db.prepare('SELECT list FROM gift_rooms WHERE id = ?').get(Number(req.params.id)) as { list: List } | undefined
        if (!room) return reply.code(404).send({ error: 'Cômodo não encontrado.' })
        db.prepare('UPDATE gift_rooms SET name = ? WHERE id = ?').run(req.body.name.trim(), Number(req.params.id))
        return listData(room.list, true)
      },
    )

    admin.post<{ Params: { id: string }; Body: { direction: 'up' | 'down' } }>(
      '/admin/comodos/:id/mover',
      {
        schema: {
          body: { type: 'object', required: ['direction'], properties: { direction: { type: 'string', enum: ['up', 'down'] } } },
        },
      },
      async (req, reply) => {
        const cur = db.prepare('SELECT id, list, position FROM gift_rooms WHERE id = ?').get(Number(req.params.id)) as
          | { id: number; list: List; position: number }
          | undefined
        if (!cur) return reply.code(404).send({ error: 'Cômodo não encontrado.' })
        const other = db
          .prepare(
            req.body.direction === 'up'
              ? 'SELECT id, position FROM gift_rooms WHERE list = ? AND position < ? ORDER BY position DESC LIMIT 1'
              : 'SELECT id, position FROM gift_rooms WHERE list = ? AND position > ? ORDER BY position ASC LIMIT 1',
          )
          .get(cur.list, cur.position) as { id: number; position: number } | undefined
        if (other) {
          db.exec('BEGIN')
          db.prepare('UPDATE gift_rooms SET position = ? WHERE id = ?').run(other.position, cur.id)
          db.prepare('UPDATE gift_rooms SET position = ? WHERE id = ?').run(cur.position, other.id)
          db.exec('COMMIT')
        }
        return listData(cur.list, true)
      },
    )

    // Apagar o cômodo não apaga os itens: eles ficam em "Outros".
    admin.delete<{ Params: { id: string } }>('/admin/comodos/:id', async (req, reply) => {
      const room = db.prepare('SELECT list FROM gift_rooms WHERE id = ?').get(Number(req.params.id)) as { list: List } | undefined
      if (!room) return reply.code(404).send({ error: 'Cômodo não encontrado.' })
      db.prepare('DELETE FROM gift_rooms WHERE id = ?').run(Number(req.params.id))
      return listData(room.list, true)
    })

    /* ── Importar uma lista colada (cômodo + itens) ──────────────────── */
    admin.post<{ Params: { list: string }; Body: { items: { room: string; name: string; description?: string; priceCents?: number | null }[] } }>(
      '/admin/listas/:list/importar',
      {
        bodyLimit: 512 * 1024,
        schema: {
          body: {
            type: 'object',
            required: ['items'],
            properties: {
              items: {
                type: 'array',
                minItems: 1,
                maxItems: 500,
                items: {
                  type: 'object',
                  required: ['room', 'name'],
                  properties: {
                    room: { type: 'string', maxLength: 40 },
                    name: { type: 'string', minLength: 1, maxLength: 120 },
                    description: { type: 'string', maxLength: 600 },
                    priceCents: { type: ['integer', 'null'], minimum: 1, maximum: 100_000_000 },
                  },
                },
              },
            },
          },
        },
      },
      async (req, reply) => {
        const { list } = req.params
        if (!isList(list)) return reply.code(404).send({ error: 'Lista não encontrada.' })
        const findRoom = db.prepare('SELECT id FROM gift_rooms WHERE list = ? AND lower(name) = lower(?)')
        const addRoom = db.prepare(
          `INSERT INTO gift_rooms (list, position, name)
           VALUES (?, (SELECT COALESCE(MAX(position), 0) + 1 FROM gift_rooms WHERE list = ?), ?)`,
        )
        const exists = db.prepare('SELECT 1 FROM gifts WHERE list = ? AND lower(name) = lower(?)')
        const addGift = db.prepare(
          `INSERT INTO gifts (list, position, name, description, price_cents, purchase_mode, room_id)
           VALUES (?, (SELECT COALESCE(MAX(position), 0) + 1 FROM gifts WHERE list = ?), ?, ?, ?, ?, ?)`,
        )
        let added = 0
        let skipped = 0
        db.exec('BEGIN')
        try {
          for (const item of req.body.items) {
            const roomLabel = item.room.trim()
            let roomId: number | null = null
            if (roomLabel) {
              const found = findRoom.get(list, roomLabel) as { id: number } | undefined
              roomId = found ? found.id : Number(addRoom.run(list, list, roomLabel).lastInsertRowid)
            }
            // Não duplica um item que já está na lista (pode colar de novo sem medo).
            if (exists.get(list, item.name.trim())) {
              skipped++
              continue
            }
            addGift.run(list, list, item.name.trim(), (item.description ?? '').trim(), item.priceCents ?? null, defaultMode(list), roomId)
            added++
          }
          db.exec('COMMIT')
        } catch (err) {
          db.exec('ROLLBACK')
          throw err
        }
        return { added, skipped, ...listData(list, true) }
      },
    )

    admin.patch<{ Body: Partial<Record<keyof typeof EVENT_KEYS, string>> }>(
      '/admin/cha-evento',
      {
        schema: {
          body: {
            type: 'object',
            additionalProperties: false,
            properties: Object.fromEntries(Object.keys(EVENT_KEYS).map(k => [k, { type: 'string', maxLength: 200 }])),
          },
        },
      },
      async req => {
        const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        for (const [k, v] of Object.entries(req.body)) upsert.run(EVENT_KEYS[k as keyof typeof EVENT_KEYS], (v ?? '').trim())
        return { event: readEvent() }
      },
    )
  })
}

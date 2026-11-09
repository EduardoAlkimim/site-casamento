import type { FastifyInstance } from 'fastify'
import { requireAdmin } from '../auth.ts'
import { db } from '../db.ts'
import { notify } from '../notify.ts'
import { readEvent } from './gifts.ts'

// Convite do Chá de Panela (/cha): página pública com os dados do chá,
// confirmação de presença e textos que os noivos editam no painel.
// Data, horário, local e endereço são os mesmos da página da lista do chá.

const TEXT_KEYS = {
  intro: 'convite.intro',
  letter: 'convite.letter',
  mapsUrl: 'convite.mapsUrl',
  homeText: 'convite.homeText',
  homeUrl: 'convite.homeUrl',
  rsvpNote: 'convite.rsvpNote',
  verse: 'convite.verse',
  verseRef: 'convite.verseRef',
  closing: 'convite.closing',
} as const
type TextKey = keyof typeof TEXT_KEYS

const readTexts = () => {
  const get = db.prepare('SELECT value FROM settings WHERE key = ?')
  return Object.fromEntries(
    Object.entries(TEXT_KEYS).map(([k, key]) => [k, (get.get(key) as { value: string } | undefined)?.value ?? '']),
  ) as Record<TextKey, string>
}

type Rsvp = { id: number; name: string; attending: boolean; people: number; phone: string | null; message: string | null; createdAt: string }

const listRsvps = () =>
  (
    db
      .prepare('SELECT id, name, attending, people, phone, message, created_at AS createdAt FROM cha_rsvp ORDER BY id DESC')
      .all() as (Omit<Rsvp, 'attending'> & { attending: number })[]
  ).map(r => ({ ...r, attending: Boolean(r.attending) }))

const adminData = () => {
  const rsvps = listRsvps()
  const yes = rsvps.filter(r => r.attending)
  return {
    texts: readTexts(),
    event: readEvent(),
    rsvps,
    totals: { confirmed: yes.length, people: yes.reduce((n, r) => n + r.people, 0), declined: rsvps.length - yes.length },
  }
}

const url = { type: 'string', maxLength: 500, pattern: '^(https?://\\S+)?$' }

export async function conviteRoutes(app: FastifyInstance) {
  app.get('/convite', async () => ({ texts: readTexts(), event: readEvent() }))

  app.post<{ Body: { name: string; attending: boolean; people?: number; phone?: string; message?: string; website?: string } }>(
    '/convite/presenca',
    {
      config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
      schema: {
        body: {
          type: 'object',
          required: ['name', 'attending'],
          additionalProperties: false,
          properties: {
            name: { type: 'string', minLength: 2, maxLength: 120 },
            attending: { type: 'boolean' },
            people: { type: 'integer', minimum: 1, maximum: 20 },
            phone: { type: 'string', maxLength: 30 },
            message: { type: 'string', maxLength: 600 },
            // Campo invisível: robôs preenchem, pessoas não.
            website: { type: 'string', maxLength: 200 },
          },
        },
      },
    },
    async (req, reply) => {
      if (req.body.website) return reply.code(201).send({ ok: true })
      const name = req.body.name.trim()
      const people = req.body.attending ? (req.body.people ?? 1) : 0
      const phone = req.body.phone?.trim() || null
      const message = req.body.message?.trim() || null
      db.prepare('INSERT INTO cha_rsvp (name, attending, people, phone, message) VALUES (?, ?, ?, ?, ?)').run(
        name,
        req.body.attending ? 1 : 0,
        people,
        phone,
        message,
      )
      const { totals } = adminData()
      notify(
        req.body.attending ? `🥂 ${name} confirmou presença no chá` : `🙏 ${name} não vai ao chá`,
        req.body.attending ? `${name} vai ao chá!` : `${name} não vai conseguir ir`,
        [
          ['Quem', name],
          ['Pessoas', req.body.attending ? String(people) : null],
          ['Telefone', phone],
          ['Total até agora', `${totals.people} ${totals.people === 1 ? 'pessoa' : 'pessoas'} (${totals.confirmed} ${totals.confirmed === 1 ? 'confirmação' : 'confirmações'})`],
        ],
        message,
      )
      return reply.code(201).send({ ok: true })
    },
  )

  app.register(async admin => {
    admin.addHook('preHandler', requireAdmin)

    admin.get('/admin/convite', async () => adminData())

    admin.patch<{ Body: Partial<Record<TextKey, string>> }>(
      '/admin/convite',
      {
        schema: {
          body: {
            type: 'object',
            additionalProperties: false,
            properties: Object.fromEntries(
              Object.keys(TEXT_KEYS).map(k => [k, k.endsWith('Url') ? url : { type: 'string', maxLength: 1500 }]),
            ),
          },
        },
      },
      async req => {
        const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        for (const [k, v] of Object.entries(req.body)) upsert.run(TEXT_KEYS[k as TextKey], (v ?? '').trim())
        return adminData()
      },
    )

    admin.delete<{ Params: { id: string } }>('/admin/convite/presencas/:id', async (req, reply) => {
      const r = db.prepare('DELETE FROM cha_rsvp WHERE id = ?').run(Number(req.params.id))
      if (r.changes === 0) return reply.code(404).send({ error: 'Confirmação não encontrada.' })
      return adminData()
    })
  })
}

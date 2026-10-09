import type { FastifyInstance } from 'fastify'
import {
  endAdminSession,
  hashToken,
  newToken,
  padrinhoLink,
  requireAdmin,
  startAdminSession,
} from '../auth.ts'
import { config } from '../config.ts'
import { db } from '../db.ts'
import { verifyPassword } from '../password.ts'
import { listManualSections } from './public.ts'
import { removeUpload } from './uploads.ts'
import { listPages } from './public.ts'

const padrinhoBody = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: { type: 'string', minLength: 1, maxLength: 80 },
    role: { type: 'string', enum: ['padrinho', 'madrinha', 'casal'] },
    personalMessage: { type: 'string', maxLength: 1500 },
  },
}

type PadrinhoInput = { name?: string; role?: 'padrinho' | 'madrinha' | 'casal'; personalMessage?: string }

const listPadrinhos = () =>
  db
    .prepare(
      `SELECT id, name, role, personal_message AS personalMessage, created_at AS createdAt, last_seen_at AS lastSeenAt
       FROM padrinhos ORDER BY name COLLATE NOCASE`,
    )
    .all()

export async function adminRoutes(app: FastifyInstance) {
  app.post<{ Body: { password: string } }>(
    '/login',
    {
      // Limite do painel inteiro (não por endereço): impede adivinhar a senha
      // trocando de IP. Só os noivos entram, então 30 tentativas sobram.
      config: { rateLimit: { max: 30, timeWindow: '10 minutes', keyGenerator: () => 'admin-login' } },
      schema: {
        body: { type: 'object', required: ['password'], properties: { password: { type: 'string', maxLength: 200 } } },
      },
    },
    async (req, reply) => {
      if (!verifyPassword(req.body.password, config.adminPasswordHash)) {
        return reply.code(401).send({ error: 'Senha incorreta.' })
      }
      startAdminSession(reply)
      return { ok: true }
    },
  )

  app.post('/logout', async (_req, reply) => {
    endAdminSession(reply)
    return { ok: true }
  })

  // Tudo abaixo exige o casal logado.
  app.register(async protectedRoutes => {
    protectedRoutes.addHook('preHandler', requireAdmin)

    // Bloqueio e textos editáveis da página. Campo ausente não muda; null limpa.
    protectedRoutes.patch<{
      Params: { slug: string }
      Body: { locked?: boolean; lockMessage?: string | null; heading?: string | null; intro?: string | null }
    }>(
      '/pages/:slug',
      {
        schema: {
          body: {
            type: 'object',
            additionalProperties: false,
            properties: {
              locked: { type: 'boolean' },
              lockMessage: { type: ['string', 'null'], maxLength: 300 },
              heading: { type: ['string', 'null'], maxLength: 120 },
              intro: { type: ['string', 'null'], maxLength: 2000 },
            },
          },
        },
      },
      async (req, reply) => {
        const columns = { locked: 'locked', lockMessage: 'lock_message', heading: 'heading', intro: 'intro' } as const
        const entries = Object.entries(req.body) as [keyof typeof columns, unknown][]
        const exists = db.prepare('SELECT 1 FROM pages WHERE slug = ?').get(req.params.slug)
        if (!exists) return reply.code(404).send({ error: 'Página não encontrada.' })
        if (entries.length) {
          const sets = entries.map(([k]) => `${columns[k]} = ?`).join(', ')
          const values = entries.map(([, v]) =>
            typeof v === 'boolean' ? Number(v) : typeof v === 'string' ? v.trim() : (v as null),
          )
          db.prepare(`UPDATE pages SET ${sets} WHERE slug = ?`).run(...values, req.params.slug)
        }
        return { pages: listPages() }
      },
    )

    protectedRoutes.get('/padrinhos', async () => ({ padrinhos: listPadrinhos() }))

    protectedRoutes.post<{ Body: PadrinhoInput }>(
      '/padrinhos',
      { schema: { body: { ...padrinhoBody, required: ['name', 'role'] } } },
      async (req, reply) => {
        const token = newToken()
        const { name, role, personalMessage = '' } = req.body
        const { lastInsertRowid } = db
          .prepare('INSERT INTO padrinhos (name, role, personal_message, token_hash) VALUES (?, ?, ?, ?)')
          .run(name!.trim(), role!, personalMessage.trim(), hashToken(token))
        // O link só aparece agora: depois, apenas um novo link pode ser gerado.
        return reply.code(201).send({ id: Number(lastInsertRowid), link: padrinhoLink(token), padrinhos: listPadrinhos() })
      },
    )

    protectedRoutes.patch<{ Params: { id: string }; Body: PadrinhoInput }>(
      '/padrinhos/:id',
      { schema: { body: padrinhoBody } },
      async (req, reply) => {
        const { name, role, personalMessage } = req.body
        const result = db
          .prepare(
            `UPDATE padrinhos SET
               name = COALESCE(?, name), role = COALESCE(?, role), personal_message = COALESCE(?, personal_message)
             WHERE id = ?`,
          )
          .run(name?.trim() ?? null, role ?? null, personalMessage?.trim() ?? null, Number(req.params.id))
        if (result.changes === 0) return reply.code(404).send({ error: 'Padrinho não encontrado.' })
        return { padrinhos: listPadrinhos() }
      },
    )

    // Gera um link novo (ex.: tag perdida). O link antigo deixa de funcionar,
    // mas quem já entrou continua com acesso pelo cookie.
    protectedRoutes.post<{ Params: { id: string } }>('/padrinhos/:id/novo-link', async (req, reply) => {
      const token = newToken()
      const result = db.prepare('UPDATE padrinhos SET token_hash = ? WHERE id = ?').run(hashToken(token), Number(req.params.id))
      if (result.changes === 0) return reply.code(404).send({ error: 'Padrinho não encontrado.' })
      return { link: padrinhoLink(token) }
    })

    protectedRoutes.delete<{ Params: { id: string } }>('/padrinhos/:id', async (req, reply) => {
      const result = db.prepare('DELETE FROM padrinhos WHERE id = ?').run(Number(req.params.id))
      if (result.changes === 0) return reply.code(404).send({ error: 'Padrinho não encontrado.' })
      return { padrinhos: listPadrinhos() }
    })

    /* ── Manual dos padrinhos: texto editado pelos noivos ───────────── */
    const listManual = () => listManualSections()
    const sectionBody = {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string', minLength: 1, maxLength: 120 },
        body: { type: 'string', maxLength: 4000 },
        audience: { type: 'string', enum: ['todos', 'madrinha', 'padrinho'] },
        kind: { type: 'string', enum: ['texto', 'paleta', 'agenda', 'dicas'] },
        colors: { type: 'array', maxItems: 40, items: { type: 'string', pattern: '^#[0-9A-Fa-f]{6}$' } },
        image: { type: ['string', 'null'], pattern: '^[a-f0-9]{32}\\.(webp|jpg|png)$|^/(manual|fotos)/[a-z0-9._-]+$' },
      },
    }
    type SectionInput = {
      title?: string
      body?: string
      audience?: string
      kind?: string
      colors?: string[]
      image?: string | null
    }

    protectedRoutes.get('/manual', async () => ({ sections: listManual() }))

    protectedRoutes.post<{ Body: SectionInput }>(
      '/manual',
      { schema: { body: { ...sectionBody, required: ['title'] } } },
      async (req, reply) => {
        const b = req.body
        db.prepare(
          `INSERT INTO manual_sections (position, title, body, audience, kind, colors, image)
           VALUES ((SELECT COALESCE(MAX(position), 0) + 1 FROM manual_sections), ?, ?, ?, ?, ?, ?)`,
        ).run(
          b.title!.trim(),
          (b.body ?? '').trim(),
          b.audience ?? 'todos',
          b.kind ?? 'texto',
          b.colors ? JSON.stringify(b.colors) : null,
          b.image ?? null,
        )
        return reply.code(201).send({ sections: listManual() })
      },
    )

    protectedRoutes.patch<{ Params: { id: string }; Body: SectionInput }>(
      '/manual/:id',
      { schema: { body: sectionBody } },
      async (req, reply) => {
        const id = Number(req.params.id)
        const current = db.prepare('SELECT image FROM manual_sections WHERE id = ?').get(id) as { image: string | null } | undefined
        if (!current) return reply.code(404).send({ error: 'Seção não encontrada.' })
        const columns = { title: 'title', body: 'body', audience: 'audience', kind: 'kind', colors: 'colors', image: 'image' } as const
        const entries = Object.entries(req.body).filter(([k]) => k in columns) as [keyof typeof columns, unknown][]
        if (entries.length) {
          db.prepare(`UPDATE manual_sections SET ${entries.map(([k]) => `${columns[k]} = ?`).join(', ')} WHERE id = ?`).run(
            ...entries.map(([k, v]) => (k === 'colors' ? JSON.stringify(v) : typeof v === 'string' ? v.trim() : (v as null))),
            id,
          )
        }
        if ('image' in req.body && req.body.image !== current.image) await removeUpload(current.image)
        return { sections: listManual() }
      },
    )

    // Troca a posição com a seção vizinha (acima ou abaixo).
    protectedRoutes.post<{ Params: { id: string }; Body: { direction: 'up' | 'down' } }>(
      '/manual/:id/mover',
      {
        schema: {
          body: { type: 'object', required: ['direction'], properties: { direction: { type: 'string', enum: ['up', 'down'] } } },
        },
      },
      async req => {
        const current = db.prepare('SELECT id, position FROM manual_sections WHERE id = ?').get(Number(req.params.id)) as
          | { id: number; position: number }
          | undefined
        const neighbor = current
          ? (db
              .prepare(
                req.body.direction === 'up'
                  ? 'SELECT id, position FROM manual_sections WHERE position < ? ORDER BY position DESC LIMIT 1'
                  : 'SELECT id, position FROM manual_sections WHERE position > ? ORDER BY position ASC LIMIT 1',
              )
              .get(current.position) as { id: number; position: number } | undefined)
          : undefined
        if (current && neighbor) {
          db.exec('BEGIN')
          db.prepare('UPDATE manual_sections SET position = ? WHERE id = ?').run(neighbor.position, current.id)
          db.prepare('UPDATE manual_sections SET position = ? WHERE id = ?').run(current.position, neighbor.id)
          db.exec('COMMIT')
        }
        return { sections: listManual() }
      },
    )

    protectedRoutes.delete<{ Params: { id: string } }>('/manual/:id', async (req, reply) => {
      const result = db.prepare('DELETE FROM manual_sections WHERE id = ?').run(Number(req.params.id))
      if (result.changes === 0) return reply.code(404).send({ error: 'Seção não encontrada.' })
      return { sections: listManual() }
    })
  })
}

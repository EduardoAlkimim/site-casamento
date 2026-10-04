import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { currentPadrinho, hashToken, isAdmin, startPadrinhoSession, type Padrinho } from '../auth.ts'
import { db } from '../db.ts'

export type Page = {
  slug: string
  title: string
  locked: boolean
  lockMessage: string | null
  heading: string | null
  intro: string | null
}

export function listPages(): Page[] {
  const rows = db
    .prepare('SELECT slug, title, locked, lock_message AS lockMessage, heading, intro FROM pages ORDER BY position')
    .all() as (Omit<Page, 'locked'> & { locked: number })[]
  return rows.map(r => ({ ...r, locked: r.locked === 1 }))
}

/**
 * Guarda para as rotas de conteúdo (presentes, chá de panela…): enquanto a
 * página estiver bloqueada, só o casal (admin) recebe os dados.
 */
export function assertUnlocked(slug: string, req: FastifyRequest, reply: FastifyReply): boolean {
  const row = db.prepare('SELECT locked FROM pages WHERE slug = ?').get(slug) as { locked: number } | undefined
  if (row?.locked === 1 && !isAdmin(req)) {
    reply.code(423).send({ error: 'Esta página ainda não foi liberada.' })
    return false
  }
  return true
}

export async function publicRoutes(app: FastifyInstance) {
  app.get('/pages', async () => ({ pages: listPages() }))

  app.get('/me', async req => ({ padrinho: currentPadrinho(req), admin: isAdmin(req) }))

  // A tag NFC abre /p/<token> no site; o site troca o token por um cookie.
  app.post<{ Body: { token: string } }>(
    '/acesso/padrinho',
    {
      config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
      schema: {
        body: {
          type: 'object',
          required: ['token'],
          properties: { token: { type: 'string', minLength: 10, maxLength: 64 } },
        },
      },
    },
    async (req, reply) => {
      const row = db
        .prepare('SELECT id, name, role, personal_message AS personalMessage FROM padrinhos WHERE token_hash = ?')
        .get(hashToken(req.body.token)) as Padrinho | undefined
      if (!row) return reply.code(404).send({ error: 'Este convite não foi encontrado. Ele pode ter sido trocado.' })
      db.prepare("UPDATE padrinhos SET last_seen_at = datetime('now') WHERE id = ?").run(row.id)
      startPadrinhoSession(reply, row.id)
      return { padrinho: row }
    },
  )

  app.get('/padrinhos/manual', async (req, reply) => {
    const padrinho = currentPadrinho(req)
    if (!padrinho && !isAdmin(req)) return reply.code(403).send({ error: 'Página exclusiva dos padrinhos.' })
    const sections = db.prepare('SELECT id, title, body FROM manual_sections ORDER BY position').all()
    return { padrinho, sections }
  })
}

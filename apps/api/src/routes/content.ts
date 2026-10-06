import type { FastifyInstance } from 'fastify'
import { requireAdmin } from '../auth.ts'
import { db } from '../db.ts'
import { assertUnlocked } from './public.ts'
import { imageUrl, removeUpload } from './uploads.ts'

const pageText = (slug: string) =>
  db.prepare('SELECT title, heading, intro FROM pages WHERE slug = ?').get(slug) as {
    title: string
    heading: string | null
    intro: string | null
  }

/* ── Coleção ordenada editável (História e Informações) ──────────────── */
type Field = { column: string; schema: Record<string, unknown> }
type Collection = {
  table: string
  path: string
  fields: Record<string, Field>
  required: string[]
  /** Campo com imagem (upload): o arquivo antigo é apagado ao trocar. */
  imageField?: string
}

function collection(app: FastifyInstance, c: Collection) {
  const select = `SELECT id, ${Object.entries(c.fields)
    .map(([k, f]) => `${f.column} AS ${k}`)
    .join(', ')} FROM ${c.table} ORDER BY position`
  const list = () =>
    (db.prepare(select).all() as Record<string, unknown>[]).map(row =>
      c.imageField ? { ...row, imageUrl: imageUrl(row[c.imageField] as string | null) } : row,
    )
  const body = {
    type: 'object',
    additionalProperties: false,
    properties: Object.fromEntries(Object.entries(c.fields).map(([k, f]) => [k, f.schema])),
  }
  const imageColumn = c.imageField ? c.fields[c.imageField].column : null
  const notFound = { error: 'Item não encontrado.' }

  app.get(`/admin/${c.path}`, async () => ({ items: list() }))

  app.post<{ Body: Record<string, unknown> }>(
    `/admin/${c.path}`,
    { schema: { body: { ...body, required: c.required } } },
    async (req, reply) => {
      const keys = Object.keys(req.body)
      const cols = keys.map(k => c.fields[k].column)
      const values = keys.map(k => clean(req.body[k]))
      db.prepare(
        `INSERT INTO ${c.table} (position${cols.map(col => `, ${col}`).join('')})
         VALUES ((SELECT COALESCE(MAX(position), 0) + 1 FROM ${c.table})${cols.map(() => ', ?').join('')})`,
      ).run(...values)
      return reply.code(201).send({ items: list() })
    },
  )

  app.patch<{ Params: { id: string }; Body: Record<string, unknown> }>(
    `/admin/${c.path}/:id`,
    { schema: { body } },
    async (req, reply) => {
      const id = Number(req.params.id)
      const current = db.prepare(`SELECT * FROM ${c.table} WHERE id = ?`).get(id) as Record<string, unknown> | undefined
      if (!current) return reply.code(404).send(notFound)
      const keys = Object.keys(req.body)
      if (keys.length) {
        db.prepare(`UPDATE ${c.table} SET ${keys.map(k => `${c.fields[k].column} = ?`).join(', ')} WHERE id = ?`).run(
          ...keys.map(k => clean(req.body[k])),
          id,
        )
      }
      if (c.imageField && imageColumn && c.imageField in req.body && req.body[c.imageField] !== current[imageColumn]) {
        await removeUpload(current[imageColumn] as string | null)
      }
      return { items: list() }
    },
  )

  app.post<{ Params: { id: string }; Body: { direction: 'up' | 'down' } }>(
    `/admin/${c.path}/:id/mover`,
    {
      schema: {
        body: { type: 'object', required: ['direction'], properties: { direction: { type: 'string', enum: ['up', 'down'] } } },
      },
    },
    async (req, reply) => {
      const cur = db.prepare(`SELECT id, position FROM ${c.table} WHERE id = ?`).get(Number(req.params.id)) as
        | { id: number; position: number }
        | undefined
      if (!cur) return reply.code(404).send(notFound)
      const other = db
        .prepare(
          req.body.direction === 'up'
            ? `SELECT id, position FROM ${c.table} WHERE position < ? ORDER BY position DESC LIMIT 1`
            : `SELECT id, position FROM ${c.table} WHERE position > ? ORDER BY position ASC LIMIT 1`,
        )
        .get(cur.position) as { id: number; position: number } | undefined
      if (other) {
        db.exec('BEGIN')
        db.prepare(`UPDATE ${c.table} SET position = ? WHERE id = ?`).run(other.position, cur.id)
        db.prepare(`UPDATE ${c.table} SET position = ? WHERE id = ?`).run(cur.position, other.id)
        db.exec('COMMIT')
      }
      return { items: list() }
    },
  )

  app.delete<{ Params: { id: string } }>(`/admin/${c.path}/:id`, async (req, reply) => {
    const id = Number(req.params.id)
    const current = db.prepare(`SELECT * FROM ${c.table} WHERE id = ?`).get(id) as Record<string, unknown> | undefined
    if (!current) return reply.code(404).send(notFound)
    db.prepare(`DELETE FROM ${c.table} WHERE id = ?`).run(id)
    if (imageColumn) await removeUpload(current[imageColumn] as string | null)
    return { items: list() }
  })

  return list
}

const clean = (v: unknown) => (typeof v === 'string' ? v.trim() : (v as string | number | null))
const text = (max: number) => ({ type: 'string', maxLength: max })
const UPLOAD = { type: ['string', 'null'], pattern: '^[a-f0-9]{32}\\.(webp|jpg|png)$|^/fotos/[a-z0-9._-]+$' }

export async function contentRoutes(app: FastifyInstance) {
  let listStory: () => unknown[] = () => []
  let listInfo: () => unknown[] = () => []

  app.register(async admin => {
    admin.addHook('preHandler', requireAdmin)

    listStory = collection(admin, {
      table: 'story_moments',
      path: 'historia',
      required: ['title'],
      imageField: 'image',
      fields: {
        dateLabel: { column: 'date_label', schema: text(60) },
        title: { column: 'title', schema: { type: 'string', minLength: 1, maxLength: 120 } },
        body: { column: 'body', schema: text(2000) },
        image: { column: 'image', schema: UPLOAD },
      },
    })

    listInfo = collection(admin, {
      table: 'info_blocks',
      path: 'informacoes',
      required: ['title', 'kind'],
      fields: {
        kind: { column: 'kind', schema: { type: 'string', enum: ['destaque', 'faq'] } },
        title: { column: 'title', schema: { type: 'string', minLength: 1, maxLength: 160 } },
        subtitle: { column: 'subtitle', schema: text(120) },
        body: { column: 'body', schema: text(3000) },
        address: { column: 'address', schema: text(240) },
        mapUrl: { column: 'map_url', schema: { type: ['string', 'null'], maxLength: 600, pattern: '^(https://.*)?$' } },
      },
    })

    /* Recados: moderação */
    admin.get('/admin/recados', async () => ({
      messages: db
        .prepare(
          `SELECT id, author_name AS name, body, status, created_at AS createdAt FROM messages
           ORDER BY CASE status WHEN 'pendente' THEN 0 ELSE 1 END, id DESC`,
        )
        .all(),
    }))

    admin.patch<{ Params: { id: string }; Body: { status: 'aprovado' | 'oculto' | 'pendente' } }>(
      '/admin/recados/:id',
      {
        schema: {
          body: {
            type: 'object',
            required: ['status'],
            properties: { status: { type: 'string', enum: ['aprovado', 'oculto', 'pendente'] } },
          },
        },
      },
      async (req, reply) => {
        const r = db.prepare('UPDATE messages SET status = ? WHERE id = ?').run(req.body.status, Number(req.params.id))
        if (r.changes === 0) return reply.code(404).send({ error: 'Recado não encontrado.' })
        return { ok: true }
      },
    )

    admin.delete<{ Params: { id: string } }>('/admin/recados/:id', async (req, reply) => {
      const r = db.prepare('DELETE FROM messages WHERE id = ?').run(Number(req.params.id))
      if (r.changes === 0) return reply.code(404).send({ error: 'Recado não encontrado.' })
      return { ok: true }
    })
  })

  /* ── Textos soltos do site (página inicial) ──────────────────────── */
  const SITE_KEYS = {
    phrase: 'home.phrase',
    dayTitle: 'home.dayTitle',
    dayTitleEm: 'home.dayTitleEm',
    ceremonyTime: 'home.ceremonyTime',
    venue: 'home.venue',
    city: 'home.city',
  } as const
  const DEFAULT_PHRASE = 'Ao pôr do sol, entre o verde do Horto, vamos dizer sim.'
  const readSite = () => {
    const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
    const map = new Map(rows.map(r => [r.key, r.value]))
    return Object.fromEntries(Object.entries(SITE_KEYS).map(([k, key]) => [k, map.get(key) ?? '']))
  }

  app.get('/site', async () => ({ site: readSite() }))

  app.register(async admin => {
    admin.addHook('preHandler', requireAdmin)

    admin.patch<{ Body: Partial<Record<keyof typeof SITE_KEYS, string>> }>(
      '/admin/site',
      {
        schema: {
          body: {
            type: 'object',
            additionalProperties: false,
            properties: Object.fromEntries(Object.keys(SITE_KEYS).map(k => [k, { type: 'string', maxLength: 300 }])),
          },
        },
      },
      async req => {
        const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
        for (const [k, v] of Object.entries(req.body)) upsert.run(SITE_KEYS[k as keyof typeof SITE_KEYS], (v ?? '').trim())
        return { site: readSite() }
      },
    )

    // Tudo que ainda começa com "Texto provisório" — a lista de tarefas da noiva.
    admin.get('/admin/pendencias', async () => {
      const like = 'Texto provisório%'
      const items: { area: string; label: string; anchor: string }[] = []
      const pageAnchor: Record<string, string> = {
        'nossa-historia': 'painel-historia',
        informacoes: 'painel-info',
        presentes: 'listas',
        'cha-de-panela': 'listas',
        recados: 'painel-recados',
      }
      for (const r of db.prepare('SELECT slug, title FROM pages WHERE intro LIKE ? OR heading LIKE ?').all(like, like) as {
        slug: string
        title: string
      }[]) {
        items.push({ area: r.title, label: 'Texto do topo da página', anchor: pageAnchor[r.slug] ?? 'paginas' })
      }
      for (const [k, key] of Object.entries(SITE_KEYS)) {
        const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
        // A frase da abertura não leva o prefixo (é a primeira coisa que o convidado lê):
        // conta como pendente enquanto for a frase original.
        const provisional = row?.value.startsWith('Texto provisório') || (k === 'phrase' && row?.value === DEFAULT_PHRASE)
        if (provisional) items.push({ area: 'Início', label: k === 'phrase' ? 'Frase de abertura' : k, anchor: 'painel-inicio' })
      }
      for (const r of db.prepare('SELECT title FROM info_blocks WHERE body LIKE ? ORDER BY position').all(like) as { title: string }[]) {
        items.push({ area: 'Informações', label: r.title, anchor: 'painel-info' })
      }
      for (const r of db.prepare('SELECT title FROM story_moments WHERE body LIKE ? ORDER BY position').all(like) as { title: string }[]) {
        items.push({ area: 'Nossa História', label: r.title, anchor: 'painel-historia' })
      }
      for (const r of db.prepare('SELECT title FROM manual_sections WHERE body LIKE ? ORDER BY position').all(like) as { title: string }[]) {
        items.push({ area: 'Manual do Padrinho', label: r.title, anchor: 'manual' })
      }
      return { items }
    })
  })

  /* ── Público ─────────────────────────────────────────────────────── */
  app.get('/historia', async (req, reply) => {
    if (!assertUnlocked('nossa-historia', req, reply)) return reply
    return { page: pageText('nossa-historia'), moments: listStory() }
  })

  app.get('/informacoes', async (req, reply) => {
    if (!assertUnlocked('informacoes', req, reply)) return reply
    return { page: pageText('informacoes'), blocks: listInfo() }
  })

  // Recados são só para os noivos: a página pública mostra apenas o formulário.
  app.get('/recados', async (req, reply) => {
    if (!assertUnlocked('recados', req, reply)) return reply
    return { page: pageText('recados') }
  })

  app.post<{ Body: { name: string; message: string; website?: string } }>(
    '/recados',
    {
      config: { rateLimit: { max: 3, timeWindow: '10 minutes' } },
      schema: {
        body: {
          type: 'object',
          required: ['name', 'message'],
          properties: {
            name: { type: 'string', minLength: 2, maxLength: 80 },
            message: { type: 'string', minLength: 3, maxLength: 800 },
            // Campo invisível: robôs preenchem, pessoas não.
            website: { type: 'string', maxLength: 200 },
          },
        },
      },
    },
    async (req, reply) => {
      if (!assertUnlocked('recados', req, reply)) return reply
      if (req.body.website) return reply.code(201).send({ ok: true })
      db.prepare('INSERT INTO messages (author_name, body) VALUES (?, ?)').run(req.body.name.trim(), req.body.message.trim())
      return reply.code(201).send({ ok: true })
    },
  )
}

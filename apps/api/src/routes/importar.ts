import type { FastifyInstance } from 'fastify'
import { requireAdmin } from '../auth.ts'
import { saveImage } from './uploads.ts'

// "Adicionar pela loja": o painel recebe nome, preço e foto lidos na página
// da loja (no navegador dos noivos). A foto mora no servidor de imagens da
// loja e o navegador não pode baixá-la direto (outro domínio), então ela
// passa por aqui — só de servidores de imagem conhecidos, nunca de outro lugar.

const IMAGE_HOSTS = [
  'susercontent.com', // Shopee
  'mlstatic.com', // Mercado Livre
  'mlcdn.com.br', // Magazine Luiza
  'media-amazon.com', // Amazon
  'ssl-images-amazon.com',
  'kabum.com.br',
  'casasbahia.com.br',
  'pontofrio.com.br',
  'extra.com.br',
  'americanas.com.br',
  'b2wdigital.com',
  'tramontina.com.br',
  'vteximg.com.br', // lojas feitas na VTEX (Tok&Stok, Camicado, Riachuelo…)
  'vtexassets.com',
  'shopify.com', // lojas Shopify (cdn.shopify.com)
  'leroymerlin.com.br',
  'aliexpress-media.com',
  'alicdn.com',
]
const MAX_BYTES = 12 * 1024 * 1024

const allowed = (raw: string) => {
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' && IMAGE_HOSTS.some(h => u.hostname === h || u.hostname.endsWith('.' + h)) ? u : null
  } catch {
    return null
  }
}

/** Baixa a foto da loja (só de servidores conhecidos). */
async function download(raw: string): Promise<{ type: string; body: Buffer } | { status: number; error: string }> {
  const url = allowed(raw)
  if (!url) return { status: 400, error: 'Essa foto não é de uma loja conhecida. Salve a imagem e envie pelo botão de foto.' }
  let res: Response
  try {
    res = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(15_000) })
  } catch {
    return { status: 502, error: 'Não consegui baixar a foto da loja.' }
  }
  const type = res.headers.get('content-type') ?? ''
  if (!res.ok || !type.startsWith('image/')) return { status: 502, error: 'Não consegui baixar a foto da loja.' }
  const body = Buffer.from(await res.arrayBuffer())
  if (body.length > MAX_BYTES) return { status: 413, error: 'Foto grande demais.' }
  return { type, body }
}

export async function importRoutes(app: FastifyInstance) {
  // O servidor baixa a foto da loja e guarda direto, sem passar pelo celular
  // (antes o celular baixava a foto inteira e mandava de volta: lento no 4G).
  app.post<{ Body: { url: string } }>(
    '/admin/imagem-externa',
    {
      preHandler: requireAdmin,
      schema: { body: { type: 'object', required: ['url'], properties: { url: { type: 'string', maxLength: 2000 } } } },
    },
    async (req, reply) => {
      const got = await download(req.body.url)
      if ('error' in got) return reply.code(got.status).send({ error: got.error })
      try {
        return reply.code(201).send(await saveImage(got.body))
      } catch (err) {
        const e = err as Error & { statusCode?: number }
        return reply.code(e.statusCode ?? 500).send({ error: e.message })
      }
    },
  )

  app.get<{ Querystring: { url: string } }>(
    '/admin/imagem-externa',
    {
      preHandler: requireAdmin,
      schema: { querystring: { type: 'object', required: ['url'], properties: { url: { type: 'string', maxLength: 2000 } } } },
    },
    async (req, reply) => {
      // Só para a prévia no card.
      const got = await download(req.query.url)
      if ('error' in got) return reply.code(got.status).send({ error: got.error })
      return reply.header('content-type', got.type).header('cache-control', 'private, max-age=600').send(got.body)
    },
  )
}

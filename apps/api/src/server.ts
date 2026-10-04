import cookie from '@fastify/cookie'
import rateLimit from '@fastify/rate-limit'
import Fastify from 'fastify'
import { config } from './config.ts'
import './db.ts'
import { adminRoutes } from './routes/admin.ts'
import { giftRoutes } from './routes/gifts.ts'
import { publicRoutes } from './routes/public.ts'
import { uploadRoutes } from './routes/uploads.ts'

const app = Fastify({
  logger: { level: config.production ? 'info' : 'debug' },
  // Atrás do Caddy e da Vercel: o IP real vem do cabeçalho X-Forwarded-For.
  trustProxy: true,
  bodyLimit: 64 * 1024,
})

await app.register(cookie, { secret: config.cookieSecret })
await app.register(rateLimit, {
  max: 300,
  timeWindow: '1 minute',
  errorResponseBuilder: (_req, ctx) => ({
    statusCode: 429,
    error: `Muitas tentativas. Aguarde ${Math.ceil(ctx.ttl / 60000)} min e tente de novo.`,
  }),
})

app.get('/api/health', async () => ({ ok: true }))
await app.register(publicRoutes, { prefix: '/api' })
await app.register(adminRoutes, { prefix: '/api/admin' })
await app.register(giftRoutes, { prefix: '/api' })
await app.register(uploadRoutes, { prefix: '/api' })

await app.listen({ port: config.port, host: config.host })

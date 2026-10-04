import { createReadStream, existsSync, mkdirSync } from 'node:fs'
import { unlink, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import multipart from '@fastify/multipart'
import type { FastifyInstance } from 'fastify'
import { requireAdmin } from '../auth.ts'
import { config } from '../config.ts'

mkdirSync(config.uploadsDir, { recursive: true })

const NAME = /^[a-f0-9]{32}\.(webp|jpg|png)$/
const MAX_BYTES = 4 * 1024 * 1024
const TYPES = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png' } as const

// Confere o tipo pelos primeiros bytes, não pelo que o navegador declarou.
function sniff(buf: Buffer): keyof typeof TYPES | null {
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'webp'
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg'
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png'
  return null
}

export const imageUrl = (name: string | null) => (name ? `/api/uploads/${name}` : null)

export async function removeUpload(name: string | null) {
  if (name && NAME.test(name)) await unlink(join(config.uploadsDir, name)).catch(() => {})
}

export async function uploadRoutes(app: FastifyInstance) {
  await app.register(multipart, { limits: { fileSize: MAX_BYTES, files: 1 } })

  app.get<{ Params: { name: string } }>('/uploads/:name', async (req, reply) => {
    const { name } = req.params
    const path = join(config.uploadsDir, name)
    if (!NAME.test(name) || !existsSync(path)) return reply.code(404).send({ error: 'Imagem não encontrada.' })
    const ext = name.split('.').pop() as keyof typeof TYPES
    return reply
      .header('content-type', TYPES[ext])
      .header('cache-control', 'public, max-age=31536000, immutable')
      .send(createReadStream(path))
  })

  app.post('/admin/uploads', { preHandler: requireAdmin }, async (req, reply) => {
    const file = await req.file()
    if (!file) return reply.code(400).send({ error: 'Nenhuma imagem enviada.' })
    const buf = await file.toBuffer().catch(() => null)
    if (!buf || file.file.truncated) return reply.code(413).send({ error: 'Imagem grande demais (máximo 4 MB).' })
    const ext = sniff(buf)
    if (!ext) return reply.code(415).send({ error: 'Envie uma foto em JPG, PNG ou WebP.' })
    const name = `${randomBytes(16).toString('hex')}.${ext}`
    await writeFile(join(config.uploadsDir, name), buf)
    return reply.code(201).send({ image: name, url: imageUrl(name) })
  })
}

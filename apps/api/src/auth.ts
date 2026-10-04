import { createHash, randomBytes } from 'node:crypto'
import type { FastifyReply, FastifyRequest } from 'fastify'
import { config } from './config.ts'
import { db } from './db.ts'

export const PADRINHO_COOKIE = 'padrinho'
export const ADMIN_COOKIE = 'admin'
const YEAR = 60 * 60 * 24 * 365
const WEEK = 60 * 60 * 24 * 7

const baseCookie = {
  path: '/',
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: config.production,
  signed: true,
}

/* ── Tokens das tags NFC: só o hash fica no banco ─────────────────────── */
export const newToken = () => randomBytes(18).toString('base64url')
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')
export const padrinhoLink = (token: string) => `${config.publicSiteUrl}/p/${token}`

/* ── Sessões em cookie assinado ──────────────────────────────────────── */
function readSigned(req: FastifyRequest, name: string): string | null {
  const raw = req.cookies[name]
  if (!raw) return null
  const result = req.unsignCookie(raw)
  return result.valid ? result.value : null
}

export type Padrinho = { id: number; name: string; role: 'padrinho' | 'madrinha'; personalMessage: string }

export function currentPadrinho(req: FastifyRequest): Padrinho | null {
  const id = Number(readSigned(req, PADRINHO_COOKIE))
  if (!id) return null
  const row = db
    .prepare('SELECT id, name, role, personal_message AS personalMessage FROM padrinhos WHERE id = ?')
    .get(id) as Padrinho | undefined
  return row ?? null
}

export function startPadrinhoSession(reply: FastifyReply, id: number) {
  reply.setCookie(PADRINHO_COOKIE, String(id), { ...baseCookie, maxAge: YEAR })
}

export function isAdmin(req: FastifyRequest): boolean {
  const value = readSigned(req, ADMIN_COOKIE)
  const expires = Number(value?.split(':')[1])
  return value?.startsWith('admin:') === true && expires > Date.now()
}

export function startAdminSession(reply: FastifyReply) {
  reply.setCookie(ADMIN_COOKIE, `admin:${Date.now() + WEEK * 1000}`, { ...baseCookie, maxAge: WEEK })
}

export function endAdminSession(reply: FastifyReply) {
  reply.clearCookie(ADMIN_COOKIE, { path: '/' })
}

export async function requireAdmin(req: FastifyRequest, reply: FastifyReply) {
  if (!isAdmin(req)) return reply.code(401).send({ error: 'Entre no painel para continuar.' })
}

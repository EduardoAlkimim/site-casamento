import { randomBytes } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { requireAdmin } from '../auth.ts'
import { config } from '../config.ts'
import { db } from '../db.ts'
import { brl, notify } from '../notify.ts'

// Robô de preços do Mercado Livre, pela API oficial (api.mercadolibre.com).
// Os noivos autorizam uma vez no painel; daí o servidor confere sozinho, uma
// vez por dia de madrugada, o preço de cada item com link do ML, atualiza o
// que mudou e manda um e-mail com o resumo.

// (As variáveis ML_*_URL só existem para testar com um Mercado Livre falso.)
const API = process.env.ML_API_URL ?? 'https://api.mercadolibre.com'
const AUTH = process.env.ML_AUTH_URL ?? 'https://auth.mercadolivre.com.br/authorization'
const redirectUri = () => `${config.publicSiteUrl}/api/admin/ml/retorno`
export const mlConfigured = () => Boolean(config.mlClientId && config.mlClientSecret)

/* ── Guardados em settings ───────────────────────────────────────────── */
const get = (key: string) => (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value ?? ''
const put = (key: string, value: string) =>
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)

type Tokens = { access: string; refresh: string; expiresAt: number }
const readTokens = (): Tokens | null => {
  try {
    const t = JSON.parse(get('ml.tokens') || 'null')
    return t?.refresh ? t : null
  } catch {
    return null
  }
}

async function tokenRequest(body: Record<string, string>): Promise<Tokens> {
  const res = await fetch(`${API}/oauth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' },
    body: new URLSearchParams({ client_id: config.mlClientId, client_secret: config.mlClientSecret, ...body }),
    signal: AbortSignal.timeout(20_000),
  })
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; refresh_token?: string; expires_in?: number; message?: string }
  if (!res.ok || !data.access_token || !data.refresh_token) throw new Error(`Mercado Livre recusou o acesso (${res.status} ${data.message ?? ''})`.trim())
  const t = { access: data.access_token, refresh: data.refresh_token, expiresAt: Date.now() + (data.expires_in ?? 21600) * 1000 }
  put('ml.tokens', JSON.stringify(t))
  return t
}

/** Token válido: renova sozinho quando está perto de vencer (o de renovação muda a cada uso). */
async function accessToken() {
  const t = readTokens()
  if (!t) throw new Error('Mercado Livre não conectado.')
  if (t.expiresAt - Date.now() > 5 * 60_000) return t.access
  return (await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh })).access
}

async function ml<T>(path: string): Promise<T> {
  const res = await fetch(API + path, { headers: { authorization: `Bearer ${await accessToken()}` }, signal: AbortSignal.timeout(20_000) })
  if (!res.ok) throw Object.assign(new Error(`ML ${res.status} em ${path.split('?')[0]}`), { status: res.status })
  return res.json() as Promise<T>
}

/* ── Qual anúncio é cada link ────────────────────────────────────────── */
// Os links trazem o número do anúncio: "wid=MLB123" (links meli.la),
// "item_id:MLB123" (página de produto) ou "/MLB-123-…" (anúncio antigo).
export function itemIdOf(url: string): string | null {
  const u = decodeURIComponent(url)
  const m = u.match(/(?:wid=|item_id:)(MLB\d{6,})/) ?? u.match(/(?<!\/p)\/(MLB)-?(\d{6,})(?:[-_/?#]|$)/)
  if (!m) return null
  return m[2] ? `MLB${m[2]}` : m[1]
}
/** Página de catálogo (/p/MLB…), quando o link não diz o anúncio. */
const catalogIdOf = (url: string) => decodeURIComponent(url).match(/\/p\/(MLB\d{5,})/)?.[1] ?? null
const isML = (url: string) => /(^|\.)(mercadolivre\.com\.br|mercadolibre\.com|meli\.la)$/.test(new URL(url).hostname)

type Row = { id: number; name: string; priceCents: number | null; url: string }
type Change = { id: number; name: string; from: number | null; to: number }
export type MlRun = {
  at: string
  checked: number
  changed: Change[]
  unavailable: { id: number; name: string; reason: string }[]
  error?: string
}

/** Confere todos os itens com link do ML. Nunca muda link, nome nem foto: só o preço. */
export async function runMl(): Promise<MlRun> {
  const run: MlRun = { at: new Date().toISOString(), checked: 0, changed: [], unavailable: [] }
  try {
    const rows = (
      db
        .prepare(
          `SELECT id, name, price_cents AS priceCents, external_url AS url FROM gifts
           WHERE external_url IS NOT NULL AND external_url <> '' AND purchase_mode <> 'site' AND status <> 'presenteado'`,
        )
        .all() as Row[]
    ).filter(r => {
      try {
        return isML(r.url)
      } catch {
        return false
      }
    })

    const byItem = new Map<string, Row[]>()
    const byCatalog = new Map<string, Row[]>()
    for (const r of rows) {
      const item = itemIdOf(r.url)
      const cat = item ? null : catalogIdOf(r.url)
      if (item) byItem.set(item, [...(byItem.get(item) ?? []), r])
      else if (cat) byCatalog.set(cat, [...(byCatalog.get(cat) ?? []), r])
      else run.unavailable.push({ id: r.id, name: r.name, reason: 'não achei o número do anúncio no link' })
    }

    const prices = new Map<Row, number | { reason: string }>()
    // Anúncios: até 20 por consulta.
    const ids = [...byItem.keys()]
    for (let i = 0; i < ids.length; i += 20) {
      const chunk = ids.slice(i, i + 20)
      const res = await ml<{ code: number; body: { id: string; price?: number; status?: string } }[]>(
        `/items?ids=${chunk.join(',')}&attributes=id,price,status`,
      )
      for (const { code, body } of res) {
        const owners = byItem.get(body?.id) ?? []
        for (const r of owners) {
          if (code !== 200) prices.set(r, { reason: 'anúncio não encontrado' })
          else if (body.status !== 'active') prices.set(r, { reason: body.status === 'paused' ? 'anúncio pausado' : 'anúncio encerrado' })
          else if (typeof body.price === 'number' && body.price > 0) prices.set(r, Math.round(body.price * 100))
          else prices.set(r, { reason: 'sem preço no anúncio' })
        }
      }
    }
    // Catálogo: preço de quem está vendendo no destaque.
    for (const [cat, owners] of byCatalog) {
      try {
        const p = await ml<{ buy_box_winner?: { price?: number } | null }>(`/products/${cat}`)
        const v = p.buy_box_winner?.price
        for (const r of owners) prices.set(r, typeof v === 'number' && v > 0 ? Math.round(v * 100) : { reason: 'ninguém vendendo agora' })
      } catch {
        for (const r of owners) prices.set(r, { reason: 'produto não encontrado' })
      }
    }

    const setPrice = db.prepare("UPDATE gifts SET price_cents = ?, price_checked_at = datetime('now') WHERE id = ?")
    const touch = db.prepare("UPDATE gifts SET price_checked_at = datetime('now') WHERE id = ?")
    for (const [r, v] of prices) {
      if (typeof v !== 'number') {
        run.unavailable.push({ id: r.id, name: r.name, reason: v.reason })
        continue
      }
      run.checked++
      if (v !== r.priceCents) {
        setPrice.run(v, r.id)
        run.changed.push({ id: r.id, name: r.name, from: r.priceCents, to: v })
      } else touch.run(r.id)
    }
  } catch (err) {
    run.error = (err as Error).message
  }
  put('ml.lastRun', JSON.stringify(run))

  if (run.changed.length || run.unavailable.length || run.error) {
    notify(
      run.error ? '⚠️ Robô de preços do Mercado Livre parou' : `💲 Preços do Mercado Livre: ${run.changed.length} atualizado(s)`,
      run.error ? 'O robô de preços não conseguiu conferir' : 'Conferência diária dos preços',
      [
        ...(run.error ? ([['Erro', run.error]] as [string, string][]) : []),
        ...run.changed.map(c => [c.name, `${c.from != null ? brl(c.from) : 'sem valor'} → ${brl(c.to)}`] as [string, string]),
        ...run.unavailable.map(u => [u.name, `⚠️ ${u.reason}`] as [string, string]),
      ],
    )
  }
  return run
}

/* ── Agenda: uma vez por dia, de madrugada (horário de Brasília) ─────── */
let running = false
export function startMlSchedule() {
  const tick = async () => {
    if (running || !mlConfigured() || !readTokens()) return
    const hour = Number(new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Sao_Paulo' }).format(new Date()))
    const last = Date.parse((JSON.parse(get('ml.lastRun') || 'null') as MlRun | null)?.at ?? '') || 0
    if (hour < 4 || hour > 7 || Date.now() - last < 20 * 3_600_000) return
    running = true
    try {
      await runMl()
    } finally {
      running = false
    }
  }
  setInterval(() => void tick(), 15 * 60_000).unref()
}

/* ── Painel ──────────────────────────────────────────────────────────── */
export async function mercadoLivreRoutes(app: FastifyInstance) {
  app.register(async admin => {
    admin.addHook('preHandler', requireAdmin)

    admin.get('/admin/ml', async () => ({
      configured: mlConfigured(),
      connected: Boolean(readTokens()),
      redirectUri: redirectUri(),
      lastRun: JSON.parse(get('ml.lastRun') || 'null') as MlRun | null,
    }))

    // Leva para a tela de autorização do Mercado Livre.
    admin.get('/admin/ml/conectar', async (_req, reply) => {
      if (!mlConfigured()) return reply.code(409).send({ error: 'Falta configurar o app do Mercado Livre no servidor.' })
      const state = randomBytes(16).toString('hex')
      put('ml.state', state)
      const url = `${AUTH}?${new URLSearchParams({ response_type: 'code', client_id: config.mlClientId, redirect_uri: redirectUri(), state })}`
      return reply.redirect(url)
    })

    // Volta da autorização: troca o código pelos tokens e já roda a primeira conferência.
    admin.get<{ Querystring: { code?: string; state?: string; error?: string } }>('/admin/ml/retorno', async (req, reply) => {
      const back = (q: string) => reply.redirect(`${config.publicSiteUrl}/painel/precos?${q}`)
      if (req.query.error || !req.query.code) return back('ml=recusado')
      if (!req.query.state || req.query.state !== get('ml.state')) return back('ml=invalido')
      put('ml.state', '')
      try {
        await tokenRequest({ grant_type: 'authorization_code', code: req.query.code, redirect_uri: redirectUri() })
      } catch {
        return back('ml=erro')
      }
      if (!running) {
        running = true
        void runMl().finally(() => (running = false))
      }
      return back('ml=ok')
    })

    admin.post('/admin/ml/conferir', async (_req, reply) => {
      if (!mlConfigured() || !readTokens()) return reply.code(409).send({ error: 'Conecte o Mercado Livre primeiro.' })
      if (running) return reply.code(409).send({ error: 'Já estou conferindo, espere um instante.' })
      running = true
      try {
        return { lastRun: await runMl() }
      } finally {
        running = false
      }
    })

    admin.post('/admin/ml/desconectar', async () => {
      put('ml.tokens', '')
      return { ok: true }
    })
  })
}

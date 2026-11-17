import { createHash } from 'node:crypto'
import type { FastifyInstance } from 'fastify'
import { requireAdmin } from '../auth.ts'
import { config } from '../config.ts'
import { db } from '../db.ts'
import { brl, notify } from '../notify.ts'

// Robô de preços da Shopee, pela API oficial de afiliados (Open API, GraphQL).
// Uma vez por dia, de madrugada, confere o preço de cada item com link da
// Shopee, atualiza o que mudou e manda um e-mail com o resumo.

const API = process.env.SHOPEE_API_URL ?? 'https://open-api.affiliate.shopee.com.br/graphql'
export const shopeeConfigured = () => Boolean(config.shopeeAppId && config.shopeeSecret)

const getSetting = (key: string) => (db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined)?.value ?? ''
const putSetting = (key: string, value: string) =>
  db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(key, value)

/** Chamada assinada: SHA256(AppId + Timestamp + Payload + Secret), como pede a Shopee. */
async function gql<T>(query: string): Promise<T> {
  const payload = JSON.stringify({ query })
  const ts = Math.floor(Date.now() / 1000)
  const signature = createHash('sha256').update(`${config.shopeeAppId}${ts}${payload}${config.shopeeSecret}`).digest('hex')
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `SHA256 Credential=${config.shopeeAppId}, Timestamp=${ts}, Signature=${signature}`,
    },
    body: payload,
    signal: AbortSignal.timeout(20_000),
  })
  const data = (await res.json().catch(() => ({}))) as { data?: T; errors?: { message?: string }[] }
  if (!res.ok || data.errors?.length || !data.data) {
    throw new Error(`Shopee: ${data.errors?.[0]?.message ?? `erro ${res.status}`}`)
  }
  return data.data
}

/* ── Qual produto é cada link ────────────────────────────────────────── */
// Formatos: /product/LOJA/PRODUTO, nome-i.LOJA.PRODUTO, /qualquercoisa/LOJA/PRODUTO.
export function shopeeIdsOf(url: string): { shopId: string; itemId: string } | null {
  let u = url
  try {
    u = decodeURIComponent(url)
  } catch {
    /* link com % solto: usa como está */
  }
  if (!/shopee\.com\.br/.test(u)) return null
  const m = u.match(/-i\.(\d+)\.(\d+)/) ?? u.match(/shopee\.com\.br\/(?:[^/?#]+\/)?(\d{3,})\/(\d{5,})(?:[/?#]|$)/)
  return m ? { shopId: m[1], itemId: m[2] } : null
}

/** Link curto (br.shp.ee, s.shopee.com.br, ou embrulhado pelo Instagram): só lê para onde ele aponta. */
async function expand(url: string): Promise<string> {
  let u = url
  const wrapped = u.match(/[?&]u=([^&]+)/)
  if (/l\.instagram\.com|facebook\.com\/l\.php/.test(u) && wrapped) u = decodeURIComponent(wrapped[1])
  for (let i = 0; i < 4 && !shopeeIdsOf(u); i++) {
    const res = await fetch(u, { method: 'HEAD', redirect: 'manual', signal: AbortSignal.timeout(10_000) }).catch(() => null)
    const next = res?.headers.get('location')
    if (!next) break
    u = new URL(next, u).toString()
  }
  return u
}

const isShopee = (url: string) => /shopee\.com\.br|shp\.ee|shope\.ee|s\.shopee/.test(url)

type Row = { id: number; name: string; priceCents: number | null; url: string; storeRef: string | null }
type Offer = { itemId: string | number; price?: string; priceMin?: string; priceMax?: string; productName?: string }
export type ShopeeRun = {
  at: string
  checked: number
  changed: { id: number; name: string; from: number | null; to: number }[]
  unavailable: { id: number; name: string; reason: string }[]
  /** Links trocados pelo link de afiliado de vocês nesta rodada. */
  affiliated?: number
  error?: string
}

const cents = (v: string | undefined) => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null
}

/** Confere os itens da Shopee. Só mexe no preço (nunca em link, nome ou foto). */
export async function runShopee(): Promise<ShopeeRun> {
  const run: ShopeeRun = { at: new Date().toISOString(), checked: 0, changed: [], unavailable: [] }
  try {
    const rows = (
      db
        .prepare(
          `SELECT id, name, price_cents AS priceCents, external_url AS url, store_ref AS storeRef FROM gifts
           WHERE external_url IS NOT NULL AND external_url <> '' AND purchase_mode <> 'site' AND status <> 'presenteado'`,
        )
        .all() as Row[]
    ).filter(r => isShopee(r.url))

    const setPrice = db.prepare("UPDATE gifts SET price_cents = ?, price_checked_at = datetime('now') WHERE id = ?")
    const touch = db.prepare("UPDATE gifts SET price_checked_at = datetime('now') WHERE id = ?")
    const setAffiliate = db.prepare('UPDATE gifts SET external_url = ?, store_ref = ? WHERE id = ?')
    run.affiliated = 0

    for (const r of rows) {
      const ref = r.storeRef?.match(/^shopee:(\d+)\.(\d+)$/)
      const ids = ref ? { shopId: ref[1], itemId: ref[2] } : (shopeeIdsOf(r.url) ?? shopeeIdsOf(await expand(r.url)))
      if (!ids) {
        run.unavailable.push({ id: r.id, name: r.name, reason: 'não achei o produto no link' })
        continue
      }
      let offer: Offer | undefined
      try {
        const data = await gql<{ productOfferV2: { nodes: Offer[] } }>(
          `{ productOfferV2(shopId: ${ids.shopId}, itemId: ${ids.itemId}, limit: 1) { nodes { itemId price priceMin priceMax productName } } }`,
        )
        offer = data.productOfferV2.nodes.find(n => String(n.itemId) === ids.itemId) ?? data.productOfferV2.nodes[0]
      } catch (err) {
        // Erro de acesso (chave, assinatura): para tudo e avisa. Erro num item só: segue.
        if (/auth|signature|credential|permission|10020|1002\d/i.test((err as Error).message)) throw err
        run.unavailable.push({ id: r.id, name: r.name, reason: (err as Error).message })
        continue
      }
      if (!offer) {
        run.unavailable.push({ id: r.id, name: r.name, reason: 'produto indisponível na Shopee' })
        continue
      }
      // Com variações (cor/tamanho) a Shopee dá uma faixa: se o preço do site
      // está dentro dela, está certo; senão, usa o preço principal do produto.
      const min = cents(offer.priceMin) ?? cents(offer.price)
      const max = cents(offer.priceMax) ?? min
      const main = cents(offer.price) ?? min
      if (!main || !min || !max) {
        run.unavailable.push({ id: r.id, name: r.name, reason: 'produto sem preço na Shopee' })
        continue
      }
      run.checked++
      if (r.priceCents != null && r.priceCents >= min && r.priceCents <= max) touch.run(r.id)
      else {
        setPrice.run(main, r.id)
        run.changed.push({ id: r.id, name: r.name, from: r.priceCents, to: main })
      }
      // Link de afiliado de vocês (uma vez por item): quem comprar pelo site gera comissão.
      if (!r.storeRef) {
        try {
          const origin = `https://shopee.com.br/product/${ids.shopId}/${ids.itemId}`
          const { generateShortLink } = await gql<{ generateShortLink: { shortLink: string } }>(
            `mutation { generateShortLink(input: { originUrl: "${origin}", subIds: ["listacasamento"] }) { shortLink } }`,
          )
          if (/^https:\/\/\S+$/.test(generateShortLink.shortLink)) {
            setAffiliate.run(generateShortLink.shortLink, `shopee:${ids.shopId}.${ids.itemId}`, r.id)
            run.affiliated++
          }
        } catch {
          /* fica com o link de antes; tenta de novo na próxima rodada */
        }
      }
      await new Promise(res => setTimeout(res, 250)) // sem pressa: a Shopee limita o ritmo
    }
  } catch (err) {
    run.error = (err as Error).message
  }
  putSetting('shopee.lastRun', JSON.stringify(run))

  if (run.changed.length || run.unavailable.length || run.error || run.affiliated) {
    notify(
      run.error ? '⚠️ Robô de preços da Shopee parou' : `💲 Preços da Shopee: ${run.changed.length} atualizado(s)`,
      run.error ? 'O robô de preços da Shopee não conseguiu conferir' : 'Conferência diária dos preços da Shopee',
      [
        ...(run.error ? ([['Erro', run.error]] as [string, string][]) : []),
        ...(run.affiliated ? ([['Links de afiliado', `${run.affiliated} link(s) trocados pelo link de afiliado de vocês`]] as [string, string][]) : []),
        ...run.changed.map(c => [c.name, `${c.from != null ? brl(c.from) : 'sem valor'} → ${brl(c.to)}`] as [string, string]),
        ...run.unavailable.map(u => [u.name, `⚠️ ${u.reason}`] as [string, string]),
      ],
    )
  }
  return run
}

/* ── Agenda: uma vez por dia, de madrugada (horário de Brasília) ─────── */
let running = false
export function startShopeeSchedule() {
  const tick = async () => {
    if (running || !shopeeConfigured()) return
    const hour = Number(new Intl.DateTimeFormat('pt-BR', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Sao_Paulo' }).format(new Date()))
    const last = Date.parse((JSON.parse(getSetting('shopee.lastRun') || 'null') as ShopeeRun | null)?.at ?? '') || 0
    if (hour < 4 || hour > 7 || Date.now() - last < 20 * 3_600_000) return
    running = true
    try {
      await runShopee()
    } finally {
      running = false
    }
  }
  setInterval(() => void tick(), 15 * 60_000).unref()
}

/* ── Painel ──────────────────────────────────────────────────────────── */
export async function shopeeRoutes(app: FastifyInstance) {
  app.register(async admin => {
    admin.addHook('preHandler', requireAdmin)

    admin.get('/admin/shopee', async () => ({
      configured: shopeeConfigured(),
      running,
      lastRun: JSON.parse(getSetting('shopee.lastRun') || 'null') as ShopeeRun | null,
    }))

    // Roda em segundo plano (são ~200 itens, leva 1–2 minutos); o painel acompanha.
    admin.post('/admin/shopee/conferir', async (_req, reply) => {
      if (!shopeeConfigured()) return reply.code(409).send({ error: 'Falta configurar a chave da Shopee no servidor.' })
      if (running) return reply.code(409).send({ error: 'Já estou conferindo, espere um instante.' })
      running = true
      void runShopee().finally(() => (running = false))
      return reply.code(202).send({ ok: true })
    })
  })
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, type Gift } from '../../lib/api'
import { centsToInput, formatBRL, parseBRL } from '../../lib/money'
import { Button } from '../../design-system/components/Button'
import base from '../Painel.module.css'
import styles from './ImportarPanel.module.css'
import { priceInput, type CheckHandler } from './loja'

// Conferir preços: o painel abre cada produto numa aba da loja; a pessoa clica
// no favorito "＋ Lista E&T" e o painel confere o preço, atualiza se mudou e
// abre o próximo na mesma aba. Quem abre e lê cada página é sempre a pessoa,
// no navegador dela — nada visita a loja sozinho.

type LogEntry = { id: number; name: string; from: number | null; to: number | null; kind: 'igual' | 'mudou' | 'pulado' | 'indisponivel' }
type Pause = { gift: Gift; cents: number | null; why: 'sem-preco' | 'mudou-muito' | 'outro-produto' }

/** Ids da Shopee no link (loja + produto), quando dá para ler. */
const shopeeIds = (u: string) => {
  const m = u.match(/product\/(\d+)\/(\d+)|i\.(\d+)\.(\d+)/)
  return m ? m.slice(1).filter(Boolean).join('.') : null
}
const toCents = (raw: string) => {
  const v = parseBRL(priceInput(raw))
  return v == null || Number.isNaN(v) ? null : v
}
const ago = (iso: string | null | undefined) => {
  if (!iso) return 'nunca conferido'
  const days = Math.floor((Date.now() - new Date(iso.replace(' ', 'T') + 'Z').getTime()) / 86_400_000)
  return days <= 0 ? 'conferido hoje' : days === 1 ? 'conferido ontem' : `conferido há ${days} dias`
}
/** Mudou mais que isso: para e pergunta (pode ser outra cor/tamanho ou leitura errada). */
const BIG_CHANGE = 0.5

export function PriceCheck({
  gifts,
  onGift,
  register,
}: {
  gifts: Gift[]
  onGift: (g: Gift) => void
  register: (fn: CheckHandler | null) => void
}) {
  const candidates = useMemo(
    () =>
      gifts
        .filter(g => g.externalUrl && g.purchaseMode !== 'site' && g.status === 'disponivel')
        .sort((a, b) => (a.priceCheckedAt ?? '').localeCompare(b.priceCheckedAt ?? '')),
    [gifts],
  )
  const [queue, setQueue] = useState<Gift[] | null>(null)
  const [idx, setIdx] = useState(0)
  const [pause, setPause] = useState<Pause | null>(null)
  const [manual, setManual] = useState('')
  const [log, setLog] = useState<LogEntry[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const win = useRef<Window | null>(null)
  // Os eventos chegam fora do React: leem sempre o estado mais novo por aqui.
  const state = useRef({ queue, idx, pause, busy })
  state.current = { queue, idx, pause, busy }

  const current = queue?.[idx] ?? null
  const done = Boolean(queue && idx >= queue.length)

  /** Mostra o produto i na aba da loja (a mesma aba, sempre). */
  const show = (g: Gift | undefined) => {
    if (!g?.externalUrl) return
    if (win.current && !win.current.closed) win.current.location.href = g.externalUrl
    else win.current = window.open(g.externalUrl, 'et-loja')
  }

  const next = useCallback((entry: LogEntry) => {
    setLog(prev => [entry, ...prev])
    setPause(null)
    setManual('')
    const i = state.current.idx + 1
    setIdx(i)
    const g = state.current.queue?.[i]
    // Sem clique aqui: só troca o endereço da aba que já abrimos.
    if (g?.externalUrl && win.current && !win.current.closed) win.current.location.href = g.externalUrl
  }, [])

  const apply = useCallback(
    async (g: Gift, cents: number | null) => {
      setBusy(true)
      setError(undefined)
      try {
        const changed = cents != null && cents !== g.priceCents
        const { gift } = await api<{ gift: Gift }>(`/admin/presentes/${g.id}?leve=1`, {
          method: 'PATCH',
          body: changed ? { priceCents: cents, priceChecked: true } : { priceChecked: true },
        })
        onGift(gift)
        next({ id: g.id, name: g.name, from: g.priceCents, to: changed ? cents : g.priceCents, kind: changed ? 'mudou' : 'igual' })
      } catch (err) {
        setError((err as Error).message)
      } finally {
        setBusy(false)
      }
    },
    [next, onGift],
  )

  // Produto que chegou do favorito durante a conferência.
  useEffect(() => {
    if (!queue || done) {
      register(null)
      return
    }
    register((d, from) => {
      const { queue: q, idx: i, pause: p, busy: b } = state.current
      const g = q?.[i]
      // Só vale o que vem da aba que abrimos (ou pelo endereço, no favorito antigo).
      if (!g || (from && from !== win.current)) return null
      if (p || b) return 'et-wait'
      const cents = toCents(d.price ?? '')
      const ours = g.externalUrl ? shopeeIds(g.externalUrl) : null
      const theirs = shopeeIds(d.url)
      if (ours && theirs && ours !== theirs) {
        setPause({ gift: g, cents, why: 'outro-produto' })
        setManual(cents != null ? centsToInput(cents) : '')
        return 'et-wait'
      }
      if (cents == null) {
        setPause({ gift: g, cents, why: 'sem-preco' })
        return 'et-wait'
      }
      if (g.priceCents != null && Math.abs(cents - g.priceCents) / g.priceCents > BIG_CHANGE) {
        setPause({ gift: g, cents, why: 'mudou-muito' })
        setManual(centsToInput(cents))
        return 'et-wait'
      }
      void apply(g, cents)
      return 'et-ok'
    })
    return () => register(null)
  }, [queue, done, apply, register])

  const start = () => {
    setQueue(candidates)
    setIdx(0)
    setLog([])
    setPause(null)
    show(candidates[0])
  }
  const stop = () => {
    setQueue(null)
    setPause(null)
  }

  const manualCents = parseBRL(manual)
  const manualOk = manualCents != null && !Number.isNaN(manualCents)
  const changed = log.filter(l => l.kind === 'mudou')
  const unavailable = log.filter(l => l.kind === 'indisponivel')
  const never = candidates.filter(g => !g.priceCheckedAt).length

  return (
    <section className={styles.check} aria-labelledby="conferir">
      <p id="conferir" className={base.formTitle}>
        Conferir preços
      </p>

      {!queue && (
        <>
          <p className={base.help}>
            {candidates.length} itens com link de loja{never ? ` · ${never} nunca conferidos` : ''}. O painel abre o primeiro numa
            aba; lá você clica no favorito “＋ Lista E&amp;T”, ele atualiza o preço e já abre o próximo na mesma aba. Começa pelos
            conferidos há mais tempo; dá para parar quando quiser.
          </p>
          <div className={base.formActions}>
            <Button onClick={start} disabled={!candidates.length}>
              Começar a conferir
            </Button>
          </div>
        </>
      )}

      {queue && !done && current && (
        <div className={styles.checkNow}>
          <p className={styles.progress}>
            {idx + 1} de {queue.length}
            {changed.length > 0 && ` · ${changed.length} ${changed.length === 1 ? 'preço atualizado' : 'preços atualizados'}`}
          </p>
          <p className={styles.title}>{current.name}</p>
          <p className={base.help}>
            No site: {current.priceCents != null ? formatBRL(current.priceCents) : 'sem valor'} · {ago(current.priceCheckedAt)}
          </p>

          {pause ? (
            <div className={styles.pause} role="alert">
              <p>
                {pause.why === 'mudou-muito' &&
                  `Na loja está ${formatBRL(pause.cents!)}, bem diferente do site (${formatBRL(pause.gift.priceCents!)}). Confira se é a mesma cor/tamanho.`}
                {pause.why === 'sem-preco' && 'Não consegui ler o preço nessa página. Digite o valor que aparece na loja:'}
                {pause.why === 'outro-produto' && 'A página aberta parece ser de outro produto. Confira antes de atualizar.'}
              </p>
              <label className={styles.field}>
                <span>Valor na loja (R$)</span>
                <input inputMode="decimal" value={manual} onChange={e => setManual(e.target.value)} placeholder="49,90" />
              </label>
              <div className={base.formActions}>
                <Button loading={busy} disabled={!manualOk} onClick={() => apply(pause.gift, manualCents as number)}>
                  {manualOk ? `Atualizar para ${formatBRL(manualCents as number)}` : 'Atualizar'}
                </Button>
                {pause.gift.priceCents != null && (
                  <Button variant="quiet" onClick={() => apply(pause.gift, pause.gift.priceCents)}>
                    Manter {formatBRL(pause.gift.priceCents)}
                  </Button>
                )}
              </div>
            </div>
          ) : (
            <p className={base.help} role="status">
              {busy ? 'Salvando…' : 'Aguardando você clicar no favorito na aba da loja…'}
            </p>
          )}

          {error && <p className={base.error} role="alert">{error}</p>}
          <div className={base.formActions}>
            <Button variant="outline" onClick={() => show(current)}>
              Abrir de novo
            </Button>
            <Button variant="quiet" onClick={() => next({ id: current.id, name: current.name, from: current.priceCents, to: null, kind: 'pulado' })}>
              Pular
            </Button>
            <Button
              variant="quiet"
              onClick={() => next({ id: current.id, name: current.name, from: current.priceCents, to: null, kind: 'indisponivel' })}
            >
              Produto indisponível
            </Button>
            <Button variant="quiet" className={base.danger} onClick={stop}>
              Parar
            </Button>
          </div>
        </div>
      )}

      {queue && done && (
        <div className={styles.checkNow}>
          <p className={styles.title}>Conferência terminada ✓</p>
          <div className={base.formActions}>
            <Button variant="outline" onClick={stop}>
              Fechar
            </Button>
          </div>
        </div>
      )}

      {(changed.length > 0 || unavailable.length > 0) && (
        <ul className={styles.log}>
          {unavailable.map(l => (
            <li key={`i${l.id}`}>
              <strong>{l.name}</strong>: indisponível na loja (vale trocar o link ou esconder)
            </li>
          ))}
          {changed.map(l => (
            <li key={`m${l.id}`}>
              <strong>{l.name}</strong>: {l.from != null ? formatBRL(l.from) : 'sem valor'} → {formatBRL(l.to!)}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

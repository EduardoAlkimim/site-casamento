import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { formatBRL } from '../../lib/money'
import { Button } from '../../design-system/components/Button'
import { Eyebrow } from '../../design-system/components/Ornaments'
import base from '../Painel.module.css'
import styles from './ImportarPanel.module.css'

// Preços automáticos: o servidor confere sozinho, todo dia de madrugada,
// os preços dos itens do Mercado Livre (API oficial) e avisa por e-mail.

type MlRun = {
  at: string
  checked: number
  changed: { id: number; name: string; from: number | null; to: number }[]
  unavailable: { id: number; name: string; reason: string }[]
  error?: string
}
type MlStatus = { configured: boolean; connected: boolean; redirectUri: string; lastRun: MlRun | null }

const BACK: Record<string, string> = {
  ok: 'Mercado Livre conectado. A primeira conferência já começou; atualize a página em alguns segundos.',
  recusado: 'A autorização foi cancelada no Mercado Livre.',
  invalido: 'O link de autorização expirou. Clique em “Conectar” de novo.',
  erro: 'O Mercado Livre não aceitou a autorização. Confira o app e tente de novo.',
}

const when = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export function PrecosPanel() {
  const [status, setStatus] = useState<MlStatus | null>(null)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [notice] = useState(() => BACK[new URLSearchParams(location.search).get('ml') ?? ''] ?? null)

  const load = () => api<MlStatus>('/admin/ml').then(setStatus, err => setError(err.message))
  useEffect(() => {
    void load()
    if (location.search) history.replaceState(null, '', location.pathname)
  }, [])

  const runNow = async () => {
    setBusy(true)
    setError(undefined)
    try {
      const { lastRun } = await api<{ lastRun: MlRun }>('/admin/ml/conferir', { body: {} })
      setStatus(s => (s ? { ...s, lastRun } : s))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const run = status?.lastRun

  return (
    <section className={base.block} aria-labelledby="painel-precos">
      <Eyebrow>Presentes</Eyebrow>
      <h2 id="painel-precos" className={base.blockTitle}>Preços automáticos</h2>
      <p className={base.help}>
        Todo dia de madrugada o site confere sozinho o preço dos itens do Mercado Livre, atualiza o que mudou e manda um e-mail
        para vocês com o resumo. Para os convidados, preço de loja aparece sempre como “≈ valor de referência”.
      </p>

      {notice && <p className={base.saved} role="status">{notice}</p>}
      {error && <p className={base.error} role="alert">{error}</p>}
      {!status && !error && <p className={base.help}>Carregando…</p>}

      {status && (
        <div className={styles.check}>
          <p className={base.formTitle}>Mercado Livre</p>

          {!status.configured && (
            <>
              <p className={base.help}>
                Falta criar o app do site no Mercado Livre (grátis, uma vez só). No portal developers.mercadolivre.com.br, em
                “Criar aplicação”, use esta URI de redirect:
              </p>
              <code className={styles.code}>{status.redirectUri}</code>
              <p className={base.help}>Depois mande o Client ID e a Secret para configurar no servidor.</p>
            </>
          )}

          {status.configured && !status.connected && (
            <>
              <p className={base.help}>App configurado. Falta autorizar uma vez com a sua conta do Mercado Livre:</p>
              <div className={base.formActions}>
                <a className={styles.bookmarklet} href="/api/admin/ml/conectar">
                  Conectar Mercado Livre
                </a>
              </div>
            </>
          )}

          {status.configured && status.connected && (
            <>
              <p className={base.saved}>Ligado · confere sozinho todo dia, entre 4h e 7h</p>
              {run ? (
                <>
                  <p className={base.help}>
                    Última conferência: {when(run.at)} · {run.checked} {run.checked === 1 ? 'item conferido' : 'itens conferidos'}
                    {' · '}
                    {run.changed.length ? `${run.changed.length} ${run.changed.length === 1 ? 'preço mudou' : 'preços mudaram'}` : 'nenhum preço mudou'}
                  </p>
                  {run.error && <p className={base.error}>{run.error}</p>}
                  {(run.changed.length > 0 || run.unavailable.length > 0) && (
                    <ul className={styles.log}>
                      {run.unavailable.map(u => (
                        <li key={`u${u.id}`}>
                          <strong>{u.name}</strong>: {u.reason} (vale trocar o link ou esconder)
                        </li>
                      ))}
                      {run.changed.map(c => (
                        <li key={`c${c.id}`}>
                          <strong>{c.name}</strong>: {c.from != null ? formatBRL(c.from) : 'sem valor'} → {formatBRL(c.to)}
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              ) : (
                <p className={base.help}>Ainda não rodou.</p>
              )}
              <div className={base.formActions}>
                <Button variant="outline" loading={busy} onClick={runNow}>
                  Conferir agora
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      <div className={styles.check}>
        <p className={base.formTitle}>Shopee</p>
        <p className={base.help}>
          Automático só pela API de afiliados da Shopee, que depende da aprovação da Shopee. Quando a chave sair, o robô passa a
          conferir os itens da Shopee junto. Até lá, dá para conferir com o favorito em “Adicionar pela loja → Conferir preços”.
        </p>
      </div>
    </section>
  )
}

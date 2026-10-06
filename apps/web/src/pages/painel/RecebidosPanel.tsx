import { useEffect, useState } from 'react'
import { api, type AdminPayment } from '../../lib/api'
import { formatBRL } from '../../lib/money'
import { Button } from '../../design-system/components/Button'
import { Eyebrow } from '../../design-system/components/Ornaments'
import base from '../Painel.module.css'
import styles from './RecebidosPanel.module.css'

const STATUS: Record<string, { label: string; tone: 'ok' | 'wait' | 'fail' }> = {
  approved: { label: 'Recebido', tone: 'ok' },
  pending: { label: 'Aguardando pagamento', tone: 'wait' },
  in_process: { label: 'Em análise', tone: 'wait' },
  authorized: { label: 'Em análise', tone: 'wait' },
  rejected: { label: 'Recusado', tone: 'fail' },
  cancelled: { label: 'Cancelado / expirado', tone: 'fail' },
  refunded: { label: 'Estornado', tone: 'fail' },
  charged_back: { label: 'Contestado', tone: 'fail' },
}

// SQLite guarda em UTC ("2026-10-04 01:02:03").
const when = (utc: string) =>
  new Date(utc.replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export function RecebidosPanel() {
  const [list, setList] = useState<AdminPayment[] | null>(null)
  const [error, setError] = useState<string>()
  const [onlyReceived, setOnlyReceived] = useState(true)

  const load = () =>
    api<{ payments: AdminPayment[] }>('/admin/pagamentos')
      .then(d => setList(d.payments))
      .catch(err => setError(err.message))

  useEffect(() => {
    load()
  }, [])

  const shown = list?.filter(p => !onlyReceived || p.status === 'approved') ?? []
  const total = list?.filter(p => p.status === 'approved').reduce((sum, p) => sum + p.amountCents, 0) ?? 0

  return (
    <section className={base.block} aria-labelledby="recebidos">
      <Eyebrow index="VI">Recebidos</Eyebrow>
      <h2 id="recebidos" className={base.blockTitle}>Presentes recebidos</h2>
      {list && (
        <p className={styles.total}>
          {formatBRL(total)} <span>em {list.filter(p => p.status === 'approved').length} presentes pelo site</span>
        </p>
      )}

      <div className={styles.filters}>
        <label className={base.radio}>
          <input type="checkbox" checked={onlyReceived} onChange={e => setOnlyReceived(e.target.checked)} />
          Só os recebidos
        </label>
        <Button variant="quiet" onClick={load}>Atualizar</Button>
      </div>

      {error && <p className={base.error} role="alert">{error}</p>}
      {list && shown.length === 0 && (
        <p className={base.help}>{onlyReceived ? 'Nenhum presente recebido ainda.' : 'Nenhuma tentativa de pagamento ainda.'}</p>
      )}

      {shown.length > 0 && (
        <ul className={base.rows}>
          {shown.map(p => {
            const status = STATUS[p.status] ?? { label: p.status, tone: 'wait' as const }
            return (
              <li key={p.id} className={styles.item}>
                <div className={styles.head}>
                  <span className={base.rowTitle}>{p.payerName}</span>
                  <span className={styles.amount}>{formatBRL(p.amountCents)}</span>
                </div>
                <p className={base.rowMeta}>
                  {p.giftName} · {p.method === 'pix' ? 'PIX' : 'Cartão'} · {when(p.approvedAt ?? p.createdAt)}
                </p>
                <p className={`${styles.status} ${styles[status.tone]}`}>{status.label}</p>
                {p.message && <blockquote className={styles.message}>{p.message}</blockquote>}
                <a className={styles.email} href={`mailto:${p.payerEmail}`}>{p.payerEmail}</a>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

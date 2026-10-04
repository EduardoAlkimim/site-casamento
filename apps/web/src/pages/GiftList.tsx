import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { api, type Gift, type GiftListData, type GiftListName, type PaymentConfig } from '../lib/api'
import { formatBRL } from '../lib/money'
import { Sprig } from '../design-system/botanicals/Botanicals'
import { Divider, Eyebrow } from '../design-system/components/Ornaments'
import styles from './GiftList.module.css'
import { PaymentDialog } from './presentes/PaymentDialog'

// Página pública das listas (casamento e chá de panela). Todo o texto vem do
// painel; o bloqueio é decidido pela API (PageGate mostra a tela "Em breve").
export default function GiftList({ list }: { list: GiftListName }) {
  const [data, setData] = useState<GiftListData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [payments, setPayments] = useState<PaymentConfig | null>(null)
  const [paying, setPaying] = useState<Gift | null>(null)

  const load = useCallback(() => {
    api<GiftListData>(`/listas/${list}`)
      .then(setData)
      .catch(err => setError(err.message))
  }, [list])

  useEffect(() => {
    setData(null)
    load()
    api<PaymentConfig>('/pagamentos/config').then(setPayments, () => setPayments({ enabled: false, publicKey: null }))
  }, [load])

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <Eyebrow>{data?.page.title ?? (list === 'cha' ? 'Chá de Panela' : 'Lista de Presentes')}</Eyebrow>
        {data && <h1 className={styles.title}>{data.page.heading || data.page.title}</h1>}
        {data?.page.intro && <p className={styles.intro}>{data.page.intro}</p>}
      </header>

      <Divider className={styles.divider} />

      {error && <p className={styles.state}>{error}</p>}
      {!data && !error && <p className={styles.state} aria-busy="true">Carregando a lista…</p>}
      {data && data.gifts.length === 0 && (
        <p className={styles.state}>A lista está sendo montada. Volte daqui a pouquinho.</p>
      )}

      {data && data.gifts.length > 0 && (
        <ul className={styles.grid}>
          {data.gifts.map((gift, i) => (
            <GiftItem
              key={gift.id}
              gift={gift}
              index={i}
              canPay={Boolean(payments?.enabled)}
              onGive={() => setPaying(gift)}
            />
          ))}
        </ul>
      )}

      {paying && payments?.publicKey && (
        <PaymentDialog
          gift={paying}
          publicKey={payments.publicKey}
          onClose={paid => {
            setPaying(null)
            if (paid) load()
          }}
        />
      )}
    </div>
  )
}

const STATUS_LABEL = { reservado: 'Reservado', presenteado: 'Presenteado' } as const

function GiftItem({ gift, index, canPay, onGive }: { gift: Gift; index: number; canPay: boolean; onGive: () => void }) {
  const given = gift.status === 'presenteado'

  return (
    <li
      className={[styles.item, given && styles.given].filter(Boolean).join(' ')}
      data-reveal
      style={{ '--reveal-delay': `${(index % 4) * 60}ms` } as CSSProperties}
    >
      <figure className={styles.photo}>
        {gift.imageUrl ? (
          <img src={gift.imageUrl} alt="" loading="lazy" decoding="async" />
        ) : (
          <span className={styles.placeholder}>
            <Sprig strokeWidth={1.2} />
          </span>
        )}
        {gift.status !== 'disponivel' && <figcaption className={styles.badge}>{STATUS_LABEL[gift.status]}</figcaption>}
      </figure>

      <h2 className={styles.name}>{gift.name}</h2>
      {gift.description && <p className={styles.description}>{gift.description}</p>}

      <div className={styles.foot}>
        {gift.priceCents != null && <span className={styles.price}>{formatBRL(gift.priceCents)}</span>}
        {!given && gift.purchaseMode === 'link' && gift.externalUrl && (
          <a className={styles.action} href={gift.externalUrl} target="_blank" rel="noopener noreferrer">
            Ver na loja
            <span className="visually-hidden"> (abre em outra aba)</span>
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path d="M3 9 9 3M4 3h5v5" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          </a>
        )}
        {!given && gift.purchaseMode === 'site' && gift.priceCents != null && gift.status === 'disponivel' &&
          (canPay ? (
            <button type="button" className={styles.action} onClick={onGive}>
              Presentear
            </button>
          ) : (
            <span className={styles.soon}>Pagamento em breve</span>
          ))}
      </div>
    </li>
  )
}

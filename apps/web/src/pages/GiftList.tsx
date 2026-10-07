import { useCallback, useEffect, useMemo, useState, type CSSProperties } from 'react'
import { api, type ChaEvent, type Gift, type GiftListData, type GiftListName, type PaymentConfig } from '../lib/api'
import { formatBRL } from '../lib/money'
import { BananaLeaf, Monstera, PalmFrond, Sprig } from '../design-system/botanicals/Botanicals'
import { Divider, Eyebrow } from '../design-system/components/Ornaments'
import styles from './GiftList.module.css'
import { PaymentDialog } from './presentes/PaymentDialog'
import { ReserveDialog } from './presentes/ReserveDialog'

// Página pública das listas (casamento e chá de panela). Todo o texto vem do
// painel; o bloqueio é decidido pela API (PageGate mostra a tela "Em breve").
export default function GiftList({ list }: { list: GiftListName }) {
  const [data, setData] = useState<GiftListData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [payments, setPayments] = useState<PaymentConfig | null>(null)
  const [paying, setPaying] = useState<Gift | null>(null)
  const [reserving, setReserving] = useState<Gift | null>(null)
  const [query, setQuery] = useState('')

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

  // Busca sem acento: "panela" acha "Panela de pressão".
  const gifts = useMemo(() => {
    const q = normalize(query.trim())
    return !data ? [] : q ? data.gifts.filter(g => normalize(`${g.name} ${g.description}`).includes(q)) : data.gifts
  }, [data, query])

  // Agrupa por cômodo, na ordem definida no painel; sem cômodo vai para "Outros".
  const groups = useMemo(() => {
    if (!data) return []
    const byRoom = data.rooms
      .map(room => ({ id: `comodo-${room.id}`, name: room.name, gifts: gifts.filter(g => g.roomId === room.id) }))
      .filter(g => g.gifts.length > 0)
    const loose = gifts.filter(g => g.roomId == null || !data.rooms.some(r => r.id === g.roomId))
    if (byRoom.length === 0) return [{ id: 'todos', name: '', gifts: loose }]
    return loose.length ? [...byRoom, { id: 'comodo-outros', name: 'Outros', gifts: loose }] : byRoom
  }, [data, gifts])
  const grouped = groups.length > 1 || Boolean(groups[0]?.name)
  const searchable = (data?.gifts.length ?? 0) > 12

  const give = (gift: Gift) => (gift.purchaseMode === 'reserva' ? setReserving(gift) : setPaying(gift))

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <Eyebrow>{data?.page.title ?? (list === 'cha' ? 'Chá de Panela' : 'Lista de Presentes')}</Eyebrow>
        {data && <h1 className={styles.title}>{data.page.heading || data.page.title}</h1>}
        {data?.page.intro && <p className={styles.intro}>{data.page.intro}</p>}
      </header>

      {data?.event && <EventDetails event={data.event} />}

      <Divider className={styles.divider} />

      {error && <p className={styles.state}>{error}</p>}
      {!data && !error && <p className={styles.state} aria-busy="true">Carregando a lista…</p>}
      {data && data.gifts.length === 0 && (
        <p className={styles.state}>A lista está sendo montada. Volte daqui a pouquinho.</p>
      )}

      {searchable && (
        <div className={styles.search}>
          <label htmlFor="busca-presente" className="visually-hidden">
            Buscar um item
          </label>
          <input
            id="busca-presente"
            type="search"
            placeholder="Buscar um item…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            autoComplete="off"
          />
          {query && (
            <p className={styles.searchCount} role="status">
              {gifts.length
                ? `${gifts.length} ${gifts.length === 1 ? 'item encontrado' : 'itens encontrados'}`
                : 'Nenhum item com esse nome.'}
            </p>
          )}
        </div>
      )}

      {data && gifts.length > 0 && grouped && (
        <nav className={styles.rooms} aria-label="Cômodos">
          {groups.map(g => (
            <a key={g.id} href={`#${g.id}`}>
              {g.name}
              <span>{g.gifts.filter(x => x.status === 'disponivel').length}</span>
            </a>
          ))}
        </nav>
      )}

      {groups.map(group => (
        <section key={group.id} id={group.id} className={styles.room} aria-labelledby={grouped ? `${group.id}-t` : undefined}>
          {grouped && (
            <h2 id={`${group.id}-t`} className={styles.roomTitle}>
              {group.name}
            </h2>
          )}
          {/* Cômodo sem nenhuma foto vira lista compacta: centenas de itens não cabem em cards. */}
          <ul className={group.gifts.some(g => g.imageUrl) ? styles.grid : styles.compactList}>
            {group.gifts.map((gift, i) => (
              <GiftItem
                key={gift.id}
                gift={gift}
                index={i}
                compact={!group.gifts.some(g => g.imageUrl)}
                canPay={Boolean(payments?.enabled)}
                onGive={() => give(gift)}
              />
            ))}
          </ul>
        </section>
      ))}

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
      {reserving && (
        <ReserveDialog
          gift={reserving}
          onClose={reserved => {
            setReserving(null)
            if (reserved) load()
          }}
        />
      )}
    </div>
  )
}

/* Data, horário, local e endereço do chá — aparece quando algo foi preenchido. */
function EventDetails({ event }: { event: ChaEvent }) {
  const rows = [
    ['Data', event.date],
    ['Horário', event.time],
    ['Local', event.venue],
    ['Endereço', event.address],
  ].filter(([, v]) => v)
  if (!rows.length) return null
  const map = event.address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([event.venue, event.address].filter(Boolean).join(', '))}`
    : null
  return (
    <section className={styles.event} aria-label="Sobre o chá">
      <dl className={styles.eventFacts}>
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt>{k}</dt>
            <dd>{v}</dd>
          </div>
        ))}
      </dl>
      {map && (
        <a className={styles.mapLink} href={map} target="_blank" rel="noopener noreferrer">
          Abrir no mapa<span className="visually-hidden"> (abre em outra aba)</span>
        </a>
      )}
    </section>
  )
}

// Presente sem foto ganha uma folha e um tom de fundo próprios (pelo id),
// para a grade não virar uma fileira de quadrados iguais.
const PLACEHOLDER_ART = [Monstera, BananaLeaf, PalmFrond, Sprig]
const PLACEHOLDER_TONE = ['toneSand', 'toneBlush', 'tonePaper', 'toneLinen'] as const

const STATUS_LABEL = { reservado: 'Reservado', presenteado: 'Presenteado' } as const

const normalize = (t: string) => t.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()

function GiftItem({
  gift,
  index,
  compact = false,
  canPay,
  onGive,
}: {
  gift: Gift
  index: number
  compact?: boolean
  canPay: boolean
  onGive: () => void
}) {
  const given = gift.status === 'presenteado'

  // Linha compacta: nome à esquerda, botão à direita (a linha inteira é clicável).
  if (compact) {
    const taken = gift.status !== 'disponivel'
    const canGive = gift.purchaseMode === 'reserva' || (gift.purchaseMode === 'site' && canPay && gift.priceCents != null)
    return (
      <li className={[styles.compactItem, taken && styles.taken].filter(Boolean).join(' ')}>
        <div className={styles.compactText}>
          <h3 className={styles.compactName}>{gift.name}</h3>
          {gift.description && <p className={styles.description}>{gift.description}</p>}
          {gift.priceCents != null && <span className={styles.compactPrice}>{formatBRL(gift.priceCents)}</span>}
        </div>
        {taken ? (
          <span className={styles.compactBadge}>{gift.status === 'presenteado' ? 'Presenteado' : 'Reservado'}</span>
        ) : canGive ? (
          <button type="button" className={`${styles.cta} ${styles.ctaSmall}`} onClick={onGive}>
            {gift.purchaseMode === 'reserva' && !gift.hasLink ? 'Eu vou levar' : 'Presentear'}
            <span className="visually-hidden"> {gift.name}</span>
          </button>
        ) : gift.purchaseMode === 'link' && gift.externalUrl ? (
          <a
            className={`${styles.cta} ${styles.ctaSmall} ${styles.ctaOutline}`}
            href={gift.externalUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Ver na loja<span className="visually-hidden"> {gift.name} (abre em outra aba)</span>
          </a>
        ) : (
          <span className={styles.soon}>Em breve</span>
        )}
      </li>
    )
  }


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
          <Placeholder id={gift.id} />
        )}
        {gift.status !== 'disponivel' && <figcaption className={styles.badge}>{STATUS_LABEL[gift.status]}</figcaption>}
      </figure>

      <h2 className={styles.name}>{gift.name}</h2>
      {gift.description && <p className={styles.description}>{gift.description}</p>}

      <div className={styles.foot}>
        {gift.priceCents != null && <span className={styles.price}>{formatBRL(gift.priceCents)}</span>}
        {/* O botão "se estica" sobre o card inteiro: tocar em qualquer lugar presenteia. */}
        {!given && gift.purchaseMode === 'link' && gift.externalUrl && (
          <a className={`${styles.cta} ${styles.ctaOutline}`} href={gift.externalUrl} target="_blank" rel="noopener noreferrer">
            Ver na loja
            <span className="visually-hidden"> {gift.name} (abre em outra aba)</span>
            <svg viewBox="0 0 12 12" aria-hidden="true">
              <path d="M3 9 9 3M4 3h5v5" fill="none" stroke="currentColor" strokeWidth="1.2" />
            </svg>
          </a>
        )}
        {gift.purchaseMode === 'reserva' && gift.status === 'disponivel' && (
          <button type="button" className={styles.cta} onClick={onGive}>
            {gift.hasLink ? 'Presentear' : 'Eu vou levar'}
            <span className="visually-hidden"> {gift.name}</span>
          </button>
        )}
        {!given && gift.purchaseMode === 'site' && gift.priceCents != null && gift.status === 'disponivel' &&
          (canPay ? (
            <button type="button" className={styles.cta} onClick={onGive}>
              Presentear
              <span className="visually-hidden"> {gift.name}</span>
            </button>
          ) : (
            <span className={styles.soon}>Pagamento em breve</span>
          ))}
      </div>
    </li>
  )
}

function Placeholder({ id }: { id: number }) {
  const Art = PLACEHOLDER_ART[id % PLACEHOLDER_ART.length]
  const tone = PLACEHOLDER_TONE[Math.floor(id / PLACEHOLDER_ART.length) % PLACEHOLDER_TONE.length]
  return (
    <span className={`${styles.placeholder} ${styles[tone]}`}>
      <Art strokeWidth={1.2} className={Art === Sprig ? styles.artSprig : styles.art} />
    </span>
  )
}

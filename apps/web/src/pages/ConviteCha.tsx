import { useEffect, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react'
import '@fontsource/great-vibes/400.css'
import '@fontsource/sacramento/400.css'
import { api, type ChaEvent, type ConviteTexts } from '../lib/api'
import { wedding } from '../content/wedding'
import styles from './ConviteCha.module.css'

// Convite digital do Chá de Panela (link que vai no PDF). Fica fora do layout
// do site, como um cartão. Textos e dados vêm do painel (Convite do Chá).

const IMG = '/convite/'
const { first, second } = wedding.couple
const STORAGE = 'convite-cha-confirmado'

/** "Domingo, 06 de dezembro de 2026" → { weekday: Domingo, day: 06, month: dezembro }. */
function splitDate(date: string) {
  const m = date.match(/^\s*([^\d,]+?)\s*,?\s*(\d{1,2})\s+de\s+([^\s\d]+)/i)
  return m ? { weekday: m[1], day: m[2].padStart(2, '0'), month: m[3] } : null
}

/** Trechos entre **asteriscos** ficam em negrito. */
const rich = (text: string) =>
  text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part))

const mapsSearch = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`

export default function ConviteCha() {
  const [data, setData] = useState<{ texts: ConviteTexts; event: ChaEvent } | null>(null)
  const [error, setError] = useState(false)
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    document.title = `Chá de Casa Nova · ${first} & ${second}`
    api<{ texts: ConviteTexts; event: ChaEvent }>('/convite')
      .then(setData)
      .catch(() => setError(true))
  }, [])

  // Link direto para a confirmação: /cha#confirmar
  useEffect(() => {
    if (data && location.hash === '#confirmar') dialog.current?.showModal()
  }, [data])

  if (error) {
    return (
      <div className={styles.fallback}>
        <p>Não conseguimos carregar o convite agora. Tente de novo em instantes.</p>
      </div>
    )
  }
  if (!data) return <div className={styles.fallback} aria-busy="true" />

  const { texts, event } = data
  const d = splitDate(event.date)
  const where = [event.venue, event.address].filter(Boolean).join(' — ')
  const mapsUrl = texts.mapsUrl || (event.address ? mapsSearch(where) : '')
  const openRsvp = () => dialog.current?.showModal()

  return (
    <div className={styles.page}>
      {/* ── Abertura ─────────────────────────────────────────────── */}
      <header className={styles.hero}>
        <img className={`${styles.ilus} ${styles.shelf}`} src={`${IMG}ilus-prateleira.webp`} alt="" />
        <img className={`${styles.ilus} ${styles.bowls}`} src={`${IMG}ilus-tigelas.webp`} alt="" />
        <img className={`${styles.ilus} ${styles.cutleryA}`} src={`${IMG}ilus-talheres.webp`} alt="" />
        <img className={`${styles.ilus} ${styles.grater}`} src={`${IMG}ilus-ralador.webp`} alt="" />
        <img className={`${styles.ilus} ${styles.blender}`} src={`${IMG}ilus-liquidificador.webp`} alt="" />
        <img className={`${styles.ilus} ${styles.kettle}`} src={`${IMG}ilus-chaleira.webp`} alt="" />
        <img className={`${styles.ilus} ${styles.cutleryB}`} src={`${IMG}ilus-talheres.webp`} alt="" />

        <div className={styles.couple}>
          <img className={styles.bride} src={`${IMG}noiva.webp`} alt={second} />
          <img className={styles.groom} src={`${IMG}noivo.webp`} alt={first} />
        </div>

        <p className={styles.kicker}>
          Chá de <span className={styles.casaNova}>casa nova</span>
        </p>
        <h1 className={styles.title}>
          Chá dos Noivos
          <span className={styles.titleNames}>
            {first} e {second}
          </span>
        </h1>
        {texts.intro && <p className={styles.intro}>{texts.intro}</p>}
      </header>

      {/* ── Cartão com a data ───────────────────────────────────── */}
      <section className={styles.arch} aria-label="O convite">
        <div className={styles.card}>
          <p className={styles.cardNames}>
            {first} e {second}
          </p>
          {texts.letter && <p className={styles.letter}>{rich(texts.letter)}</p>}

          <div className={styles.date}>
            {d ? (
              <>
                <span className={styles.dateSide}>{d.weekday}</span>
                <span className={styles.dateDay}>{d.day}</span>
                <span className={styles.dateSide}>{event.time ? `Às ${event.time}` : ''}</span>
                <span className={styles.dateMonth}>{d.month}</span>
              </>
            ) : (
              <span className={styles.dateMonth}>
                {event.date}
                {event.time && ` · ${event.time}`}
              </span>
            )}
          </div>

          <div className={styles.envelope}>
            <img className={styles.envBride} src={`${IMG}noiva.webp`} alt="" loading="lazy" />
            <img className={styles.envGroom} src={`${IMG}noivo.webp`} alt="" loading="lazy" />
            <span className={styles.signature}>
              {first} e {second}
            </span>
          </div>
        </div>
      </section>

      {/* ── Local ───────────────────────────────────────────────── */}
      {(event.venue || event.address) && (
        <section className={styles.location} aria-labelledby="local">
          <PinIcon className={styles.locationPin} />
          <h2 id="local" className={styles.script}>
            Localização
          </h2>
          <address>
            {event.venue && <span>{event.venue}</span>}
            {event.address && <span>{event.address}</span>}
          </address>
        </section>
      )}

      {/* ── Atalhos ─────────────────────────────────────────────── */}
      <section className={styles.actionsWrap} aria-labelledby="acesse">
        <div className={styles.actions}>
          <h2 id="acesse">Acesse as informações abaixo</h2>
          <ul>
            <li>
              <Tile href="/cha-de-panela" label="Lista de Presentes" icon={<GiftIcon />} />
            </li>
            {mapsUrl && (
              <li>
                <Tile href={mapsUrl} external label="Ver Localização" icon={<PinIcon />} />
              </li>
            )}
            <li>
              <Tile onClick={openRsvp} label="Confirmar Presença" icon={<CheckIcon />} />
            </li>
          </ul>
        </div>
      </section>

      {/* ── Fotos ───────────────────────────────────────────────── */}
      <section className={styles.photos} aria-label="Fotos do casal">
        <figure className={`${styles.polaroid} ${styles.p1}`}>
          <img src={`${IMG}foto-1.webp`} alt="" loading="lazy" />
          <figcaption aria-hidden="true">💍</figcaption>
        </figure>
        <figure className={`${styles.polaroid} ${styles.p2}`}>
          <img src={`${IMG}foto-2.webp`} alt="" loading="lazy" />
          <figcaption aria-hidden="true">✨</figcaption>
        </figure>
        <figure className={`${styles.polaroid} ${styles.p3}`}>
          <img src={`${IMG}foto-3.webp`} alt="" loading="lazy" />
          <figcaption aria-hidden="true">💌</figcaption>
        </figure>
      </section>

      {/* ── Endereço da casa nova ───────────────────────────────── */}
      {texts.homeUrl && (
        <section className={styles.home}>
          <p>{texts.homeText}</p>
          <Tile href={texts.homeUrl} external label="Ver Endereço" icon={<PinIcon />} />
        </section>
      )}

      {/* ── Fecho ───────────────────────────────────────────────── */}
      <section className={styles.banner} aria-label={`${first} e ${second}`}>
        <img className={styles.bannerBride} src={`${IMG}noiva.webp`} alt="" loading="lazy" />
        <div className={styles.bannerText}>
          <p className={styles.kicker}>
            Chá de <span className={`${styles.casaNova} ${styles.neon}`}>casa nova</span>
          </p>
          <p className={styles.bannerNames}>
            {first}
            <span className={styles.amp}>&amp;</span>
            <br />
            {second}
          </p>
        </div>
        <img className={styles.bannerGroom} src={`${IMG}noivo.webp`} alt="" loading="lazy" />
      </section>

      {texts.verse && (
        <blockquote className={styles.verse}>
          <p>“{texts.verse}”</p>
          {texts.verseRef && <cite>{texts.verseRef}</cite>}
        </blockquote>
      )}

      <footer className={styles.closing}>
        <p>{texts.closing}</p>
        <button type="button" className={styles.closingButton} onClick={openRsvp}>
          Confirmar presença
        </button>
      </footer>

      <RsvpDialog ref={dialog} note={texts.rsvpNote} />
    </div>
  )
}

/* ── Botão quadrado marrom com ícone ─────────────────────────────────── */
function Tile({ href, external, onClick, label, icon }: { href?: string; external?: boolean; onClick?: () => void; label: string; icon: ReactNode }) {
  const inner = (
    <>
      <span className={styles.tileIcon}>{icon}</span>
      <span className={styles.tileLabel}>{label}</span>
    </>
  )
  if (href) {
    return (
      <a className={styles.tile} href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
        {inner}
      </a>
    )
  }
  return (
    <button type="button" className={styles.tile} onClick={onClick}>
      {inner}
    </button>
  )
}

/* ── Confirmação de presença ─────────────────────────────────────────── */
function RsvpDialog({ ref, note }: { ref: RefObject<HTMLDialogElement | null>; note: string }) {
  const [attending, setAttending] = useState<boolean | null>(null)
  const [name, setName] = useState('')
  const [people, setPeople] = useState(1)
  const [phone, setPhone] = useState('')
  const [message, setMessage] = useState('')
  const [website, setWebsite] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string>()
  const [done, setDone] = useState<{ name: string; attending: boolean } | null>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE) ?? 'null')
    } catch {
      return null
    }
  })

  const close = () => {
    ref.current?.close()
    if (location.hash === '#confirmar') history.replaceState(null, '', location.pathname)
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (attending === null) return setError('Conta pra gente: você vai?')
    if (name.trim().length < 2) return setError('Escreva seu nome, por favor.')
    setError(undefined)
    setSending(true)
    try {
      await api('/convite/presenca', {
        body: {
          name: name.trim(),
          attending,
          ...(attending ? { people } : {}),
          ...(phone.trim() ? { phone: phone.trim() } : {}),
          ...(message.trim() ? { message: message.trim() } : {}),
          ...(website ? { website } : {}),
        },
      })
      const result = { name: name.trim(), attending }
      setDone(result)
      try {
        localStorage.setItem(STORAGE, JSON.stringify(result))
      } catch {
        /* sem armazenamento: tudo bem */
      }
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSending(false)
    }
  }

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="rsvp-title"
      onClick={e => e.target === e.currentTarget && close()}
      onClose={() => location.hash === '#confirmar' && history.replaceState(null, '', location.pathname)}
    >
      <div className={styles.sheet}>
        <button type="button" className={styles.closeX} onClick={close} aria-label="Fechar">
          ×
        </button>

        {done ? (
          <div className={styles.thanks} role="status">
            <CheckIcon />
            <h2 id="rsvp-title">{done.attending ? `Oba, ${done.name.split(' ')[0]}!` : `Obrigado por avisar, ${done.name.split(' ')[0]}`}</h2>
            <p>{done.attending ? 'Sua presença está confirmada. Mal podemos esperar!' : 'Vamos sentir sua falta. Obrigado pelo carinho!'}</p>
            <div className={styles.formActions}>
              <button type="button" className={styles.primary} onClick={close}>
                Voltar ao convite
              </button>
              <button
                type="button"
                className={styles.link}
                onClick={() => {
                  setDone(null)
                  setAttending(null)
                  setName('')
                  setPeople(1)
                  setPhone('')
                  setMessage('')
                }}
              >
                Confirmar outra pessoa
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} noValidate>
            <h2 id="rsvp-title" className={styles.script}>
              Confirmar presença
            </h2>
            {note && <p className={styles.note}>{note}</p>}

            <fieldset className={styles.choice}>
              <legend className="visually-hidden">Você vai?</legend>
              <label>
                <input type="radio" name="vai" checked={attending === true} onChange={() => setAttending(true)} />
                <span>Vou sim!</span>
              </label>
              <label>
                <input type="radio" name="vai" checked={attending === false} onChange={() => setAttending(false)} />
                <span>Não vou conseguir</span>
              </label>
            </fieldset>

            <label className={styles.field}>
              <span>Seu nome</span>
              <input value={name} onChange={e => setName(e.target.value)} autoComplete="name" maxLength={120} required />
            </label>

            {attending && (
              <div className={styles.field}>
                <span id="qtd">Quantas pessoas vêm, contando você?</span>
                <div className={styles.stepper} role="group" aria-labelledby="qtd">
                  <button type="button" onClick={() => setPeople(p => Math.max(1, p - 1))} disabled={people <= 1} aria-label="Menos uma pessoa">
                    −
                  </button>
                  <output aria-live="polite">{people}</output>
                  <button type="button" onClick={() => setPeople(p => Math.min(20, p + 1))} disabled={people >= 20} aria-label="Mais uma pessoa">
                    +
                  </button>
                </div>
              </div>
            )}

            <label className={styles.field}>
              <span>
                Telefone <small>(opcional)</small>
              </span>
              <input value={phone} onChange={e => setPhone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" maxLength={30} />
            </label>

            <label className={styles.field}>
              <span>
                Um recadinho <small>(opcional)</small>
              </span>
              <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3} maxLength={600} />
            </label>

            {/* Campo invisível contra robôs. */}
            <input className={styles.trap} tabIndex={-1} autoComplete="off" aria-hidden="true" value={website} onChange={e => setWebsite(e.target.value)} />

            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}
            <div className={styles.formActions}>
              <button type="submit" className={styles.primary} disabled={sending}>
                {sending ? 'Enviando…' : 'Enviar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </dialog>
  )
}

/* ── Ícones ──────────────────────────────────────────────────────────── */
function GiftIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 15c-2-5-9-9-11-5s5 5 11 5Zm0 0c2-5 9-9 11-5s-5 5-11 5Z" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M8 17h15v7H8zM25 17h15v7H25zM10 26h13v14H10zM25 26h13v14H25z" fill="currentColor" />
    </svg>
  )
}
function PinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className={className}>
      <path d="M24 4c-8.3 0-15 6.5-15 14.6C9 29.5 24 44 24 44s15-14.5 15-25.4C39 10.5 32.3 4 24 4Zm0 20a5.6 5.6 0 1 1 0-11.2A5.6 5.6 0 0 1 24 24Z" fill="currentColor" />
    </svg>
  )
}
function CheckIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true">
      <path d="M7 26c4-1 7 3 11 9 5-11 13-21 24-27-9 8-16 18-21 31-2 2-4 2-5 0-3-5-6-9-9-13Z" fill="currentColor" />
    </svg>
  )
}

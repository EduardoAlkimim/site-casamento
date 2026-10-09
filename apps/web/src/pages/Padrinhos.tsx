import { useEffect, useState, type CSSProperties } from 'react'
import { api, type ManualSection, type Padrinho } from '../lib/api'
import { useAccess } from '../lib/access'
import { wedding } from '../content/wedding'
import { Monstera, Sprig } from '../design-system/botanicals/Botanicals'
import { LockScreen } from '../design-system/components/LockScreen'
import { Divider, Eyebrow } from '../design-system/components/Ornaments'
import styles from './Padrinhos.module.css'

// Manual dos Padrinhos — versão digital do PDF dos noivos. Cada pessoa vê a
// parte que é sua: madrinha (vestido e paleta), padrinho (terno), casal (ambas).

const EYEBROW = { madrinha: 'Manual da Madrinha', padrinho: 'Manual do Padrinho', casal: 'Manual dos Padrinhos' } as const

function greeting(p: Padrinho) {
  if (p.role === 'casal') return { word: 'Queridos', name: p.name.replace(/\s+e\s+/i, ' & ') }
  // Nome inteiro: "João Vitor" e "Ana Clara" são o nome da pessoa, não nome + sobrenome.
  return { word: p.role === 'madrinha' ? 'Querida' : 'Querido', name: p.name.trim() }
}

export default function Padrinhos() {
  const { padrinho, admin, ready, site } = useAccess()
  const [sections, setSections] = useState<ManualSection[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const allowed = Boolean(padrinho || admin)

  useEffect(() => {
    if (!allowed) return
    api<{ padrinho: Padrinho | null; sections: ManualSection[] }>('/padrinhos/manual')
      .then(data => setSections(data.sections))
      .catch(err => setError(err.message))
  }, [allowed])

  if (!ready) return <div style={{ minHeight: '86dvh' }} aria-busy="true" />

  if (!allowed) {
    return (
      <LockScreen eyebrow="Só para padrinhos" title="Manual do Padrinho">
        <p>Esta página abre pela tag que vocês receberam. É só aproximar o celular dela.</p>
      </LockScreen>
    )
  }

  const g = padrinho ? greeting(padrinho) : null
  const [day, month, year] = wedding.dateShort.split('·').map(s => s.trim())

  return (
    <article className={styles.page}>
      <header className={styles.letter}>
        <Monstera className={styles.leaf} draw strokeWidth={1} />
        <Eyebrow>{padrinho ? EYEBROW[padrinho.role] : 'Prévia do manual (todos os blocos)'}</Eyebrow>
        <h1 className={styles.greeting}>
          {g ? (
            <>
              {g.word} <em>{g.name},</em>
            </>
          ) : (
            <>
              Manual dos <em>Padrinhos</em>
            </>
          )}
        </h1>
        {padrinho?.personalMessage && <p className={styles.message}>{padrinho.personalMessage}</p>}
        {padrinho && (
          <p className={styles.signature}>
            — {wedding.couple.second} <span>&amp;</span> {wedding.couple.first}
          </p>
        )}
      </header>

      {/* Save the date, como no cartão 3 do manual impresso. */}
      <section className={styles.date} aria-label="A data">
        <p className={styles.saveThe}>
          Save <em>the</em> date
        </p>
        <p className={styles.dateBig}>
          {day}.{month}.{year}
        </p>
        <p className={styles.dateTime}>Às {site.ceremonyTime}</p>
        <p className={styles.dateWhere}>
          {site.venue}
          <br />
          {site.city}
        </p>
      </section>

      <Divider />

      {error && <p className={styles.error}>{error}</p>}
      {!sections && !error && <p className={styles.loading}>Carregando…</p>}
      {sections?.map((s, i) => (
        <Block key={s.id} section={s} index={i} />
      ))}

      <footer className={styles.closing}>
        <Sprig className={styles.closingSprig} strokeWidth={1.1} />
        <p>
          {wedding.couple.second} <span>&amp;</span> {wedding.couple.first}
        </p>
      </footer>
    </article>
  )
}

const lines = (body: string) => body.split('\n').map(l => l.trim()).filter(Boolean)

function Block({ section: s, index }: { section: ManualSection; index: number }) {
  return (
    <section className={styles.block} aria-labelledby={`m-${s.id}`} data-reveal>
      <h2 id={`m-${s.id}`} className={styles.blockTitle}>
        {s.title}
      </h2>

      {s.kind === 'agenda' ? (
        <ol className={styles.agenda}>
          {lines(s.body).map((l, i) => {
            const [time, ...rest] = l.split('|')
            const hasTime = rest.length > 0
            return (
              <li key={i}>
                {hasTime && <span className={styles.agendaTime}>{time.trim()}</span>}
                <span className={styles.agendaWhat}>{hasTime ? rest.join('|').trim() : l}</span>
              </li>
            )
          })}
        </ol>
      ) : s.kind === 'dicas' ? (
        <ul className={styles.tips}>
          {lines(s.body).map((l, i) => (
            <li key={i}>
              <TipIcon index={i} />
              <span>{l}</span>
            </li>
          ))}
        </ul>
      ) : (
        <div className={styles.text}>
          {lines(s.body).map((l, i) => (
            <p key={i}>{l}</p>
          ))}
        </div>
      )}

      {s.kind === 'paleta' && s.colors.length > 0 && (
        <ul className={styles.palette} aria-label={`Paleta sugerida com ${s.colors.length} cores`}>
          {s.colors.map((c, i) => (
            <li key={i} style={{ '--swatch': c, '--i': i } as CSSProperties} title={c} />
          ))}
        </ul>
      )}

      {s.imageUrl && <img className={styles.illustration} src={s.imageUrl} alt="" loading="lazy" decoding="async" />}
      <span className={styles.blockNum} aria-hidden="true">
        {['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][index]}
      </span>
    </section>
  )
}

/* Ícones finos para as "últimas dicas" (relógio, taças, globo espelhado, câmera). */
function TipIcon({ index }: { index: number }) {
  const paths = [
    <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
    <><path d="M7 3.5h4l-.5 5a2.5 2.5 0 0 1-5 0Z" /><path d="M8.5 11v7M6.5 18.5h4" /><path d="M13 3.5h4l.5 5a2.5 2.5 0 0 1-5 0Z" transform="translate(1 1) rotate(12 15 6)" /><path d="M16 12.5v6.5M14 19.5h4" /></>,
    <><circle cx="12" cy="13" r="7" /><path d="M5 13h14M12 6c2.2 2 2.2 12 0 14M12 6c-2.2 2-2.2 12 0 14M6.5 9.5h11M6.5 16.5h11M12 3v3" /></>,
    <><rect x="3.5" y="7" width="17" height="12" rx="2" /><circle cx="12" cy="13" r="3.5" /><path d="M8.5 7l1.5-2.5h4L15.5 7" /></>,
  ]
  return (
    <svg className={styles.tipIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[index % paths.length]}
    </svg>
  )
}

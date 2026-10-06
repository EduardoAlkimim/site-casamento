import { useEffect, useState, type CSSProperties } from 'react'
import { api, type InfoBlock, type PageText } from '../lib/api'
import { Divider, Eyebrow } from '../design-system/components/Ornaments'
import styles from './Informacoes.module.css'

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']

const mapLink = (b: InfoBlock) =>
  b.mapUrl || (b.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(b.address)}` : null)

export default function Informacoes() {
  const [data, setData] = useState<{ page: PageText; blocks: InfoBlock[] } | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<{ page: PageText; blocks: InfoBlock[] }>('/informacoes')
      .then(setData)
      .catch(err => setError(err.message))
  }, [])

  const highlights = data?.blocks.filter(b => b.kind === 'destaque') ?? []
  const faq = data?.blocks.filter(b => b.kind === 'faq') ?? []

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <Eyebrow>{data?.page.title ?? 'Informações'}</Eyebrow>
        <h1 className={styles.title}>{data?.page.heading || 'Informações'}</h1>
        {data?.page.intro && <p className={styles.intro}>{data.page.intro}</p>}
      </header>

      {error && <p className={styles.state}>{error}</p>}
      {!data && !error && <p className={styles.state} aria-busy="true">Carregando…</p>}

      {highlights.length > 0 && (
        <ol className={styles.blocks}>
          {highlights.map((b, i) => {
            const map = mapLink(b)
            return (
              <li key={b.id} className={styles.block} data-reveal style={{ '--reveal-delay': '60ms' } as CSSProperties}>
                <div className={styles.blockHead}>
                  <span className={styles.num} aria-hidden="true">{ROMAN[i]}</span>
                  <h2 className={styles.blockTitle}>{b.title}</h2>
                </div>
                <div className={styles.blockBody}>
                  {b.subtitle && <p className={styles.subtitle}>{b.subtitle}</p>}
                  {b.body && <p className={styles.text}>{b.body}</p>}
                  {b.address && <p className={styles.address}>{b.address}</p>}
                  {map && (
                    <a className={styles.mapLink} href={map} target="_blank" rel="noopener noreferrer">
                      Abrir no mapa
                      <span className="visually-hidden"> (abre em outra aba)</span>
                      <svg viewBox="0 0 12 12" aria-hidden="true">
                        <path d="M3 9 9 3M4 3h5v5" fill="none" stroke="currentColor" strokeWidth="1" />
                      </svg>
                    </a>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {faq.length > 0 && (
        <section className={styles.faq} aria-labelledby="faq-title" data-reveal>
          <Divider />
          <h2 id="faq-title" className={styles.faqTitle}>
            Perguntas <em>frequentes</em>
          </h2>
          <div className={styles.faqList}>
            {faq.map(q => (
              <details key={q.id} className={styles.question}>
                <summary>
                  <span>{q.title}</span>
                  <span className={styles.plus} aria-hidden="true" />
                </summary>
                <p className={styles.answer}>{q.body}</p>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

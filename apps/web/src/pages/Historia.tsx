import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { api, type PageText, type StoryMoment } from '../lib/api'
import { wedding } from '../content/wedding'
import { Monstera, PalmFrond } from '../design-system/botanicals/Botanicals'
import { ButtonLink } from '../design-system/components/Button'
import { Countdown } from '../design-system/components/Countdown'
import { Eyebrow } from '../design-system/components/Ornaments'
import styles from './Historia.module.css'

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII']

// Nossa História: narrativa que se desenha com a rolagem. Uma linha verde
// cresce acompanhando a leitura; cada capítulo alcançado faz uma folha abrir.
export default function Historia() {
  const [data, setData] = useState<{ page: PageText; moments: StoryMoment[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const journeyRef = useRef<HTMLOListElement>(null)

  useEffect(() => {
    api<{ page: PageText; moments: StoryMoment[] }>('/historia')
      .then(setData)
      .catch(err => setError(err.message))
  }, [])

  // Progresso da linha (0 → 1) e capítulos alcançados, a partir da rolagem.
  useEffect(() => {
    const list = journeyRef.current
    if (!list) return
    let frame = 0
    const update = () => {
      frame = 0
      const rect = list.getBoundingClientRect()
      const anchor = window.innerHeight * 0.62
      const progress = Math.min(1, Math.max(0, (anchor - rect.top) / rect.height))
      list.style.setProperty('--progress', progress.toFixed(4))
      list.querySelectorAll<HTMLElement>('[data-chapter]').forEach(el => {
        el.toggleAttribute('data-reached', el.getBoundingClientRect().top < anchor)
      })
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [data])

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <Monstera className={styles.heroLeaf} draw strokeWidth={1} />
        <Eyebrow>{data?.page.title ?? 'Nossa História'}</Eyebrow>
        <h1 className={styles.title}>{data?.page.heading || 'Nossa História'}</h1>
        {data?.page.intro && <p className={styles.intro}>{data.page.intro}</p>}
        <p className={styles.scrollHint} aria-hidden="true">
          <span />
          Role para começar
        </p>
      </header>

      {error && <p className={styles.state}>{error}</p>}
      {!data && !error && <p className={styles.state} aria-busy="true">Abrindo o álbum…</p>}

      {data && (
        <ol className={styles.journey} ref={journeyRef} aria-label="Capítulos da nossa história">
          {data.moments.map((m, i) =>
            m.imageUrl ? (
              <Chapter key={m.id} moment={m} index={i} />
            ) : (
              <Finale key={m.id} moment={m} index={i} />
            ),
          )}
        </ol>
      )}
    </div>
  )
}

function Chapter({ moment, index }: { moment: StoryMoment; index: number }) {
  const side = index % 2 === 0 ? styles.left : styles.right
  return (
    <li className={`${styles.chapter} ${side}`} data-chapter>
      <span className={styles.marker} aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M12 21C6 15 6 8 12 3c6 5 6 12 0 18Z" />
          <path d="M12 21V8" />
        </svg>
      </span>
      <span className={styles.numeral} aria-hidden="true">{ROMAN[index]}</span>

      <figure className={styles.photo} data-reveal>
        <img src={moment.imageUrl!} alt="" loading="lazy" decoding="async" />
      </figure>

      <div className={styles.text} data-reveal style={{ '--reveal-delay': '120ms' } as CSSProperties}>
        {moment.dateLabel && <p className={styles.date}>{moment.dateLabel}</p>}
        <h2 className={styles.chapterTitle}>{moment.title}</h2>
        {moment.body && <p className={styles.body}>{moment.body}</p>}
      </div>
    </li>
  )
}

/* Capítulo sem foto: o que ainda vamos viver. Fecha com a contagem. */
function Finale({ moment, index }: { moment: StoryMoment; index: number }) {
  return (
    <li className={styles.finale} data-chapter>
      <span className={styles.marker} aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M12 21C6 15 6 8 12 3c6 5 6 12 0 18Z" />
          <path d="M12 21V8" />
        </svg>
      </span>
      <div className={styles.finaleInner} data-reveal>
        <PalmFrond className={styles.finaleLeaf} draw strokeWidth={1.1} />
        <span className={styles.numeralInline} aria-hidden="true">{ROMAN[index]}</span>
        {moment.dateLabel && <p className={styles.date}>{moment.dateLabel}</p>}
        <h2 className={styles.finaleTitle}>{moment.title}</h2>
        {moment.body && <p className={styles.finaleBody}>{moment.body}</p>}
        <Countdown date={wedding.date} className={styles.countdown} />
        <ButtonLink to="/informacoes" variant="outline">
          Ver informações
        </ButtonLink>
      </div>
    </li>
  )
}

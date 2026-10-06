import type { CSSProperties } from 'react'
import { Link } from 'react-router'
import { navigation, padrinhosNav, wedding } from '../content/wedding'
import { slugOf, useAccess } from '../lib/access'
import { BananaLeaf, PalmFrond } from '../design-system/botanicals/Botanicals'
import { ButtonLink } from '../design-system/components/Button'
import { Countdown } from '../design-system/components/Countdown'
import { DividerDot, Eyebrow } from '../design-system/components/Ornaments'
import styles from './Home.module.css'

const ROMAN = ['II', 'III', 'IV', 'V', 'VI', 'VII']

export default function Home() {
  const { couple, heroPhoto } = wedding
  const { pages: access, padrinho, admin, site, ready } = useAccess()
  const pages = [...navigation.filter(item => item.to !== '/'), ...(padrinho || admin ? [padrinhosNav] : [])]

  return (
    <>
      <section className={styles.hero} aria-labelledby="casal">
        <div className={styles.heroText}>
          <p className={styles.date}>{wedding.dateLong}</p>
          <h1 id="casal" className={styles.names}>
            <span className={styles.first}>{couple.first}</span>
            <span className={styles.amp} aria-hidden="true">&amp;</span>
            <span className="visually-hidden"> e </span>
            <span className={styles.second}>{couple.second}</span>
          </h1>
          <p className={`${styles.phrase} ${styles.phraseDesktop}`} data-ready={ready || undefined}>{site.phrase}</p>
        </div>

        <div className={styles.heroArt}>
          <BananaLeaf className={styles.banana} draw delay={500} strokeWidth={1.1} />
          <PalmFrond className={styles.palm} draw delay={900} strokeWidth={1.1} />
          <figure className={styles.arch}>
            <img
              src={heroPhoto.src}
              alt={heroPhoto.alt}
              width={1333}
              height={2000}
              fetchPriority="high"
              style={{ objectPosition: heroPhoto.position }}
            />
          </figure>
        </div>

        <p className={`${styles.phrase} ${styles.phraseMobile}`} data-ready={ready || undefined}>{site.phrase}</p>
      </section>

      <section className={styles.countdown} aria-label="Contagem regressiva" data-reveal>
        <DividerDot />
        <Countdown date={wedding.date} />
        <DividerDot />
      </section>

      <section className={styles.details} aria-labelledby="o-dia">
        <div data-reveal className={styles.detailsIntro}>
          <Eyebrow index="—">O dia</Eyebrow>
          <h2 id="o-dia" className={styles.detailsTitle}>
            {site.dayTitle}
            <br />
            <em>{site.dayTitleEm}</em>
          </h2>
        </div>
        <div data-reveal className={styles.detailsFacts} style={{ '--reveal-delay': '120ms' } as CSSProperties}>
          <dl className={styles.facts}>
            <div>
              <dt>Cerimônia</dt>
              <dd>{site.ceremonyTime}</dd>
            </div>
            <div>
              <dt>Local</dt>
              <dd>{site.venue}</dd>
            </div>
            <div>
              <dt>Cidade</dt>
              <dd>{site.city}</dd>
            </div>
          </dl>
        </div>
        <div data-reveal className={styles.detailsMore} style={{ '--reveal-delay': '180ms' } as CSSProperties}>
          <ButtonLink to="/informacoes" variant="quiet">
            Todas as informações
          </ButtonLink>
        </div>
      </section>

      <section className={styles.index} aria-labelledby="neste-site">
        <div data-reveal>
          <Eyebrow>Neste site</Eyebrow>
          <h2 id="neste-site" className="visually-hidden">Páginas do site</h2>
        </div>
        <ol className={styles.indexList}>
          {pages.map((item, i) => (
            <li key={item.to} data-reveal style={{ '--reveal-delay': `${i * 60}ms` } as CSSProperties}>
              <Link to={item.to} className={styles.indexLink}>
                <span className={styles.indexNum} aria-hidden="true">{ROMAN[i]}</span>
                <span className={styles.indexLabel}>{item.label}</span>
                <span className={styles.indexHint}>{access[slugOf(item.to)]?.locked ? 'Em breve' : item.hint}</span>
                <svg className={styles.arrow} viewBox="0 0 32 12" aria-hidden="true">
                  <path d="M0 6h30M25 1l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1" />
                </svg>
              </Link>
            </li>
          ))}
        </ol>
      </section>
    </>
  )
}

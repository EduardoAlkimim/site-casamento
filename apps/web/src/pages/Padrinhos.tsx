import { useEffect, useState } from 'react'
import { api, type ManualSection, type Padrinho } from '../lib/api'
import { useAccess } from '../lib/access'
import { wedding } from '../content/wedding'
import { Monstera } from '../design-system/botanicals/Botanicals'
import { LockScreen } from '../design-system/components/LockScreen'
import { Divider, Eyebrow } from '../design-system/components/Ornaments'
import styles from './Padrinhos.module.css'

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']

export default function Padrinhos() {
  const { padrinho, admin, ready } = useAccess()
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

  const isMadrinha = padrinho?.role === 'madrinha'
  const firstName = padrinho?.name.split(' ')[0]

  return (
    <article className={styles.page}>
      <header className={styles.letter}>
        <Monstera className={styles.leaf} draw strokeWidth={1} />
        <Eyebrow>{isMadrinha ? 'Manual da Madrinha' : 'Manual do Padrinho'}</Eyebrow>
        <h1 className={styles.greeting}>
          {padrinho ? (
            <>
              {isMadrinha ? 'Querida' : 'Querido'} <em>{firstName},</em>
            </>
          ) : (
            <>
              Prévia <em>do manual</em>
            </>
          )}
        </h1>
        {padrinho?.personalMessage && <p className={styles.message}>{padrinho.personalMessage}</p>}
        {padrinho && (
          <p className={styles.signature}>
            — {wedding.couple.first} <span>&amp;</span> {wedding.couple.second}
          </p>
        )}
      </header>

      <Divider />

      <section className={styles.manual} aria-label="Manual">
        {error && <p className={styles.error}>{error}</p>}
        {!sections && !error && <p className={styles.loading}>Carregando…</p>}
        {sections && (
          <ol className={styles.sections}>
            {sections.map((s, i) => (
              <li key={s.id} data-reveal>
                <span className={styles.num} aria-hidden="true">{ROMAN[i]}</span>
                <h2 className={styles.sectionTitle}>{s.title}</h2>
                <p className={styles.body}>{s.body}</p>
              </li>
            ))}
          </ol>
        )}
      </section>
    </article>
  )
}

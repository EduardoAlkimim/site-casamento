import type { ReactNode } from 'react'
import { useAccess } from '../../lib/access'
import { Sprig } from '../botanicals/Botanicals'
import { ButtonLink } from './Button'
import { Eyebrow } from './Ornaments'
import styles from './LockScreen.module.css'

/** Cadeado em arco — a mesma forma da moldura das fotos. */
function ArchLock() {
  return (
    <svg className={styles.lock} viewBox="0 0 48 60" fill="none" stroke="currentColor" strokeWidth="1" aria-hidden="true">
      <path d="M12 26v-8a12 12 0 0 1 24 0v8" />
      <path d="M6 58V34a10 10 0 0 1 10-10h16a10 10 0 0 1 10 10v24z" />
      <circle cx="24" cy="40" r="3" />
      <path d="M24 43v6" />
    </svg>
  )
}

type LockScreenProps = { eyebrow: string; title: string; children: ReactNode; action?: ReactNode }

export function LockScreen({ eyebrow, title, children, action }: LockScreenProps) {
  return (
    <section className={styles.screen}>
      <ArchLock />
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className={styles.title}>{title}</h1>
      <div className={styles.text}>{children}</div>
      <Sprig className={styles.sprig} strokeWidth={1.1} />
      {action ?? (
        <ButtonLink to="/" variant="outline">
          Voltar ao início
        </ButtonLink>
      )}
    </section>
  )
}

/**
 * Envolve uma página bloqueável. O bloqueio de verdade é feito pela API
 * (o conteúdo nem é entregue); aqui é a tela que o convidado vê.
 */
export function PageGate({ slug, children }: { slug: string; children: ReactNode }) {
  const { pages, admin, ready } = useAccess()
  const page = pages[slug]

  if (!ready) return <div className={styles.pending} aria-busy="true" />

  if (page?.locked && !admin) {
    return (
      <LockScreen eyebrow="Em breve" title={page.title}>
        <p>{page.lockMessage || 'Ainda estamos preparando esta parte com carinho. Assim que estiver pronta, ela abre aqui.'}</p>
      </LockScreen>
    )
  }

  return (
    <>
      {page?.locked && admin && (
        <p className={styles.adminNote} role="status">
          Bloqueada para convidados — você está vendo porque entrou no painel.
        </p>
      )}
      {children}
    </>
  )
}

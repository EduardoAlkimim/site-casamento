import type { ReactNode } from 'react'
import { Sprig } from '../botanicals/Botanicals'
import styles from './Ornaments.module.css'

/** Divisor: linha fina — raminho — linha fina. */
export function Divider({ className }: { className?: string }) {
  return (
    <div className={[styles.divider, className].filter(Boolean).join(' ')} role="presentation">
      <span className={styles.rule} />
      <Sprig className={styles.sprig} strokeWidth={1.1} />
      <span className={styles.rule} />
    </div>
  )
}

/** Divisor mínimo: losango dourado entre duas linhas. */
export function DividerDot({ className }: { className?: string }) {
  return (
    <div className={[styles.divider, className].filter(Boolean).join(' ')} role="presentation">
      <span className={styles.rule} />
      <span className={styles.diamond} />
      <span className={styles.rule} />
    </div>
  )
}

/** Rótulo de seção em caixa alta, com número romano opcional. */
export function Eyebrow({ index, children }: { index?: string; children: ReactNode }) {
  return (
    <p className={styles.eyebrow}>
      {index && <span className={styles.index} aria-hidden="true">{index}</span>}
      {children}
    </p>
  )
}

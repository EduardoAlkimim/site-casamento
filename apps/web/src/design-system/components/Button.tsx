import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'
import styles from './Button.module.css'

type Variant = 'primary' | 'outline' | 'quiet'

const cls = (variant: Variant, className?: string) =>
  [styles.button, styles[variant], className].filter(Boolean).join(' ')

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  loading?: boolean
  children: ReactNode
}

export function Button({ variant = 'primary', loading, disabled, className, children, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      className={cls(variant, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <span className={styles.spinner} aria-hidden="true" />}
      <span>{children}</span>
    </button>
  )
}

type ButtonLinkProps = LinkProps & { variant?: Variant }

export function ButtonLink({ variant = 'primary', className, children, ...rest }: ButtonLinkProps) {
  return (
    <Link className={cls(variant, className)} {...rest}>
      <span>{children}</span>
    </Link>
  )
}

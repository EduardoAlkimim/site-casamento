import styles from './Switch.module.css'

type SwitchProps = {
  checked: boolean
  onChange: (next: boolean) => void
  label: string
  disabled?: boolean
}

/** Interruptor acessível (role="switch"). O rótulo fica visível ao lado. */
export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      className={styles.switch}
      onClick={() => onChange(!checked)}
    >
      <span className={styles.thumb} />
    </button>
  )
}

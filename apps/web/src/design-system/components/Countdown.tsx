import { useCountdown } from '../../lib/useCountdown'
import styles from './Countdown.module.css'

const pad = (n: number) => String(n).padStart(2, '0')

/** Contagem editorial: o número de dias em destaque; horas, minutos e segundos em nota. */
export function Countdown({ date, className }: { date: string; className?: string }) {
  const { days, hours, minutes, seconds, done } = useCountdown(date)

  if (done) {
    return (
      <p className={[styles.countdown, className].filter(Boolean).join(' ')}>
        <span className={styles.days}>Hoje</span>
        <span className={styles.unit}>é o grande dia</span>
      </p>
    )
  }

  return (
    <div className={[styles.countdown, className].filter(Boolean).join(' ')}>
      <p className={styles.lead}>Faltam</p>
      <p className={styles.main}>
        <span className={styles.days}>{days}</span>
        <span className={styles.unit}>{days === 1 ? 'dia' : 'dias'}</span>
      </p>
      {/* Os segundos mudam o tempo todo: só os olhos precisam deles. */}
      <p className={styles.clock} aria-hidden="true">
        <span>{pad(hours)}<small>h</small></span>
        <span className={styles.sep} />
        <span>{pad(minutes)}<small>min</small></span>
        <span className={styles.sep} />
        <span>{pad(seconds)}<small>s</small></span>
      </p>
    </div>
  )
}

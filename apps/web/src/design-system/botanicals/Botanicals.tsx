import type { CSSProperties, ReactNode } from 'react'
import { bananaLeaf, monstera, palmFrond, sprig } from './geometry'
import styles from './Botanicals.module.css'

const PALM = palmFrond()
const BANANA = bananaLeaf()
const MONSTERA = monstera()
const SPRIG = sprig()

type BotanicalProps = {
  className?: string
  /** Desenha o traço ao montar (respeita prefers-reduced-motion). */
  draw?: boolean
  /** Atraso do desenho, em ms. */
  delay?: number
  strokeWidth?: number
}

function Svg({
  viewBox,
  className,
  draw,
  delay = 0,
  strokeWidth = 1.2,
  children,
}: BotanicalProps & { viewBox: string; children: ReactNode }) {
  return (
    <svg
      viewBox={viewBox}
      className={[styles.botanical, className].filter(Boolean).join(' ')}
      data-draw={draw || undefined}
      style={{ '--draw-delay': `${delay}ms` } as CSSProperties}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

const paths = (list: string[]) => list.map((d, i) => <path key={i} d={d} pathLength={1} />)

export function PalmFrond(props: BotanicalProps) {
  return <Svg viewBox={PALM.viewBox} {...props}>{paths(PALM.paths)}</Svg>
}

export function BananaLeaf(props: BotanicalProps) {
  return (
    <Svg viewBox={BANANA.viewBox} {...props}>
      {paths(BANANA.paths)}
      <g className={styles.veins}>{paths(BANANA.veins)}</g>
    </Svg>
  )
}

export function Monstera(props: BotanicalProps) {
  return (
    <Svg viewBox={MONSTERA.viewBox} {...props}>
      {paths(MONSTERA.paths)}
      <g className={styles.holes}>
        {MONSTERA.holes.map((h, i) => (
          <ellipse key={i} cx={h.cx} cy={h.cy} rx={h.rx} ry={h.ry} transform={`rotate(${h.rot} ${h.cx} ${h.cy})`} />
        ))}
      </g>
    </Svg>
  )
}

export function Sprig(props: BotanicalProps) {
  return <Svg viewBox={SPRIG.viewBox} {...props}>{paths(SPRIG.paths)}</Svg>
}

// Geometria das folhas tropicais do projeto de decoração (costela-de-adão,
// bananeira e palmeira). Os traços são gerados uma vez, no carregamento do
// módulo, para que cada folha seja um desenho de linha única e leve — e não
// um SVG pesado exportado de banco de imagens.

type Pt = [number, number]

const r = (n: number) => Math.round(n * 10) / 10
const pt = ([x, y]: Pt) => `${r(x)} ${r(y)}`
const lerp = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]

function quad(p0: Pt, c: Pt, p1: Pt, t: number): Pt {
  const u = 1 - t
  return [u * u * p0[0] + 2 * u * t * c[0] + t * t * p1[0], u * u * p0[1] + 2 * u * t * c[1] + t * t * p1[1]]
}

function quadTangent(p0: Pt, c: Pt, p1: Pt, t: number): Pt {
  const dx = 2 * (1 - t) * (c[0] - p0[0]) + 2 * t * (p1[0] - c[0])
  const dy = 2 * (1 - t) * (c[1] - p0[1]) + 2 * t * (p1[1] - c[1])
  const len = Math.hypot(dx, dy) || 1
  return [dx / len, dy / len]
}

const rotate = ([x, y]: Pt, a: number): Pt => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]

/* ── Palmeira: ráquis curva com folíolos finos que caem levemente ───────── */
export function palmFrond() {
  const base: Pt = [40, 292]
  const ctrl: Pt = [70, 120]
  const tip: Pt = [178, 18]
  const paths: string[] = [`M ${pt(base)} Q ${pt(ctrl)} ${pt(tip)}`]

  const count = 22
  for (let i = 0; i < count; i++) {
    const t = 0.12 + (i / (count - 1)) * 0.84
    const p = quad(base, ctrl, tip, t)
    const tan = quadTangent(base, ctrl, tip, t)
    const len = 74 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05)), 0.55) * (1 - 0.45 * t) + 8

    for (const side of [-1, 1]) {
      const dir = rotate(tan, side * 0.95)
      const end: Pt = [p[0] + dir[0] * len, p[1] + dir[1] * len + len * 0.28]
      const mid = lerp(p, end, 0.5)
      const c: Pt = [mid[0] + dir[0] * len * 0.12, mid[1] - len * 0.16]
      paths.push(`M ${pt(p)} Q ${pt(c)} ${pt(end)}`)
    }
  }
  return { viewBox: '0 0 240 300', paths }
}

/* ── Bananeira: lâmina longa com nervuras paralelas e dois rasgos ──────── */
export function bananaLeaf() {
  const base: Pt = [64, 318]
  const ctrl: Pt = [44, 160]
  const tip: Pt = [92, 8]
  const width = 46
  const tears = [0.38, 0.62]
  const steps = 48

  const midrib = `M ${pt(base)} Q ${pt(ctrl)} ${pt(tip)}`
  const half = (t: number) => width * Math.pow(Math.sin(Math.PI * t), 0.75) * (t < 0.14 ? Math.pow(t / 0.14, 1.4) : 1)

  const edge = (side: 1 | -1) => {
    const out: string[] = []
    for (let i = 0; i <= steps; i++) {
      const t = 0.015 + (i / steps) * 0.985
      const m = quad(base, ctrl, tip, t)
      const tan = quadTangent(base, ctrl, tip, t)
      const n: Pt = [-tan[1] * side, tan[0] * side]
      const w = half(t)
      const e: Pt = [m[0] + n[0] * w, m[1] + n[1] * w]
      out.push(`${i === 0 ? 'M' : 'L'} ${pt(e)}`)
      // Rasgo natural da folha de bananeira: a borda entra até perto da nervura.
      if (side === 1 && tears.some(tt => Math.abs(t - tt) < 0.5 / steps)) {
        const inner: Pt = [m[0] + n[0] * w * 0.2, m[1] + n[1] * w * 0.2]
        out.push(`L ${pt(inner)} M ${pt(e)}`)
      }
    }
    return out.join(' ')
  }

  const veins: string[] = []
  for (let i = 1; i < 12; i++) {
    const t = 0.1 + i * 0.07
    const m = quad(base, ctrl, tip, t)
    for (const side of [1, -1] as const) {
      const t2 = Math.min(0.97, t + 0.05)
      const m2 = quad(base, ctrl, tip, t2)
      const tan = quadTangent(base, ctrl, tip, t2)
      const n: Pt = [-tan[1] * side, tan[0] * side]
      const e: Pt = [m2[0] + n[0] * half(t2) * 0.88, m2[1] + n[1] * half(t2) * 0.88]
      veins.push(`M ${pt(m)} L ${pt(e)}`)
    }
  }
  return { viewBox: '0 0 150 320', paths: [midrib, edge(1), edge(-1)], veins }
}

/* ── Costela-de-adão: contorno em coração com recortes e furos ─────────── */
export function monstera() {
  const C: Pt = [0, -100]
  const a = 96
  const b = 100
  const slits = [0.78, 1.18, 1.58, 1.98, 2.36]
  const delta = 0.05

  const radius = (phi: number) => {
    const sinus = 0.7 * Math.exp(-Math.pow(Math.min(phi, 2 * Math.PI - phi) / 0.3, 2))
    const tip = 0.07 * Math.exp(-Math.pow((phi - Math.PI) / 0.22, 2))
    return 1 - sinus + tip
  }
  const margin = (phi: number): Pt => {
    const f = radius(phi)
    return [C[0] + a * f * Math.sin(phi), C[1] + b * f * Math.cos(phi)]
  }

  const all = [...slits, ...slits.map(s => 2 * Math.PI - s)].sort((x, y) => x - y)
  const parts: string[] = [`M ${pt(margin(0))}`]
  let phi = 0
  const step = 0.03
  for (const [k, s] of all.entries()) {
    while (phi + step < s - delta) {
      phi += step
      parts.push(`L ${pt(margin(phi))}`)
    }
    const m0 = margin(s - delta)
    const m1 = margin(s + delta)
    const mc = margin(s)
    const axis: Pt = [0, mc[1] - 12]
    const depth = [0.52, 0.62, 0.57, 0.64, 0.55][k % 5]
    const i0 = lerp(m0, axis, depth)
    const i1 = lerp(m1, axis, depth)
    const round = lerp(mc, axis, depth + 0.06)
    parts.push(`L ${pt(m0)} L ${pt(i0)} Q ${pt(round)} ${pt(i1)} L ${pt(m1)}`)
    phi = s + delta
  }
  while (phi + step < 2 * Math.PI) {
    phi += step
    parts.push(`L ${pt(margin(phi))}`)
  }
  parts.push('Z')

  const sinus = margin(0)
  const midrib = `M ${pt(sinus)} Q 3 -150 0 ${r(C[1] - b * 0.96)}`
  const petiole = `M ${pt(sinus)} Q 4 -20 22 28`

  const holes: { cx: number; cy: number; rx: number; ry: number; rot: number }[] = []
  for (let i = 0; i < slits.length - 1; i++) {
    const mid = (slits[i] + slits[i + 1]) / 2
    for (const sgn of [1, -1]) {
      const m = margin(sgn === 1 ? mid : 2 * Math.PI - mid)
      const p = lerp(m, [0, m[1] - 12], 0.8)
      const rot = (Math.atan2(-12, -m[0]) * 180) / Math.PI
      holes.push({ cx: r(p[0]), cy: r(p[1]), rx: 6, ry: 2.4, rot: r(rot) })
    }
  }

  return { viewBox: '-110 -215 220 250', paths: [parts.join(' '), midrib, petiole], holes }
}

/* ── Raminho: ornamento pequeno para divisores ─────────────────────────── */
export function sprig() {
  const paths = ['M 4 20 C 40 18, 80 22, 116 20']
  const leaves = [22, 42, 62, 82, 100]
  leaves.forEach((x, i) => {
    const up = i % 2 === 0 ? -1 : 1
    const y = 20
    paths.push(`M ${x} ${y} q 6 ${up * 9} 15 ${up * 10} q -3 ${-up * 7} -15 ${-up * 10} Z`)
  })
  return { viewBox: '0 0 120 40', paths }
}

import { useState } from 'react'
import { wedding } from '../content/wedding'
import { BananaLeaf, Monstera, PalmFrond, Sprig } from '../design-system/botanicals/Botanicals'
import { Button } from '../design-system/components/Button'
import { Countdown } from '../design-system/components/Countdown'
import { Field } from '../design-system/components/Field'
import { Divider, DividerDot, Eyebrow } from '../design-system/components/Ornaments'
import styles from './DesignSystem.module.css'

const swatches = [
  { name: 'Linho', token: '--color-linen', hex: '#F6F0E6', role: 'Fundo' },
  { name: 'Papel', token: '--color-paper', hex: '#FBF8F2', role: 'Superfície' },
  { name: 'Areia', token: '--color-sand', hex: '#EBE0CF', role: 'Linhas suaves' },
  { name: 'Rosa chá', token: '--color-blush', hex: '#EFDCD3', role: 'Destaque suave' },
  { name: 'Café', token: '--color-ink', hex: '#3A2A22', role: 'Texto' },
  { name: 'Café claro', token: '--color-ink-soft', hex: '#6A5446', role: 'Texto secundário' },
  { name: 'Vinho', token: '--color-wine', hex: '#74303A', role: 'Ação principal' },
  { name: 'Terracota', token: '--color-terracotta', hex: '#B95F3B', role: 'Ornamento, &' },
  { name: 'Ocre', token: '--color-ochre', hex: '#B08A45', role: 'Fios dourados' },
  { name: 'Folha', token: '--color-leaf', hex: '#56704F', role: 'Botânicos' },
]

export default function DesignSystem() {
  const [loading, setLoading] = useState(false)

  return (
    <div className={styles.page}>
      <header className={styles.intro}>
        <Eyebrow>Design system · v0.1</Eyebrow>
        <h1 className={styles.title}>
          Linho, vinho <em>&amp;</em> folhagem
        </h1>
        <p className={styles.lead}>
          A base é clara e calma — linho, areia e café, como as fotos do casal. As cores da festa (vinho, terracota,
          ocre e o verde tropical) aparecem em pequenas doses: num “&amp;”, num fio dourado, numa folha desenhada à mão.
        </p>
      </header>

      <section className={styles.block}>
        <Eyebrow index="I">Cores</Eyebrow>
        <ul className={styles.swatches}>
          {swatches.map(s => (
            <li key={s.token}>
              <span className={styles.chip} style={{ background: `var(${s.token})` }} />
              <strong>{s.name}</strong>
              <span>{s.hex}</span>
              <span>{s.role}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.block}>
        <Eyebrow index="II">Tipografia</Eyebrow>
        <div className={styles.typeGrid}>
          <div>
            <p className={styles.specimenDisplay}>
              Eduardo <em>&amp;</em> Thamires
            </p>
            <p className={styles.caption}>Instrument Serif — nomes, títulos, datas e frases</p>
          </div>
          <div className={styles.typeScale}>
            <p className={styles.h1}>Nossa História</p>
            <p className={styles.h2}>Ao pôr do sol</p>
            <p className={styles.h3}>
              <em>Cerimônia às 16h00</em>
            </p>
            <p className={styles.body}>
              Jost — textos, informações, botões e navegação. Geométrica e limpa, lembra a sinalização em madeira e
              metal do projeto de decoração, sem ar de sistema.
            </p>
            <p className={styles.label}>Rótulo · caixa alta · 13px</p>
          </div>
        </div>
      </section>

      <section className={styles.block}>
        <Eyebrow index="III">Botânicos e ornamentos</Eyebrow>
        <div className={styles.botanicals}>
          <figure>
            <Monstera draw />
            <figcaption>Costela-de-adão</figcaption>
          </figure>
          <figure>
            <BananaLeaf draw delay={200} />
            <figcaption>Bananeira</figcaption>
          </figure>
          <figure>
            <PalmFrond draw delay={400} />
            <figcaption>Palmeira</figcaption>
          </figure>
          <figure>
            <Sprig draw delay={600} />
            <figcaption>Raminho</figcaption>
          </figure>
        </div>
        <div className={styles.dividers}>
          <Divider />
          <DividerDot />
        </div>
      </section>

      <section className={styles.block}>
        <Eyebrow index="IV">Botões</Eyebrow>
        <div className={styles.row}>
          <Button>Presentear</Button>
          <Button variant="outline">Ver no mapa</Button>
          <Button variant="quiet">Todas as informações</Button>
        </div>
        <div className={styles.row}>
          <Button
            loading={loading}
            onClick={() => {
              setLoading(true)
              window.setTimeout(() => setLoading(false), 1600)
            }}
          >
            {loading ? 'Enviando' : 'Clique: carregando'}
          </Button>
          <Button disabled>Indisponível</Button>
        </div>
      </section>

      <section className={styles.block}>
        <Eyebrow index="V">Campos</Eyebrow>
        <form className={styles.form} onSubmit={e => e.preventDefault()}>
          <Field label="Seu nome" required autoComplete="name" placeholder="Como gostaria de assinar" />
          <Field label="E-mail" type="email" autoComplete="email" error="Confira o e-mail: falta o @." defaultValue="maria.gmail.com" />
          <Field label="Seu recado" multiline hint="Até 600 caracteres." placeholder="Escreva com carinho…" />
        </form>
      </section>

      <section className={styles.block}>
        <Eyebrow index="VI">Contagem</Eyebrow>
        <Countdown date={wedding.date} />
      </section>
    </div>
  )
}

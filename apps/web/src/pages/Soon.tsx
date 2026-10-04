import { useLocation } from 'react-router'
import { navigation } from '../content/wedding'
import { PalmFrond } from '../design-system/botanicals/Botanicals'
import { ButtonLink } from '../design-system/components/Button'
import { Eyebrow } from '../design-system/components/Ornaments'
import styles from './Soon.module.css'

// Página provisória para as seções que serão construídas na etapa 6.
export default function Soon() {
  const { pathname } = useLocation()
  const item = navigation.find(n => n.to === pathname)

  return (
    <section className={styles.soon}>
      <PalmFrond className={styles.leaf} draw strokeWidth={1.1} />
      <Eyebrow>Em preparação</Eyebrow>
      <h1 className={styles.title}>{item?.label ?? 'Página não encontrada'}</h1>
      <p className={styles.text}>
        {item ? 'Estamos escrevendo esta parte com carinho. Volte em breve.' : 'Este endereço não existe — mas o caminho de volta, sim.'}
      </p>
      <ButtonLink to="/" variant="outline">Voltar ao início</ButtonLink>
    </section>
  )
}

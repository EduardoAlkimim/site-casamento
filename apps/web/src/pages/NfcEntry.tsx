import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router'
import { api, type Padrinho } from '../lib/api'
import { useAccess } from '../lib/access'
import { LockScreen } from '../design-system/components/LockScreen'
import { Monstera } from '../design-system/botanicals/Botanicals'
import styles from './NfcEntry.module.css'

// Destino das tags NFC: /p/<token>. Troca o token por um cookie e leva o
// padrinho para a página dele, tirando o token da barra de endereço.
export default function NfcEntry() {
  const { token = '' } = useParams()
  const navigate = useNavigate()
  const { refresh } = useAccess()
  const [error, setError] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    if (started.current) return
    started.current = true
    api<{ padrinho: Padrinho }>('/acesso/padrinho', { body: { token } })
      .then(async () => {
        await refresh()
        navigate('/padrinhos', { replace: true })
      })
      .catch(err => setError(err.message))
  }, [token, navigate, refresh])

  if (error) {
    return (
      <LockScreen eyebrow="Convite" title="Não encontramos este convite">
        <p>{error}</p>
        <p>Se a tag for sua, fale com o Eduardo ou a Thamires.</p>
      </LockScreen>
    )
  }

  return (
    <section className={styles.opening} aria-live="polite">
      <Monstera className={styles.leaf} draw strokeWidth={1} />
      <p className={styles.text}>Abrindo o seu convite…</p>
    </section>
  )
}

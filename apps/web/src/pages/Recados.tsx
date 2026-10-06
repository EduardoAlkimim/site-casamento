import { useEffect, useState, type FormEvent } from 'react'
import { api, type PageText } from '../lib/api'
import { Sprig } from '../design-system/botanicals/Botanicals'
import { Button } from '../design-system/components/Button'
import { Field } from '../design-system/components/Field'
import { Eyebrow } from '../design-system/components/Ornaments'
import styles from './Recados.module.css'

const MAX = 800

export default function Recados() {
  const [data, setData] = useState<{ page: PageText } | null>(null)

  // Os recados são só para os noivos: aqui é apenas o formulário.
  useEffect(() => {
    api<{ page: PageText }>('/recados').then(setData, () => {})
  }, [])

  return (
    <div className={styles.page}>
      <header className={styles.head}>
        <Eyebrow>{data?.page.title ?? 'Deixe um Recado'}</Eyebrow>
        <h1 className={styles.title}>{data?.page.heading || 'Deixe um recado'}</h1>
        {data?.page.intro && <p className={styles.intro}>{data.page.intro}</p>}
      </header>

      <MessageForm />

    </div>
  )
}

function MessageForm() {
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [website, setWebsite] = useState('')
  const [errors, setErrors] = useState<{ name?: string; message?: string }>({})
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next: typeof errors = {}
    if (name.trim().length < 2) next.name = 'Diga seu nome para sabermos de quem é o carinho.'
    if (message.trim().length < 3) next.message = 'Escreva o seu recado.'
    setErrors(next)
    if (next.name || next.message) return
    setBusy(true)
    setError(null)
    try {
      await api('/recados', { body: { name: name.trim(), message: message.trim(), website } })
      setSent(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    return (
      <div className={styles.sent} role="status">
        <Sprig className={styles.sentSprig} draw strokeWidth={1.2} />
        <p className={styles.sentTitle}>
          Obrigado, <em>{name.trim().split(' ')[0]}!</em>
        </p>
        <p className={styles.sentText}>Seu recado chegou direto para nós dois. Vamos guardar com carinho.</p>
        <Button
          variant="quiet"
          onClick={() => {
            setSent(false)
            setMessage('')
          }}
        >
          Escrever outro
        </Button>
      </div>
    )
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <Field
        label="Seu recado"
        multiline
        rows={6}
        maxLength={MAX}
        placeholder="Escreva com carinho…"
        required
        value={message}
        error={errors.message}
        hint={`${message.length}/${MAX}`}
        onChange={e => setMessage(e.target.value)}
      />
      <Field
        label="Seu nome"
        autoComplete="name"
        required
        value={name}
        error={errors.name}
        onChange={e => setName(e.target.value)}
      />
      {/* Armadilha para robôs: invisível para pessoas e leitores de tela. */}
      <div className={styles.trap} aria-hidden="true">
        <label>
          Site
          <input tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} />
        </label>
      </div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <Button type="submit" loading={busy}>
        Enviar recado
      </Button>
    </form>
  )
}

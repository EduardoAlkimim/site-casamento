import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api, type Gift } from '../../lib/api'
import { formatBRL } from '../../lib/money'
import { Sprig } from '../../design-system/botanicals/Botanicals'
import { Button } from '../../design-system/components/Button'
import { Field } from '../../design-system/components/Field'
import { Eyebrow } from '../../design-system/components/Ornaments'
import styles from './PaymentDialog.module.css'

// "Eu vou levar": o convidado reserva o item para levar no chá. Sem pagamento;
// só o nome (e um contato opcional) para os noivos saberem quem vai trazer.
export function ReserveDialog({ gift, onClose }: { gift: Gift; onClose: (reserved: boolean) => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState('')
  const [contact, setContact] = useState('')
  const [nameError, setNameError] = useState<string>()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [storeUrl, setStoreUrl] = useState<string | null>(null)

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (name.trim().length < 2) return setNameError('Escreva seu nome, para sabermos quem vai trazer.')
    setNameError(undefined)
    setBusy(true)
    setError(null)
    try {
      const r = await api<{ url: string | null }>(`/listas/presentes/${gift.id}/reservar`, {
        body: { name: name.trim(), contact: contact.trim() },
      })
      setStoreUrl(r.url)
      setDone(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog ref={dialogRef} className={styles.sheet} aria-labelledby="reserve-title" onClose={() => onClose(done)}>
      <div className={styles.inner}>
        <div className={styles.top}>
          <Eyebrow>{done ? 'Reservado para você' : gift.hasLink ? 'Reservar e comprar' : 'Eu vou levar'}</Eyebrow>
          <button type="button" className={styles.close} onClick={() => dialogRef.current?.close()} aria-label="Fechar">
            <span />
            <span />
          </button>
        </div>

        <div className={styles.gift}>
          <span className={styles.thumb}>{gift.imageUrl ? <img src={gift.imageUrl} alt="" /> : <Sprig strokeWidth={1.2} />}</span>
          <div>
            <h2 id="reserve-title" className={styles.giftName}>{gift.name}</h2>
            {gift.priceCents != null && <p className={styles.price}>{formatBRL(gift.priceCents)}</p>}
          </div>
        </div>

        {done ? (
          <div className={styles.body}>
            <Sprig className={styles.doneSprig} draw strokeWidth={1.2} />
            <p className={styles.thanks}>
              Combinado, <em>{name.trim().split(' ')[0]}!</em>
            </p>
            <p className={styles.note}>
              {storeUrl
                ? 'O item já está reservado no seu nome — ninguém mais vai escolhê-lo. Seu link de compra está pronto:'
                : 'O item já está reservado no seu nome — ninguém mais vai escolhê-lo. É só comprar onde preferir e levar no dia do chá.'}
            </p>
            {storeUrl && (
              <a className={styles.storeLink} href={storeUrl} target="_blank" rel="noopener noreferrer sponsored">
                Comprar na loja
                <span className="visually-hidden"> (abre em outra aba)</span>
                <svg viewBox="0 0 12 12" aria-hidden="true">
                  <path d="M3 9 9 3M4 3h5v5" fill="none" stroke="currentColor" strokeWidth="1.2" />
                </svg>
              </a>
            )}
            <Button variant={storeUrl ? 'quiet' : 'outline'} onClick={() => dialogRef.current?.close()}>
              Voltar para a lista
            </Button>
          </div>
        ) : (
          <form className={styles.body} onSubmit={submit} noValidate>
            {gift.hasLink ? (
              <ol className={styles.steps}>
                <li>Você reserva o item com seu nome — ninguém mais poderá escolhê-lo.</li>
                <li>Geramos na hora o <strong>link de compra</strong> da loja para você.</li>
                <li>Você compra pelo link e leva no dia do chá.</li>
              </ol>
            ) : (
              <p className={styles.note}>Reserve o item para que ninguém leve igual. Você compra onde preferir e traz no dia.</p>
            )}
            <Field label="Seu nome" required autoComplete="name" value={name} error={nameError} onChange={e => setName(e.target.value)} />
            <Field
              label="WhatsApp ou e-mail (opcional)"
              autoComplete="tel"
              hint="Só os noivos veem, caso precisem falar com você."
              value={contact}
              onChange={e => setContact(e.target.value)}
            />
            {error && <p className={styles.error} role="alert">{error}</p>}
            <Button type="submit" loading={busy} className={styles.cta}>
              {gift.hasLink ? 'Reservar e gerar link' : 'Reservar para mim'}
            </Button>
          </form>
        )}
      </div>
    </dialog>
  )
}

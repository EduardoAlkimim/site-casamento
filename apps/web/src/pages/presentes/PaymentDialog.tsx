import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api, type Gift, type PaymentCreated } from '../../lib/api'
import { formatBRL } from '../../lib/money'
import { brickCustomization, createMercadoPago, type BrickController, type CardFormData } from '../../lib/mercadopago'
import { Sprig } from '../../design-system/botanicals/Botanicals'
import { Button } from '../../design-system/components/Button'
import { Field } from '../../design-system/components/Field'
import { Eyebrow } from '../../design-system/components/Ornaments'
import styles from './PaymentDialog.module.css'

type Step = 'form' | 'pix' | 'card' | 'pending' | 'done' | 'expired'
type Method = 'pix' | 'card'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const FINAL_FAIL = ['rejected', 'cancelled', 'refunded', 'charged_back']

type Props = { gift: Gift; publicKey: string; onClose: (paid: boolean) => void }

export function PaymentDialog({ gift, publicKey, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [step, setStep] = useState<Step>('form')
  const [method, setMethod] = useState<Method>('pix')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [payment, setPayment] = useState<PaymentCreated | null>(null)
  const paid = step === 'done'

  useEffect(() => {
    dialogRef.current?.showModal()
  }, [])

  const close = () => dialogRef.current?.close()

  const validate = () => {
    const next: typeof errors = {}
    if (name.trim().length < 3) next.name = 'Escreva seu nome, como gostaria que lêssemos.'
    if (!EMAIL.test(email.trim())) next.email = 'Confira o e-mail — é para onde vai o comprovante.'
    setErrors(next)
    return !next.name && !next.email
  }

  const start = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!validate()) return
    if (method === 'card') return setStep('card')
    setBusy(true)
    try {
      const created = await api<PaymentCreated>('/pagamentos', {
        body: { giftId: gift.id, payerName: name.trim(), payerEmail: email.trim(), method: 'pix' },
      })
      setPayment(created)
      setStep(created.status === 'approved' ? 'done' : 'pix')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog ref={dialogRef} className={styles.sheet} aria-labelledby="pay-title" onClose={() => onClose(paid)}>
      <div className={styles.inner}>
        <div className={styles.top}>
          <Eyebrow>{paid ? 'Presente recebido' : 'Presentear'}</Eyebrow>
          <button type="button" className={styles.close} onClick={close} aria-label="Fechar">
            <span />
            <span />
          </button>
        </div>

        <div className={styles.gift}>
          <span className={styles.thumb}>{gift.imageUrl ? <img src={gift.imageUrl} alt="" /> : <Sprig strokeWidth={1.2} />}</span>
          <div>
            <h2 id="pay-title" className={styles.giftName}>{gift.name}</h2>
            <p className={styles.price}>{formatBRL(gift.priceCents!)}</p>
          </div>
        </div>

        {step === 'form' && (
          <form className={styles.body} onSubmit={start} noValidate>
            <Field
              label="Seu nome"
              required
              autoComplete="name"
              value={name}
              error={errors.name}
              onChange={e => setName(e.target.value)}
            />
            <Field
              label="Seu e-mail"
              type="email"
              required
              autoComplete="email"
              inputMode="email"
              hint="Para o comprovante do Mercado Pago."
              value={email}
              error={errors.email}
              onChange={e => setEmail(e.target.value)}
            />
            <fieldset className={styles.methods}>
              <legend className={styles.legend}>Como prefere pagar</legend>
              {(
                [
                  ['pix', 'PIX', 'QR Code ou copia e cola'],
                  ['card', 'Cartão de crédito', 'Em até 12 vezes'],
                ] as const
              ).map(([id, label, hint]) => (
                <label key={id} className={styles.method}>
                  <input type="radio" name="metodo" value={id} checked={method === id} onChange={() => setMethod(id)} />
                  <span className={styles.methodLabel}>{label}</span>
                  <span className={styles.methodHint}>{hint}</span>
                </label>
              ))}
            </fieldset>
            {error && <p className={styles.error} role="alert">{error}</p>}
            <Button type="submit" loading={busy} className={styles.cta}>
              {method === 'pix' ? 'Gerar PIX' : 'Continuar'}
            </Button>
            <p className={styles.secure}>Pagamento processado pelo Mercado Pago.</p>
          </form>
        )}

        {step === 'pix' && payment?.pix && (
          <PixStep
            payment={payment}
            onPaid={() => setStep('done')}
            onFailed={() => setStep('expired')}
            onBack={() => {
              setPayment(null)
              setStep('form')
            }}
          />
        )}

        {step === 'card' && (
          <CardStep
            gift={gift}
            publicKey={publicKey}
            name={name.trim()}
            email={email.trim()}
            onResult={created => {
              setPayment(created)
              setStep(created.status === 'approved' ? 'done' : 'pending')
            }}
            onBack={() => setStep('form')}
          />
        )}

        {step === 'pending' && (
          <div className={styles.body}>
            <p className={styles.lead}>Seu pagamento está em análise.</p>
            <p className={styles.note}>
              O Mercado Pago pode levar alguns minutos para confirmar. Você recebe o resultado por e-mail — não precisa fazer
              mais nada.
            </p>
            {payment && <Message paymentId={payment.id} />}
          </div>
        )}

        {step === 'expired' && (
          <div className={styles.body}>
            <p className={styles.lead}>Este PIX não foi concluído.</p>
            <p className={styles.note}>O código expirou ou o pagamento foi cancelado. Você pode gerar um novo.</p>
            <Button onClick={() => setStep('form')}>Tentar de novo</Button>
          </div>
        )}

        {step === 'done' && (
          <div className={styles.body}>
            <Sprig className={styles.doneSprig} draw strokeWidth={1.2} />
            <p className={styles.thanks}>
              Obrigado, <em>{name.trim().split(' ')[0]}!</em>
            </p>
            <p className={styles.note}>Recebemos o seu presente com muito carinho. O comprovante vai para {email.trim()}.</p>
            {payment && <Message paymentId={payment.id} />}
          </div>
        )}
      </div>
    </dialog>
  )
}

/* ── PIX: QR Code, copia e cola e espera pela confirmação ─────────────── */
function PixStep({
  payment,
  onPaid,
  onFailed,
  onBack,
}: {
  payment: PaymentCreated
  onPaid: () => void
  onFailed: () => void
  onBack: () => void
}) {
  const [copied, setCopied] = useState(false)
  const pix = payment.pix!
  // Callbacks em ref: o polling não reinicia quando a tela re-renderiza.
  const done = useRef({ onPaid, onFailed })
  done.current = { onPaid, onFailed }

  useEffect(() => {
    let alive = true
    const tick = async () => {
      try {
        const { status } = await api<{ status: string }>(`/pagamentos/${payment.id}`)
        if (!alive) return
        if (status === 'approved') return done.current.onPaid()
        if (FINAL_FAIL.includes(status)) return done.current.onFailed()
      } catch {
        /* rede instável: tenta de novo no próximo ciclo */
      }
      if (alive) timer = window.setTimeout(tick, 4000)
    }
    let timer = window.setTimeout(tick, 4000)
    return () => {
      alive = false
      window.clearTimeout(timer)
    }
  }, [payment.id])

  const copy = async () => {
    await navigator.clipboard.writeText(pix.qrCode)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2500)
  }

  return (
    <div className={styles.body}>
      <p className={styles.note}>Abra o app do seu banco, escolha PIX e escaneie — ou use o copia e cola.</p>
      <img className={styles.qr} src={`data:image/png;base64,${pix.qrCodeBase64}`} alt="QR Code do PIX" width={220} height={220} />
      <Button variant="outline" onClick={copy}>
        {copied ? 'Código copiado' : 'Copiar código PIX'}
      </Button>
      <p className={styles.waiting} role="status">
        <span className={styles.pulse} aria-hidden="true" /> Aguardando o pagamento…
      </p>
      <p className={styles.small}>O código vale por 30 minutos. Esta tela atualiza sozinha quando o PIX cair.</p>
      <Button variant="quiet" onClick={onBack}>
        Voltar
      </Button>
    </div>
  )
}

/* ── Cartão: formulário seguro do Mercado Pago (os dados não passam por nós) ── */
function CardStep({
  gift,
  publicKey,
  name,
  email,
  onResult,
  onBack,
}: {
  gift: Gift
  publicKey: string
  name: string
  email: string
  onResult: (p: PaymentCreated) => void
  onBack: () => void
}) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const resultRef = useRef(onResult)
  resultRef.current = onResult

  useEffect(() => {
    let controller: BrickController | null = null
    let cancelled = false
    setReady(false)
    createMercadoPago(publicKey)
      .then(mp =>
        mp.bricks().create('cardPayment', 'mp-card-brick', {
          initialization: { amount: gift.priceCents! / 100, payer: { email } },
          customization: brickCustomization,
          callbacks: {
            onReady: () => !cancelled && setReady(true),
            onError: () => !cancelled && setError('O formulário do cartão teve um problema. Tente de novo.'),
            onSubmit: async (data: CardFormData) => {
              setError(null)
              try {
                const created = await api<PaymentCreated>('/pagamentos', {
                  body: {
                    giftId: gift.id,
                    payerName: name,
                    payerEmail: data.payer.email || email,
                    method: 'card',
                    card: {
                      token: data.token,
                      paymentMethodId: data.payment_method_id,
                      issuerId: data.issuer_id ?? null,
                      installments: data.installments,
                      identificationType: data.payer.identification?.type,
                      identificationNumber: data.payer.identification?.number,
                    },
                  },
                })
                if (created.status === 'rejected') {
                  setError(created.message)
                  setAttempt(a => a + 1) // remonta o formulário para outra tentativa
                  return
                }
                resultRef.current(created)
              } catch (err) {
                setError((err as Error).message)
                setAttempt(a => a + 1)
              }
            },
          },
        }),
      )
      .then(c => {
        if (cancelled) c.unmount()
        else controller = c
      })
      .catch(err => !cancelled && setError((err as Error).message))
    return () => {
      cancelled = true
      controller?.unmount()
    }
  }, [publicKey, gift.id, gift.priceCents, email, name, attempt])

  return (
    <div className={styles.body}>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {!ready && !error && <p className={styles.small} aria-busy="true">Carregando o formulário seguro…</p>}
      <div id="mp-card-brick" className={styles.brick} />
      <Button variant="quiet" onClick={onBack}>
        Voltar
      </Button>
    </div>
  )
}

/* ── Recado opcional depois do pagamento ─────────────────────────────── */
function Message({ paymentId }: { paymentId: string }) {
  const [text, setText] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = async (e: FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    setBusy(true)
    setError(null)
    try {
      await api(`/pagamentos/${paymentId}/recado`, { body: { message: text.trim() } })
      setSent(true)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  if (sent) return <p className={styles.sent} role="status">Recado enviado. Vamos guardar com carinho.</p>

  return (
    <form className={styles.message} onSubmit={send}>
      <Field
        label="Quer deixar um recado para nós?"
        multiline
        rows={4}
        maxLength={1000}
        placeholder="Escreva com carinho…"
        value={text}
        error={error ?? undefined}
        onChange={e => setText(e.target.value)}
      />
      <Button type="submit" variant="outline" loading={busy} disabled={!text.trim()}>
        Enviar recado
      </Button>
    </form>
  )
}

import { useState, useEffect, useRef } from 'react'
import api from '../lib/api'

function formatCPF(v) {
  return v.replace(/\D/g, '').slice(0, 11)
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2')
}

function formatCard(v) {
  return v.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})/g, '$1 ').trim()
}

function formatExpiry(v) {
  return v.replace(/\D/g, '').slice(0, 4).replace(/(\d{2})(\d)/, '$1/$2')
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Injeta o script do MP para gerar o deviceId (fingerprint) — só isso, sem usar os campos hosted
function loadMercadoPagoSDK() {
  return new Promise((resolve) => {
    if (window.MP_DEVICE_SESSION_ID) return resolve()
    const script = document.createElement('script')
    script.src = 'https://sdk.mercadopago.com/js/v2'
    script.onload = () => resolve()
    script.onerror = () => resolve() // falha silenciosa, não bloqueia o pagamento
    document.head.appendChild(script)
  })
}

// Tokeniza o cartão via API REST diretamente — forma correta sem campos hosted
async function tokenizeCard({ cardNumber, expiry, cvv, cardName, cpf }) {
  const publicKey = import.meta.env.VITE_MP_PUBLIC_KEY
  const [expMonth, expYear] = expiry.split('/')

  // Garante que o SDK carregou para gerar o deviceId de fingerprint
  await loadMercadoPagoSDK()

  const body = {
    card_number: cardNumber.replace(/\s/g, ''),
    cardholder: {
      name: cardName,
      identification: { type: 'CPF', number: cpf.replace(/\D/g, '') },
    },
    expiration_month: Number(expMonth),
    expiration_year: Number(`20${expYear}`),
    security_code: cvv,
  }

  // Adiciona o deviceId ao body se o SDK conseguiu gerar
  if (window.MP_DEVICE_SESSION_ID) {
    body.device_id = window.MP_DEVICE_SESSION_ID
  }

  const res = await fetch('https://api.mercadopago.com/v1/card_tokens', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Public-Key': publicKey,
      'Authorization': `Bearer ${publicKey}`,
    },
    body: JSON.stringify(body),
  })

  const data = await res.json()

  if (!res.ok) {
    throw new Error(data?.cause?.[0]?.description || 'Erro ao tokenizar cartão')
  }

  return data
}

function MsgBlock({ name, valor, gift }) {
  const [msgStep, setMsgStep] = useState('')
  const [msgText, setMsgText] = useState('')

  const handleSend = async () => {
    if (!msgText.trim()) return
    try {
      await api.post('/messages', {
        sender_name: name,
        message: msgText,
        gift_name: gift?.name || 'Contribuição livre',
        amount: valor,
      })
      setMsgStep('sent')
    } catch {
      setMsgStep('error')
    }
  }

  if (msgStep === 'sent') return (
    <p style={{ marginTop: '1rem', color: 'var(--rose)', fontSize: '.85rem', textAlign: 'center' }}>
      💌 Mensagem enviada! Obrigado pelo carinho.
    </p>
  )
  if (msgStep === 'error') return (
    <p style={{ marginTop: '1rem', color: '#e05c5c', fontSize: '.85rem', textAlign: 'center' }}>
      Erro ao enviar. Tente novamente.
    </p>
  )
  if (msgStep === 'form') return (
    <div style={{ marginTop: '1rem' }}>
      <textarea
        placeholder="Escreva sua mensagem com carinho... 💕"
        value={msgText}
        onChange={e => setMsgText(e.target.value)}
        rows={4}
        style={{ width: '100%', padding: '.75rem', borderRadius: '8px', border: '1px solid #f2dede', fontFamily: 'inherit', fontSize: '.9rem', resize: 'vertical', outline: 'none', color: '#1a1410', boxSizing: 'border-box' }}
      />
      <button onClick={handleSend} style={{ marginTop: '.5rem', width: '100%', padding: '.75rem', background: 'var(--rose)', color: '#fff', border: 'none', borderRadius: '8px', fontFamily: 'inherit', fontSize: '.7rem', letterSpacing: '.16em', textTransform: 'uppercase', cursor: 'pointer' }}>
        Enviar mensagem 💌
      </button>
    </div>
  )
  return (
    <button onClick={() => setMsgStep('form')} style={{ marginTop: '1rem', width: '100%', padding: '.75rem', background: 'var(--rose)', color: '#fff', border: 'none', borderRadius: '8px', fontFamily: 'inherit', fontSize: '.7rem', letterSpacing: '.16em', textTransform: 'uppercase', cursor: 'pointer' }}>
      💌 Deixar uma mensagem aos noivos
    </button>
  )
}

export default function PaymentModal({ gift, amount, onClose }) {
  const valor = gift?.value || amount

  const [method, setMethod] = useState('pix')
  const [step, setStep] = useState('form')
  const [loading, setLoading] = useState(false)
  const [qrData, setQrData] = useState(null)
  const [statusMsg, setStatusMsg] = useState('')
  const [pixApproved, setPixApproved] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [formError, setFormError] = useState('')
  const pollingRef = useRef(null)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [cardNumber, setCardNumber] = useState('')
  const [expiry, setExpiry] = useState('')
  const [cvv, setCvv] = useState('')
  const [cardName, setCardName] = useState('')
  const [cpf, setCpf] = useState('')
  const [cardType, setCardType] = useState('credit')
  const [installments, setInstallments] = useState(1)
  const [installmentOpts, setInstallmentOpts] = useState([])

  useEffect(() => {
    const bin = cardNumber.replace(/\s/g, '').slice(0, 6)
    if (bin.length < 6 || !valor || cardType === 'debit') { setInstallmentOpts([]); return }
    api.get(`/payments/installments?amount=${valor}&bin=${bin}`)
      .then(r => setInstallmentOpts(r.data))
      .catch(() => setInstallmentOpts([]))
  }, [cardNumber, valor, cardType])

  const startPolling = (paymentId) => {
    clearInterval(pollingRef.current)
    pollingRef.current = setInterval(async () => {
      try {
        const { data } = await api.get(`/payments/status/${paymentId}`)
        if (data.status === 'approved') {
          setPixApproved(true)
          clearInterval(pollingRef.current)
        }
      } catch {}
    }, 4000)
  }

  useEffect(() => () => clearInterval(pollingRef.current), [])

  const handlePix = async () => {
    setFormError('')
    if (!name.trim()) { setFormError('Preencha seu nome completo'); return }
    if (!email.trim()) { setFormError('Preencha seu e-mail'); return }
    if (!EMAIL_REGEX.test(email)) { setEmailError('Digite um e-mail válido'); return }
    setEmailError('')
    setLoading(true)
    try {
      const { data } = await api.post('/payments/create', {
        gift_id: gift?.id || null,
        payer_name: name,
        payer_email: email,
        amount: valor,
        type: gift ? 'gift' : 'free',
        payment_method: 'pix',
      })
      setQrData(data)
      setStep('qr')
      startPolling(data.payment_id)
    } catch {
      setFormError('Erro ao gerar PIX. Tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const handleCard = async () => {
    setFormError('')
    if (!name.trim() || !email.trim() || !cardNumber || !expiry || !cvv || !cardName || !cpf) {
      setFormError('Preencha todos os campos'); return
    }
    if (!EMAIL_REGEX.test(email)) { setEmailError('Digite um e-mail válido'); return }
    setEmailError('')
    setLoading(true)

    try {
      // Usa SDK oficial — inclui device fingerprint para o antifraude do MP
      const tokenData = await tokenizeCard({ cardNumber, expiry, cvv, cardName, cpf })

      console.log('TOKEN RESPONSE:', JSON.stringify(tokenData, null, 2))

      if (!tokenData?.id) {
        const detail = tokenData?.cause?.[0]?.description || 'Dados do cartão inválidos.'
        setFormError(detail)
        setLoading(false)
        return
      }

      const bin = cardNumber.replace(/\s/g, '').slice(0, 6)

      const { data } = await api.post('/payments/create', {
        gift_id: gift?.id || null,
        payer_name: name,
        payer_email: email,
        amount: valor,
        type: gift ? 'gift' : 'free',
        payment_method: 'card',
        card_token: tokenData.id,
        card_bin: bin,
        card_type: cardType,
        installments: cardType === 'debit' ? 1 : installments,
        payer_cpf: cpf,
      })

      if (data.status === 'approved') {
        setStatusMsg('Pagamento aprovado! Obrigado pelo presente 💕')
        setStep('success')
      } else if (data.status === 'in_process') {
        setStatusMsg('Pagamento em análise. Você receberá uma confirmação por e-mail.')
        setStep('success')
      } else {
        setStatusMsg(`Pagamento não aprovado (${data.status_detail || 'verifique os dados'}).`)
        setStep('error')
      }
    } catch (err) {
      console.error(err)
      setFormError('Erro ao processar pagamento. Verifique os dados e tente novamente.')
    } finally {
      setLoading(false)
    }
  }

  const valorFmt = Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-pay">
        <button className="modal-x" onClick={onClose}>✕</button>

        <div className="modal-icon">{method === 'pix' ? '💸' : '💳'}</div>
        <h3>{gift ? gift.name : 'Contribuição Livre'}</h3>
        <p>Valor: <strong>R$ {valorFmt}</strong></p>

        {step === 'form' && (
          <>
            <div className="pay-method-toggle">
              <button className={`pay-method-btn ${method === 'pix' ? 'on' : 'off'}`} onClick={() => { setMethod('pix'); setFormError('') }}>PIX</button>
              <button className={`pay-method-btn ${method === 'card' ? 'on' : 'off'}`} onClick={() => { setMethod('card'); setFormError('') }}>Cartão</button>
            </div>

            <input placeholder="Seu nome completo" value={name} onChange={e => { setName(e.target.value); setFormError('') }} />
            <input
              placeholder="Seu e-mail"
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setEmailError(''); setFormError('') }}
              style={emailError ? { borderColor: '#e05c5c' } : {}}
            />
            {emailError && <p style={{ color: '#e05c5c', fontSize: '.8rem', margin: '-8px 0 4px' }}>{emailError}</p>}

            {method === 'pix' && (
              <button onClick={handlePix} disabled={loading}>
                {loading ? 'Gerando...' : 'Gerar QR Code PIX'}
              </button>
            )}

            {method === 'card' && (
              <>
                <div className="pay-method-toggle" style={{ marginBottom: '.5rem' }}>
                  <button className={`pay-method-btn ${cardType === 'credit' ? 'on' : 'off'}`} onClick={() => { setCardType('credit'); setInstallments(1); setFormError('') }}>Crédito</button>
                  <button className={`pay-method-btn ${cardType === 'debit' ? 'on' : 'off'}`} onClick={() => { setCardType('debit'); setInstallments(1); setFormError('') }}>Débito</button>
                </div>

                <input placeholder="Número do cartão" value={cardNumber}
                  onChange={e => { setCardNumber(formatCard(e.target.value)); setFormError('') }} inputMode="numeric" />
                <div className="card-row">
                  <input placeholder="Validade MM/AA" value={expiry}
                    onChange={e => setExpiry(formatExpiry(e.target.value))} inputMode="numeric" />
                  <input placeholder="CVV" value={cvv}
                    onChange={e => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" />
                </div>
                <input placeholder="Nome no cartão" value={cardName}
                  onChange={e => setCardName(e.target.value.toUpperCase())} />
                <input placeholder="CPF do titular" value={cpf}
                  onChange={e => setCpf(formatCPF(e.target.value))} inputMode="numeric" />

                {cardType === 'credit' && installmentOpts.length > 0 && (
                  <select className="install-select" value={installments}
                    onChange={e => setInstallments(Number(e.target.value))}>
                    {installmentOpts.map(opt => (
                      <option key={opt.installments} value={opt.installments}>
                        {opt.recommended_message}
                      </option>
                    ))}
                  </select>
                )}

                <button onClick={handleCard} disabled={loading}>
                  {loading ? 'Processando...' : `Pagar R$ ${valorFmt}`}
                </button>
              </>
            )}

            {formError && <p style={{ color: '#e05c5c', fontSize: '.85rem', textAlign: 'center', marginTop: '.5rem' }}>{formError}</p>}
          </>
        )}

        {step === 'qr' && qrData && (
          <>
            <div className="modal-icon">✅</div>
            <h3>Escaneie o QR Code</h3>
            <img src={`data:image/png;base64,${qrData.qr_code_base64}`} alt="QR Code PIX"
              style={{ width: '180px', margin: '1rem auto', display: 'block' }} />
            <p>Ou copie o código PIX:</p>
            <div className="pix-box" onClick={() => navigator.clipboard.writeText(qrData.qr_code)} title="Clique para copiar">
              {qrData.qr_code.slice(0, 60)}...
            </div>
            {!pixApproved ? (
              <p style={{ fontSize: '.75rem', marginTop: '1rem', color: '#7a6e68', textAlign: 'center' }}>
                ⏳ Aguardando confirmação do pagamento...
              </p>
            ) : (
              <>
                <p style={{ fontSize: '.85rem', marginTop: '1rem', color: 'var(--rose)', textAlign: 'center' }}>
                  ✅ Pagamento confirmado! Obrigado pelo presente 💕
                </p>
                <MsgBlock name={name} valor={valor} gift={gift} />
              </>
            )}
          </>
        )}

        {step === 'success' && (
          <>
            <div className="modal-icon">🎉</div>
            <h3>Tudo certo!</h3>
            <p>{statusMsg}</p>
            <MsgBlock name={name} valor={valor} gift={gift} />
            <button onClick={onClose} style={{ marginTop: '1rem', background: 'none', border: '1px solid #f2dede', borderRadius: '8px', padding: '.6rem 1.2rem', cursor: 'pointer', color: '#7a6e68', fontSize: '.75rem' }}>
              Fechar
            </button>
          </>
        )}

        {step === 'error' && (
          <>
            <div className="modal-icon">❌</div>
            <h3>Não aprovado</h3>
            <p>{statusMsg}</p>
            <button onClick={() => setStep('form')} style={{ marginTop: '1rem' }}>Tentar novamente</button>
          </>
        )}
      </div>
    </div>
  )
}
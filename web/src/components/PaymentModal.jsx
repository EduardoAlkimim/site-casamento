import { useState, useEffect, useRef } from 'react'
import api from '../lib/api'

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Carrega o SDK oficial do MercadoPago V2 uma única vez
function loadMPSdk() {
  return new Promise((resolve, reject) => {
    if (window.MercadoPago) return resolve(window.MercadoPago)
    const script = document.createElement('script')
    script.src = 'https://sdk.mercadopago.com/js/v2'
    script.onload = () => resolve(window.MercadoPago)
    script.onerror = () => reject(new Error('Falha ao carregar SDK do MercadoPago'))
    document.head.appendChild(script)
  })
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
  const [sdkReady, setSdkReady] = useState(false)
  const [qrData, setQrData] = useState(null)
  const [statusMsg, setStatusMsg] = useState('')
  const [pixApproved, setPixApproved] = useState(false)
  const [emailError, setEmailError] = useState('')
  const [formError, setFormError] = useState('')
  const pollingRef = useRef(null)
  const cardFormRef = useRef(null)
  const mpRef = useRef(null)

  // Dados do pagador (PIX e cartão)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [cpf, setCpf] = useState('')

  // Dados preenchidos pelo CardForm do SDK (ficam ocultos no iframe do MP)
  const cardDataRef = useRef({
    token: null,
    issuerId: null,
    paymentMethodId: null,
    installments: 1,
  })
  const binRef = useRef('')

  const valorFmt = Number(valor).toLocaleString('pt-BR', { minimumFractionDigits: 2 })

  // Inicializa o SDK e monta o CardForm quando o método for "card"
  useEffect(() => {
    if (method !== 'card') {
      // Desmonta o CardForm se existir
      if (cardFormRef.current) {
        try { cardFormRef.current.unmount() } catch {}
        cardFormRef.current = null
      }
      return
    }

    let cancelled = false

    async function initCardForm() {
      try {
        const MercadoPago = await loadMPSdk()
        if (cancelled) return

        const mp = new MercadoPago(import.meta.env.VITE_MP_PUBLIC_KEY, { locale: 'pt-BR' })
        mpRef.current = mp

        // Aguarda o DOM renderizar os containers dos iframes
        await new Promise(r => setTimeout(r, 100))
        if (cancelled) return

        const cardForm = mp.cardForm({
          amount: String(valor),
          iframe: true,
          form: {
            id: 'mp-card-form',
            cardNumber: { id: 'mp-card-number', placeholder: 'Número do cartão' },
            expirationDate: { id: 'mp-expiration-date', placeholder: 'MM/AA' },
            securityCode: { id: 'mp-security-code', placeholder: 'CVV' },
            cardholderName: { id: 'mp-cardholder-name', placeholder: 'Nome no cartão' },
            issuer: { id: 'mp-issuer', placeholder: 'Bandeira' },
            installments: { id: 'mp-installments', placeholder: 'Parcelas' },
            identificationType: { id: 'mp-identification-type', placeholder: 'Tipo' },
            identificationNumber: { id: 'mp-identification-number', placeholder: 'CPF' },
          },
          callbacks: {
            onFormMounted: (error) => {
              if (error) {
                console.error('CardForm mount error:', error)
                return
              }
              if (!cancelled) setSdkReady(true)
            },
            onSubmit: async (event) => {
              event.preventDefault()
              const {
                paymentMethodId,
                issuerId,
                token,
                installments,
              } = cardForm.getCardFormData()

              cardDataRef.current = {
                token,
                issuerId,
                paymentMethodId,
                installments: Number(installments) || 1,
                bin: binRef.current,
              }
            },
            onBinChange: (bin) => {
              if (bin) binRef.current = bin
            },
            onFetching: (resource) => {
              setLoading(true)
              return () => setLoading(false)
            },
          },
        })

        cardFormRef.current = cardForm
      } catch (err) {
        console.error('Erro ao inicializar CardForm:', err)
        if (!cancelled) setFormError('Erro ao carregar o formulário de cartão. Recarregue a página.')
      }
    }

    initCardForm()
    return () => {
      cancelled = true
      if (cardFormRef.current) {
        try { cardFormRef.current.unmount() } catch {}
        cardFormRef.current = null
      }
      setSdkReady(false)
    }
  }, [method, valor])

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

  // --- PIX ---
  const handlePix = async () => {
    setFormError('')
    if (!name.trim()) { setFormError('Preencha seu nome completo'); return }
    if (!email.trim() || !EMAIL_REGEX.test(email)) { setEmailError('Digite um e-mail válido'); return }
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

  // --- CARTÃO: dispara o submit do CardForm e coleta o token gerado pelo SDK ---
  const handleCard = async () => {
    setFormError('')
    if (!name.trim()) { setFormError('Preencha seu nome completo'); return }
    if (!email.trim() || !EMAIL_REGEX.test(email)) { setEmailError('Digite um e-mail válido'); return }
    setEmailError('')

    if (!cardFormRef.current) {
      setFormError('Formulário não carregado. Aguarde e tente novamente.')
      return
    }

    setLoading(true)

    try {
      // Submete o CardForm — o SDK tokeniza e chama onSubmit internamente
      await cardFormRef.current.submit()

      // Aguarda o token ser preenchido pelo callback onSubmit
      await new Promise(r => setTimeout(r, 800))

      const { token, issuerId, paymentMethodId, installments, bin } = cardDataRef.current

      if (!token) {
        setFormError('Verifique os dados do cartão e tente novamente.')
        setLoading(false)
        return
      }

      const { data } = await api.post('/payments/create', {
        gift_id: gift?.id || null,
        payer_name: name,
        payer_email: email,
        amount: valor,
        type: gift ? 'gift' : 'free',
        payment_method: 'card',
        card_token: token,
        issuer_id: issuerId,
        payment_method_id: paymentMethodId,
        installments,
        card_bin: bin,
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

  // Containers dos iframes do CardForm — overflow: visible é obrigatório
  // para que o iframe interno seja clicável e receba foco
  const iframeContainerStyle = {
    width: '100%',
    height: '42px',
    border: '1px solid var(--rose-lt)',
    borderRadius: '8px',
    marginBottom: '.8rem',
    overflow: 'visible',
    background: 'white',
    position: 'relative',
  }
  const iframeRowStyle = {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '.6rem',
  }
  // Campos nativos (input/select) que o SDK não usa iframe
  const nativeFieldStyle = {
    width: '100%',
    height: '42px',
    padding: '0 1rem',
    fontSize: '.9rem',
    fontFamily: 'inherit',
    border: '1px solid var(--rose-lt)',
    borderRadius: '8px',
    marginBottom: '.8rem',
    outline: 'none',
    boxSizing: 'border-box',
    background: 'white',
    color: 'var(--ink)',
  }

  return (
    <div className="modal-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal modal-pay">
        <button className="modal-x" onClick={onClose}>✕</button>

        <div className="modal-icon">{method === 'pix' ? '💸' : '💳'}</div>
        <h3>{gift ? gift.name : 'Contribuição Livre'}</h3>
        <p>Valor: <strong>R$ {valorFmt}</strong></p>

        {step === 'form' && (
          <>
            {/* Toggle PIX / Cartão */}
            <div className="pay-method-toggle">
              <button
                className={`pay-method-btn ${method === 'pix' ? 'on' : 'off'}`}
                onClick={() => { setMethod('pix'); setFormError(''); setSdkReady(false) }}
              >PIX</button>
              <button
                className={`pay-method-btn ${method === 'card' ? 'on' : 'off'}`}
                onClick={() => { setMethod('card'); setFormError('') }}
              >Cartão</button>
            </div>

            {/* Campos comuns */}
            <input
              placeholder="Seu nome completo"
              value={name}
              onChange={e => { setName(e.target.value); setFormError('') }}
            />
            <input
              placeholder="Seu e-mail"
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setEmailError(''); setFormError('') }}
              style={emailError ? { borderColor: '#e05c5c' } : {}}
            />
            {emailError && (
              <p style={{ color: '#e05c5c', fontSize: '.8rem', margin: '-8px 0 4px' }}>{emailError}</p>
            )}

            {/* PIX */}
            {method === 'pix' && (
              <button onClick={handlePix} disabled={loading}>
                {loading ? 'Gerando...' : 'Gerar QR Code PIX'}
              </button>
            )}

            {/* CARTÃO — CardForm com iframes do SDK oficial */}
            {method === 'card' && (
              <form id="mp-card-form" onSubmit={e => e.preventDefault()} style={{ width: '100%', marginTop: '.4rem' }}>
                {/* Número do cartão */}
                <div id="mp-card-number" style={iframeContainerStyle} />

                {/* Validade + CVV */}
                <div style={iframeRowStyle}>
                  <div id="mp-expiration-date" style={iframeContainerStyle} />
                  <div id="mp-security-code" style={iframeContainerStyle} />
                </div>

                {/* Nome no cartão — SDK exige input real, não div */}
                <input
                  id="mp-cardholder-name"
                  placeholder="Nome no cartão"
                  style={nativeFieldStyle}
                />

                {/* CPF — número usa iframe (div), tipo usa select nativo hidden */}
                <select id="mp-identification-type" style={{ display: 'none' }} />
                <div id="mp-identification-number" style={iframeContainerStyle} />

                {/* Bandeira — select nativo hidden (SDK preenche automaticamente) */}
                <select id="mp-issuer" style={{ display: 'none' }} />

                {/* Parcelas — select nativo visível */}
                <select
                  id="mp-installments"
                  style={{ ...nativeFieldStyle, appearance: 'auto' }}
                />

                {!sdkReady && (
                  <p style={{ fontSize: '.78rem', color: 'var(--stone-lt)', textAlign: 'center', margin: '.4rem 0 .8rem' }}>
                    ⏳ Carregando formulário seguro...
                  </p>
                )}

                <button
                  type="button"
                  onClick={handleCard}
                  disabled={loading || !sdkReady}
                  style={{ width: '100%', marginTop: '.4rem' }}
                >
                  {loading ? 'Processando...' : `Pagar R$ ${valorFmt}`}
                </button>
              </form>
            )}

            {formError && (
              <p style={{ color: '#e05c5c', fontSize: '.85rem', textAlign: 'center', marginTop: '.5rem' }}>{formError}</p>
            )}
          </>
        )}

        {step === 'qr' && qrData && (
          <>
            <div className="modal-icon">✅</div>
            <h3>Escaneie o QR Code</h3>
            <img
              src={`data:image/png;base64,${qrData.qr_code_base64}`}
              alt="QR Code PIX"
              style={{ width: '180px', margin: '1rem auto', display: 'block' }}
            />
            <p>Ou copie o código PIX:</p>
            <div
              className="pix-box"
              onClick={() => navigator.clipboard.writeText(qrData.qr_code)}
              title="Clique para copiar"
            >
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

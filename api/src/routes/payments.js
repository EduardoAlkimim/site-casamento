import { Router } from 'express'
import { paymentClient } from '../lib/mercadopago.js'
import { supabase } from '../lib/supabase.js'

const router = Router()

router.post('/create', async (req, res) => {
  const {
    gift_id,
    payer_name,
    payer_email,
    amount,
    type,
    payment_method,
    // Campos do cartão — vindos do CardForm oficial do SDK V2
    card_token,
    issuer_id,
    payment_method_id,
    installments,
  } = req.body

  if (!payer_name || !payer_email || !amount) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando' })
  }

  try {
    let paymentBody

    if (payment_method === 'card' && card_token) {
      if (!payment_method_id) {
        return res.status(400).json({ error: 'payment_method_id ausente — token inválido' })
      }

      paymentBody = {
        transaction_amount: Number(amount),
        description: gift_id ? 'Presente de casamento' : 'Contribuição livre',
        token: card_token,
        payment_method_id,                          // vem direto do SDK — correto e confiável
        issuer_id: issuer_id ? Number(issuer_id) : undefined,
        installments: Number(installments) || 1,
        payer: {
          email: payer_email,
          first_name: payer_name.split(' ')[0],
          last_name: payer_name.split(' ').slice(1).join(' ') || '-',
        },
      }
    } else {
      // PIX
      paymentBody = {
        transaction_amount: Number(amount),
        description: gift_id ? 'Presente de casamento' : 'Contribuição livre',
        payment_method_id: 'pix',
        payer: {
          email: payer_email,
          first_name: payer_name,
        },
      }
    }

    const payment = await paymentClient.create({ body: paymentBody })
    console.log('PAGAMENTO STATUS:', payment.status, '| DETALHE:', payment.status_detail)

    await supabase.from('payments').insert({
      gift_id: gift_id || null,
      payer_name,
      amount,
      type: type || 'free',
      status: payment.status || 'pending',
      mp_payment_id: String(payment.id),
    })

    if (payment_method === 'card') {
      return res.json({
        status: payment.status,
        status_detail: payment.status_detail,
        payment_id: payment.id,
      })
    }

    return res.json({
      qr_code: payment.point_of_interaction.transaction_data.qr_code,
      qr_code_base64: payment.point_of_interaction.transaction_data.qr_code_base64,
      payment_id: payment.id,
    })

  } catch (err) {
    console.error(err)
    res.status(500).json({ error: 'Erro ao criar cobrança' })
  }
})

router.get('/status/:id', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('status')
      .eq('mp_payment_id', req.params.id)
      .single()
    if (error) return res.status(404).json({ error: 'Não encontrado' })
    res.json({ status: data.status })
  } catch (err) {
    res.status(500).json({ error: 'Erro ao buscar status' })
  }
})

export default router

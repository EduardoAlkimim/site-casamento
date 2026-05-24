import { Router } from 'express'
import { paymentClient } from '../lib/mercadopago.js'
import { supabase } from '../lib/supabase.js'

const router = Router()

// Fallback: busca bandeira pelo BIN quando o SDK não consegue inferir
async function getPaymentMethodByBin(bin, accessToken) {
  try {
    const url = `https://api.mercadopago.com/v1/payment_methods/search?bin=${bin}&site_id=MLB`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` }
    })
    const data = await res.json()
    const method = data?.results?.find(m => m.payment_type_id === 'credit_card')
      || data?.results?.find(m => m.payment_type_id === 'debit_card')
      || data?.results?.[0]
    console.log('Fallback BIN lookup — bandeira:', method?.id)
    return method?.id || null
  } catch (err) {
    console.error('Erro no fallback BIN:', err)
    return null
  }
}

router.post('/create', async (req, res) => {
  const {
    gift_id,
    payer_name,
    payer_email,
    amount,
    type,
    payment_method,
    card_token,
    issuer_id,
    payment_method_id,
    installments,
    card_bin, // BIN enviado como fallback pelo frontend
  } = req.body

  if (!payer_name || !payer_email || !amount) {
    return res.status(400).json({ error: 'Campos obrigatórios faltando' })
  }

  try {
    let paymentBody

    if (payment_method === 'card' && card_token) {
      // Tenta usar o payment_method_id do SDK; se vier vazio, busca pelo BIN
      let resolvedMethodId = payment_method_id
      if (!resolvedMethodId && card_bin) {
        resolvedMethodId = await getPaymentMethodByBin(card_bin, process.env.MP_ACCESS_TOKEN)
      }

      if (!resolvedMethodId) {
        return res.status(400).json({ error: 'Não foi possível identificar a bandeira do cartão' })
      }

      paymentBody = {
        transaction_amount: Number(amount),
        description: gift_id ? 'Presente de casamento' : 'Contribuição livre',
        token: card_token,
        payment_method_id: resolvedMethodId,
        issuer_id: issuer_id ? Number(issuer_id) : undefined,
        installments: Number(installments) || 1,
        payer: {
          email: payer_email,
          first_name: payer_name.split(' ')[0],
          last_name: payer_name.split(' ').slice(1).join(' ') || '-',
        },
      }
    } else {
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

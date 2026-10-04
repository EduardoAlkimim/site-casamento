// Carrega o SDK oficial do Mercado Pago só quando alguém escolhe pagar com
// cartão — quem só olha a lista não baixa nada.

type BrickController = { unmount: () => void }
type CardFormData = {
  token: string
  issuer_id?: string
  payment_method_id: string
  transaction_amount: number
  installments: number
  payer: { email: string; identification?: { type: string; number: string } }
}
type MercadoPagoInstance = {
  bricks: () => {
    create: (
      kind: 'cardPayment',
      containerId: string,
      settings: {
        initialization: { amount: number; payer?: { email?: string } }
        customization?: Record<string, unknown>
        callbacks: {
          onReady?: () => void
          onSubmit: (data: CardFormData) => Promise<void>
          onError?: (error: unknown) => void
        }
      },
    ) => Promise<BrickController>
  }
}

declare global {
  interface Window {
    MercadoPago?: new (publicKey: string, options?: { locale: string }) => MercadoPagoInstance
  }
}

export type { BrickController, CardFormData }

let loading: Promise<void> | null = null

export function loadMercadoPago(): Promise<void> {
  if (window.MercadoPago) return Promise.resolve()
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://sdk.mercadopago.com/js/v2'
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => {
      loading = null
      reject(new Error('Não foi possível carregar o pagamento com cartão. Verifique a conexão.'))
    }
    document.head.appendChild(script)
  })
  return loading
}

export async function createMercadoPago(publicKey: string): Promise<MercadoPagoInstance> {
  await loadMercadoPago()
  return new window.MercadoPago!(publicKey, { locale: 'pt-BR' })
}

// Visual do formulário de cartão alinhado aos tokens do site.
export const brickCustomization = {
  visual: {
    hideFormTitle: true,
    style: {
      theme: 'default',
      customVariables: {
        baseColor: '#74303a',
        baseColorFirstVariant: '#5a2430',
        baseColorSecondVariant: '#efdcd3',
        textPrimaryColor: '#3a2a22',
        textSecondaryColor: '#6a5446',
        inputBackgroundColor: '#fbf8f2',
        formBackgroundColor: '#fbf8f2',
        outlinePrimaryColor: '#d8c7ad',
        borderRadiusSmall: '2px',
        borderRadiusMedium: '2px',
        borderRadiusLarge: '2px',
        fontSizeMedium: '16px',
        fontWeightNormal: '400',
      },
    },
  },
  paymentMethods: { maxInstallments: 12 },
}

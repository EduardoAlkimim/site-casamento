function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Variável de ambiente ausente: ${name} (veja apps/api/.env.example)`)
  return value
}

export const config = {
  port: Number(process.env.PORT ?? 3001),
  host: process.env.HOST ?? '127.0.0.1',
  dbPath: process.env.DB_PATH ?? 'data/casamento.db',
  uploadsDir: process.env.UPLOADS_DIR ?? 'data/uploads',
  cookieSecret: required('COOKIE_SECRET'),
  adminPasswordHash: required('ADMIN_PASSWORD_HASH'),
  production: process.env.NODE_ENV === 'production',
  // Endereço público do site (Vercel) — usado para montar os links das tags NFC.
  publicSiteUrl: (process.env.PUBLIC_SITE_URL ?? 'http://localhost:5173').replace(/\/$/, ''),
  // Mercado Pago. Sem o access token, os pagamentos ficam desligados ("em breve").
  mpAccessToken: process.env.MP_ACCESS_TOKEN ?? '',
  mpPublicKey: process.env.MP_PUBLIC_KEY ?? '',
  // Assinatura secreta do webhook (opcional: o status é sempre conferido na API do MP).
  mpWebhookSecret: process.env.MP_WEBHOOK_SECRET ?? '',
}

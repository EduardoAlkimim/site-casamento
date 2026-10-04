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
}

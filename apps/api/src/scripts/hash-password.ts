// Uso: npm run hash-password -w apps/api -- "minha senha"
// Gera o valor de ADMIN_PASSWORD_HASH para o .env.
import { hashPassword } from '../password.ts'

const password = process.argv[2]
if (!password || password.length < 10) {
  console.error('Informe uma senha com pelo menos 10 caracteres.')
  process.exit(1)
}
console.log(hashPassword(password))

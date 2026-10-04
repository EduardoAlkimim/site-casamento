// Cópia consistente do banco (funciona com a API rodando) e limpeza dos
// backups com mais de 14 dias. Rodado pelo casamento-backup.timer.
import { mkdirSync, readdirSync, unlinkSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { backup, DatabaseSync } from 'node:sqlite'

const dbPath = process.env.DB_PATH ?? 'data/casamento.db'
const dir = join(dirname(dbPath), 'backups')
const stamp = new Date().toISOString().slice(0, 10)
const target = join(dir, `casamento-${stamp}.db`)

mkdirSync(dir, { recursive: true })
const db = new DatabaseSync(dbPath, { readOnly: true })
await backup(db, target)
db.close()
console.log(`backup: ${target}`)

const keep = 14
const files = readdirSync(dir).filter(f => /^casamento-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort()
for (const old of files.slice(0, Math.max(0, files.length - keep))) unlinkSync(join(dir, old))

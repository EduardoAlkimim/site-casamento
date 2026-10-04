import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { config } from './config.ts'

// SQLite embutido no Node: sem serviço extra rodando na VM de 500 MB e com
// backup simples (um arquivo). Para ~100 convidados sobra capacidade.
mkdirSync(dirname(config.dbPath), { recursive: true })
export const db = new DatabaseSync(config.dbPath)
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;')

// Cada item roda uma única vez, em ordem; a versão fica em PRAGMA user_version.
const migrations: string[] = [
  `
  CREATE TABLE pages (
    slug TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    position INTEGER NOT NULL,
    locked INTEGER NOT NULL DEFAULT 0,
    lock_message TEXT
  );
  INSERT INTO pages (slug, title, position, locked) VALUES
    ('nossa-historia', 'Nossa História', 1, 0),
    ('informacoes', 'Informações', 2, 0),
    ('cha-de-panela', 'Chá de Panela', 3, 1),
    ('presentes', 'Lista de Presentes', 4, 1),
    ('recados', 'Deixe um Recado', 5, 0);

  CREATE TABLE padrinhos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'padrinho' CHECK (role IN ('padrinho', 'madrinha')),
    personal_message TEXT NOT NULL DEFAULT '',
    token_hash TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_seen_at TEXT
  );

  CREATE TABLE manual_sections (
    id INTEGER PRIMARY KEY,
    position INTEGER NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL
  );
  INSERT INTO manual_sections (position, title, body) VALUES
    (1, 'O traje', 'Texto provisório: em breve contamos as cores e o estilo pensados para vocês. A cerimônia é no jardim, sobre a grama — escolham um sapato que aguente bem.'),
    (2, 'Horários', 'Texto provisório: chegada dos padrinhos a confirmar. A cerimônia começa às 16h30, ao pôr do sol.'),
    (3, 'No dia', 'Texto provisório: entrada, ordem do cortejo e posição no altar. Vamos ensaiar tudo juntos antes.'),
    (4, 'Fale com a gente', 'Texto provisório: qualquer dúvida, falem direto com a gente. Vocês fazem parte disso.');
  `,
  `
  -- Textos editáveis do topo de cada página.
  ALTER TABLE pages ADD COLUMN heading TEXT;
  ALTER TABLE pages ADD COLUMN intro TEXT;
  UPDATE pages SET heading = 'Presenteie com carinho',
    intro = 'Texto provisório: a presença de vocês já é o nosso maior presente. Se quiserem ir além, deixamos algumas ideias para a casa nova.'
    WHERE slug = 'presentes';
  UPDATE pages SET heading = 'Chá de Panela',
    intro = 'Texto provisório: data, local e a lista do chá entram aqui em breve.'
    WHERE slug = 'cha-de-panela';

  -- Presentes das duas listas (casamento e chá de panela).
  CREATE TABLE gifts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    list TEXT NOT NULL CHECK (list IN ('casamento', 'cha')),
    position INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    image TEXT,
    price_cents INTEGER CHECK (price_cents IS NULL OR price_cents > 0),
    status TEXT NOT NULL DEFAULT 'disponivel' CHECK (status IN ('disponivel', 'reservado', 'presenteado')),
    purchase_mode TEXT NOT NULL DEFAULT 'site' CHECK (purchase_mode IN ('site', 'link')),
    external_url TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX gifts_list_position ON gifts (list, position);
  `,
]

const { user_version: current } = db.prepare('PRAGMA user_version').get() as { user_version: number }
for (let v = current; v < migrations.length; v++) {
  db.exec('BEGIN')
  try {
    db.exec(migrations[v])
    db.exec(`PRAGMA user_version = ${v + 1}`)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

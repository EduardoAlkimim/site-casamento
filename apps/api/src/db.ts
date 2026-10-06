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
  `
  -- Pagamentos (Mercado Pago). O valor é copiado do presente no momento da compra.
  CREATE TABLE payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    public_id TEXT NOT NULL UNIQUE,
    gift_id INTEGER REFERENCES gifts(id) ON DELETE SET NULL,
    gift_name TEXT NOT NULL,
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    method TEXT NOT NULL CHECK (method IN ('pix', 'card')),
    payer_name TEXT NOT NULL,
    payer_email TEXT NOT NULL,
    provider_id TEXT UNIQUE,
    status TEXT NOT NULL DEFAULT 'creating',
    status_detail TEXT,
    message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    approved_at TEXT
  );
  CREATE INDEX payments_gift ON payments (gift_id);
  `,
  `
  -- Nossa História: capítulos em ordem. image = upload ou caminho fixo (/fotos/...).
  CREATE TABLE story_moments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    position INTEGER NOT NULL,
    date_label TEXT NOT NULL DEFAULT '',
    title TEXT NOT NULL,
    body TEXT NOT NULL DEFAULT '',
    image TEXT
  );
  INSERT INTO story_moments (position, date_label, title, body, image) VALUES
    (1, 'Ensino médio', 'Onde tudo começou', 'Nossa história começou na escola, no início do ensino médio. Passamos dois anos por ali sem trocar uma única palavra. Foi só no terceiro ano que, enfim, começamos a conversar.', '/fotos/foto6.jpg'),
    (2, 'Terceiro ano', 'O que nos uniu', 'Bastaram as primeiras conversas para percebermos o quanto tínhamos em comum: a igreja, a família e o jeito de enxergar a vida. Dali nasceu um sentimento único.', '/fotos/foto3.jpg'),
    (3, '11 de dezembro de 2023', 'O pedido de namoro', 'Essas conversas nos levaram a um almoço com toda a nossa família reunida. E ali, diante de todos, veio o pedido para seguirmos juntos.', '/fotos/foto1.jpg'),
    (4, '11 de abril de 2026', 'O noivado', 'Em 11 de abril de 2026, durante uma viagem em família, veio o pedido de noivado. Um sim que nos trouxe até aqui e que agora queremos celebrar com vocês.', '/fotos/foto7.jpg'),
    (5, '21 de abril de 2027', 'Para sempre começa aqui', 'No dia 21 de abril de 2027, vamos prometer um ao outro tudo o que já sentimos. E o resto da vida começa.', NULL);

  -- Informações: blocos editoriais ('destaque') e perguntas frequentes ('faq').
  CREATE TABLE info_blocks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    position INTEGER NOT NULL,
    kind TEXT NOT NULL DEFAULT 'destaque' CHECK (kind IN ('destaque', 'faq')),
    title TEXT NOT NULL,
    subtitle TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    address TEXT NOT NULL DEFAULT '',
    map_url TEXT
  );
  INSERT INTO info_blocks (position, kind, title, subtitle, body, address) VALUES
    (1, 'destaque', 'Cerimônia', '21 de abril de 2027 · 16h30', 'Texto provisório: a cerimônia é ao ar livre, no jardim, ao pôr do sol. Chegue uns 30 minutos antes para aproveitar com calma.', 'Horto Brasília Convention · Brasília, DF'),
    (2, 'destaque', 'Recepção', 'Logo depois da cerimônia', 'Texto provisório: a festa continua no mesmo lugar. Jantar, pista e muito carinho.', ''),
    (3, 'destaque', 'Traje', '', 'Texto provisório: em breve contamos o traje. Lembrem que a cerimônia é na grama — sapatos confortáveis ajudam muito.', ''),
    (4, 'destaque', 'Estacionamento', '', 'Texto provisório: informações sobre estacionamento no local.', ''),
    (5, 'destaque', 'Hospedagem', '', 'Texto provisório: sugestões de hotéis para quem vem de fora.', ''),
    (6, 'faq', 'Posso levar acompanhante?', '', 'Texto provisório: os nomes no convite são os convidados confirmados.', ''),
    (7, 'faq', 'Crianças são bem-vindas?', '', 'Texto provisório: resposta dos noivos.', '');

  -- Recados dos convidados; só aparecem no mural depois de aprovados.
  CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    author_name TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'oculto')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  UPDATE pages SET heading = 'De dois a um',
    intro = 'Texto provisório: do primeiro sim, em 2023, ao sim que vamos dizer em 2027. Role devagar.'
    WHERE slug = 'nossa-historia';
  UPDATE pages SET heading = 'Tudo o que você precisa saber',
    intro = 'Texto provisório: local, horários e alguns detalhes para o dia ser leve para todo mundo.'
    WHERE slug = 'informacoes';
  UPDATE pages SET heading = 'Palavras que vamos guardar',
    intro = 'Texto provisório: uma palavra, uma lembrança, um conselho. Vamos guardar cada uma.'
    WHERE slug = 'recados';
  `,
  `
  -- Textos soltos do site (página inicial etc.), editáveis no painel.
  CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );
  INSERT INTO settings (key, value) VALUES
    ('home.phrase', 'Ao pôr do sol, entre o verde do Horto, vamos dizer sim.'),
    ('home.dayTitle', 'Ao pôr do sol,'),
    ('home.dayTitleEm', 'no meio do verde.'),
    ('home.ceremonyTime', '16h30'),
    ('home.venue', 'Horto Brasília Convention'),
    ('home.city', 'Brasília, DF');
  -- Recados agora são só para os noivos: 'pendente' = novo, 'aprovado' = lido.
  UPDATE pages SET intro = 'Texto provisório: uma palavra, uma lembrança, um conselho. Só nós dois vamos ler.'
    WHERE slug = 'recados' AND intro LIKE 'Texto provisório:%';
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

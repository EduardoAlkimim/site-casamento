# Arquitetura — Eduardo & Thamires · 21.04.2027

Projeto novo, escrito do zero. O projeto antigo (`Desktop/Site-casamento-main` + backend
no repositório GitHub `EduardoAlkimim/site-casamento`, pasta `api/`) é só referência funcional.

## Decisões

| Tema | Decisão |
|---|---|
| Site | Vercel (estático). `apps/web/vercel.json` repassa `/api/*` para a VM |
| API | VM gratuita Oracle E2.1.Micro (x86, ~500 MB RAM, Oracle Linux 9, usuário `opc`, 144.22.185.103), sem Docker |
| Banco | SQLite embutido no Node (`node:sqlite`), um arquivo, backup diário |
| Frontend | Vite + React + TypeScript + React Router, CSS Modules + tokens |
| Backend | Fastify + TypeScript rodando direto no Node 24+ (sem build), validação por JSON Schema |
| Pagamentos | Mercado Pago (PIX + cartão) atrás de uma interface `PaymentProvider` |
| IA / ML | Nenhuma por enquanto. Se vier, entra como serviço separado atrás de uma interface na API |
| HTTPS | Vercel no site; Caddy (certificado automático) na frente da API |

## Visão geral

```
Navegador ──▶ Vercel (site) ──/api/*──▶ Caddy na VM (HTTPS, 144-22-185-103.sslip.io)
                                            └──▶ API Fastify (127.0.0.1:3001) ──▶ SQLite
                                                       └──▶ Mercado Pago (+ webhook)
```

Como a Vercel repassa `/api` no mesmo domínio do site, os cookies são de primeira parte e não há CORS.

Regras:
- Nenhuma chave secreta no frontend. O frontend só conhece a chave pública do Mercado Pago.
- O valor do pagamento é sempre calculado no servidor a partir do `gift_id`.
- Confirmação de pagamento pelo webhook do Mercado Pago (polling do site só lê o banco).
- Admin com login (senha com hash scrypt, limite de tentativas) e cookie assinado `httpOnly`, nunca token no bundle.
- **Bloqueio de páginas**: tabela `pages.locked`, alternado no `/painel`. A API devolve 423 para o conteúdo de página bloqueada (`assertUnlocked`); o site mostra a tela "Em breve".
- **Padrinhos (NFC)**: cada tag grava `https://<site>/p/<token>`. O site troca o token por um cookie assinado (1 ano) e abre `/padrinhos` — página pessoal + manual comum. Só o hash do token fica no banco; "Novo link" invalida a tag antiga.

## Pastas

```
casamento-2027/
├─ apps/
│  ├─ web/   site (design-system/, pages/, content/, lib/, styles/)
│  └─ api/   backend: src/{routes, db.ts, auth.ts}, dados em data/ (fora do git)
├─ infra/    docker-compose.yml, Caddyfile (etapa 9), .env.example
└─ docs/     este arquivo, DESIGN.md
```

## Modelo de dados (proposta, a confirmar na etapa 7)

- `wedding` — casal, data, frase, configurações gerais
- `events` — cerimônia, recepção, chá de panela (data, hora, local, endereço, mapa)
- `info_blocks` — blocos modulares por evento (traje, estacionamento, hospedagem, FAQ…), com `kind` e `position`
- `story_moments` — história do casal (data, título, texto, foto)
- `media` — fotos (caminho no storage, legenda, dimensões)
- `gifts` — presente (evento, nome, descrição, imagem, valor, `status`: disponível/reservado/comprado, `purchase_mode`: pagamento | link externo)
- `payments` — `provider`, `provider_id`, valor, status, presente, nome/e-mail do pagador
- `messages` — recado (nome, texto, `status`: pendente/aprovado/rejeitado, `payment_id` opcional)
- `guests`, `rsvps` — convidados e confirmações por evento
- `admin_users`

## Funcionalidades herdadas do projeto antigo

- Contagem regressiva; história em linha do tempo; galeria (7 fotos)
- Lista de presentes + contribuição de valor livre
- PIX (QR Code + copia e cola, confirmação automática) e cartão com parcelas (CardForm MP)
- Recado opcional após o pagamento; painel admin para presentes e recados

## Deploy (etapa 9)

1. Na VM: Node 24, Caddy, swap de 1 GB; API como serviço systemd escutando só em 127.0.0.1.
2. Caddy com `144-22-185-103.sslip.io` (HTTPS automático) → `127.0.0.1:3001`. Liberar portas 80/443 na Security List da Oracle e no firewalld.
3. Vercel: projeto apontando para `apps/web`; `PUBLIC_SITE_URL` da API = domínio da Vercel.
4. Backup diário do arquivo SQLite (`sqlite3 .backup`) para o Object Storage da Oracle.

# Site-casamento

Site de casamento full stack, com backend prÃ³prio em Node.js e **integraÃ§Ã£o com Mercado Pago** para gestÃ£o de pagamentos (lista de presentes / contribuiÃ§Ãµes).

## Stack

- **Frontend:** `web/`
- **Backend:** Node.js (`api/`) com integraÃ§Ã£o Ã  API do Mercado Pago
- **Deploy:** Vercel

## Estrutura

```
.
â”œâ”€â”€ api/     # backend Node.js + integraÃ§Ã£o Mercado Pago
â””â”€â”€ web/     # frontend
```

## Como rodar localmente

```bash
git clone https://github.com/EduardoAlkimim/site-casamento.git
cd Site-casamento/api
npm install
```

Configure as credenciais do Mercado Pago em um `.env` local (nÃ£o versionado â€” veja `.gitignore`), depois:

```bash
npm start
```

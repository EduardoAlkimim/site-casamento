# Site-casamento

Site de casamento full stack, com backend próprio em Node.js e **integração com Mercado Pago** para gestão de pagamentos (lista de presentes / contribuições).

## Stack

- **Frontend:** `web/`
- **Backend:** Node.js (`api/`) com integração à API do Mercado Pago
- **Deploy:** Vercel

## Estrutura

```
.
├── api/     # backend Node.js + integração Mercado Pago
└── web/     # frontend
```

## Como rodar localmente

```bash
git clone https://github.com/EduardoAlkimim/Site-casamento.git
cd Site-casamento/api
npm install
```

Configure as credenciais do Mercado Pago em um `.env` local (não versionado — veja `.gitignore`), depois:

```bash
npm start
```

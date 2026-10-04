# Eduardo & Thamires · 21.04.2027

Site do casamento, reconstruído do zero. Ver `docs/ARQUITETURA.md` e `docs/DESIGN.md`.

## Rodar localmente

```sh
npm install
npm run dev:web        # http://localhost:5173
```

API local: copie `apps/api/.env.example` para `apps/api/.env`, preencha e rode `npm run dev -w api` (http://localhost:3001). Painel: `/painel`.

## Observação sobre o Windows

O `package.json` da raiz fixa `rolldown` em `1.0.1` (via `overrides`). A versão mais nova do binário
nativo foi bloqueada pelo Controle de Aplicativo do Windows nesta máquina; a 1.0.1 já é confiável.
Pode remover o override quando a versão nova deixar de ser bloqueada.

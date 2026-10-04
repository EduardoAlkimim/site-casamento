# Design system — "Linho, vinho & folhagem"

Página viva: `/design-system` (fora do menu).

## Conceito
A festa é **Tropical Boho Luxo** no Horto Brasília Convention, cerimônia às 16h30 ao pôr do sol.
O site traduz isso de forma contida: base clara de linho e café (como as fotos do casal) e as cores
da festa só em detalhes — um "&" terracota, um fio dourado, folhas tropicais em traço único.

## Regras
- **Cores**: tokens em `apps/web/src/styles/tokens.css`. Nunca hex direto em componente.
  Terracota e ocre não servem para texto pequeno (contraste < 4.5:1); use vinho ou café.
- **Tipografia**: Instrument Serif para nomes, títulos, datas e frases; Jost para texto, botões e navegação.
  Rótulos sempre em caixa alta, 13px, tracking 0.18em.
- **Botânicos**: costela-de-adão, bananeira, palmeira e raminho (`design-system/botanicals`). No máximo
  dois por tela, sempre em verde-folha, traço fino, vazando de uma moldura — nunca como estampa de fundo.
- **Formas**: arco (moldura de foto, amostras), linhas finas (1px), sem cards com sombra.
- **Listas**: índice editorial com numeração romana e linhas finas, em vez de grade de cards.
- **Movimento**: entrada da abertura uma vez; folhas se desenham; revelação suave ao rolar.
  Tudo desligado com `prefers-reduced-motion`.
- **Toque**: alvos ≥ 44px; menu de três pontos abre `<dialog>` nativo (Esc, foco preso, volta do foco).

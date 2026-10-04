// Conteúdo do casamento. Hoje é estático; na etapa 7 passa a vir da API
// (tabelas `wedding` e `events`) mantendo este mesmo formato.

export const wedding = {
  couple: { first: 'Eduardo', second: 'Thamires', monogram: 'E & T' },
  // Cerimônia às 16h30, ao pôr do sol (projeto de decoração). Horário de Brasília.
  date: '2027-04-21T16:30:00-03:00',
  dateLong: 'Quarta-feira, 21 de abril de 2027',
  dateShort: '21 · 04 · 2027',
  // Frase de abertura — texto provisório, para os noivos reescreverem.
  phrase: 'Ao pôr do sol, entre o verde do Horto, vamos dizer sim.',
  venue: {
    name: 'Horto Brasília Convention',
    city: 'Brasília, DF',
  },
  ceremonyTime: '16h30',
  heroPhoto: { src: '/fotos/foto2.jpg', alt: 'Eduardo beija a testa de Thamires na praia, ao fim da tarde', position: '52% 40%' },
} as const

export type NavItem = { to: string; label: string; hint: string }

export const navigation: NavItem[] = [
  { to: '/', label: 'Início', hint: 'O nosso dia' },
  { to: '/nossa-historia', label: 'Nossa História', hint: 'De 2023 até o sim' },
  { to: '/informacoes', label: 'Informações', hint: 'Local, horário, traje' },
  { to: '/cha-de-panela', label: 'Chá de Panela', hint: 'Antes do grande dia' },
  { to: '/presentes', label: 'Lista de Presentes', hint: 'Se quiser nos presentear' },
  { to: '/recados', label: 'Deixe um Recado', hint: 'Palavras para guardarmos' },
]

/** Só aparece para quem entrou pela tag NFC (ou para os noivos no painel). */
export const padrinhosNav: NavItem = { to: '/padrinhos', label: 'Manual do Padrinho', hint: 'Só para vocês' }

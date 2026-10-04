import { useEffect } from 'react'

const SELECTOR = '[data-reveal]:not([data-reveal="in"])'

// Revela elementos com [data-reveal] quando entram na tela — inclusive os que
// aparecem depois (conteúdo vindo da API). Sem JS ou com movimento reduzido,
// o CSS já mostra tudo no estado final.
export function useReveal() {
  useEffect(() => {
    if (!('IntersectionObserver' in window)) {
      document.querySelectorAll<HTMLElement>(SELECTOR).forEach(t => (t.dataset.reveal = 'in'))
      return
    }

    const io = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          ;(entry.target as HTMLElement).dataset.reveal = 'in'
          io.unobserve(entry.target)
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    )

    const watch = () => document.querySelectorAll(SELECTOR).forEach(t => io.observe(t))
    watch()
    const mo = new MutationObserver(watch)
    mo.observe(document.body, { childList: true, subtree: true })

    return () => {
      mo.disconnect()
      io.disconnect()
    }
  }, [])
}

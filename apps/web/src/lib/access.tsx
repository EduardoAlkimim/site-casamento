import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, type Padrinho, type Page, type SiteTexts } from './api'
import { wedding } from '../content/wedding'

type Access = {
  /** Estado de bloqueio por página (slug). Vazio até a API responder. */
  pages: Record<string, Page>
  /** Textos soltos do site (página inicial…), editáveis no painel. */
  site: SiteTexts
  padrinho: Padrinho | null
  admin: boolean
  ready: boolean
  /** A API não respondeu: o site segue funcionando, só sem as áreas restritas. */
  offline: boolean
  refresh: () => Promise<void>
}

// Se a API não responder, o site usa os textos que já estavam no código.
const FALLBACK_SITE: SiteTexts = {
  phrase: wedding.phrase,
  dayTitle: 'Ao pôr do sol,',
  dayTitleEm: 'no meio do verde.',
  ceremonyTime: wedding.ceremonyTime,
  venue: wedding.venue.name,
  city: wedding.venue.city,
}

const AccessContext = createContext<Access | null>(null)

export function AccessProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Omit<Access, 'refresh'>>({
    pages: {},
    site: FALLBACK_SITE,
    padrinho: null,
    admin: false,
    ready: false,
    offline: false,
  })

  const refresh = useCallback(async () => {
    try {
      const [{ pages }, me, { site }] = await Promise.all([
        api<{ pages: Page[] }>('/pages'),
        api<{ padrinho: Padrinho | null; admin: boolean }>('/me'),
        api<{ site: SiteTexts }>('/site'),
      ])
      setState({
        pages: Object.fromEntries(pages.map(p => [p.slug, p])),
        site,
        padrinho: me.padrinho,
        admin: me.admin,
        ready: true,
        offline: false,
      })
    } catch {
      setState(s => ({ ...s, ready: true, offline: true }))
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return <AccessContext.Provider value={{ ...state, refresh }}>{children}</AccessContext.Provider>
}

export function useAccess(): Access {
  const ctx = useContext(AccessContext)
  if (!ctx) throw new Error('useAccess precisa estar dentro de <AccessProvider>')
  return ctx
}

/** slug da página a partir do caminho: '/presentes' → 'presentes'. */
export const slugOf = (path: string) => path.replace(/^\//, '')

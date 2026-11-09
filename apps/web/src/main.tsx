import { lazy, StrictMode, Suspense, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router'
import './styles/base.css'
import { AccessProvider } from './lib/access'
import { PageGate } from './design-system/components/LockScreen'
import { SiteLayout } from './design-system/components/SiteLayout'
import DesignSystem from './pages/DesignSystem'
import GiftList from './pages/GiftList'
import Historia from './pages/Historia'
import Informacoes from './pages/Informacoes'
import Recados from './pages/Recados'
import Home from './pages/Home'
import NfcEntry from './pages/NfcEntry'
import Padrinhos from './pages/Padrinhos'
import Painel from './pages/Painel'
import Soon from './pages/Soon'

// Convite do chá: página à parte (sem o menu do site), carregada só quando abrem o link.
const ConviteCha = lazy(() => import('./pages/ConviteCha'))

// Páginas que podem ser bloqueadas pelo painel (slug = caminho sem a barra).
const content: Record<string, ReactNode> = {
  presentes: <GiftList list="casamento" />,
  'cha-de-panela': <GiftList list="cha" />,
  'nossa-historia': <Historia />,
  informacoes: <Informacoes />,
  recados: <Recados />,
}
const gated = ['nossa-historia', 'informacoes', 'cha-de-panela', 'presentes', 'recados'].map(slug => ({
  path: `/${slug}`,
  element: <PageGate slug={slug}>{content[slug] ?? <Soon />}</PageGate>,
}))

const router = createBrowserRouter([
  {
    path: '/cha',
    element: (
      <Suspense fallback={null}>
        <ConviteCha />
      </Suspense>
    ),
  },
  {
    element: <SiteLayout />,
    children: [
      { path: '/', element: <Home /> },
      ...gated,
      { path: '/padrinhos', element: <Padrinhos /> },
      { path: '/p/:token', element: <NfcEntry /> },
      { path: '/painel/:secao?', element: <Painel /> },
      { path: '/design-system', element: <DesignSystem /> },
      { path: '*', element: <Soon /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AccessProvider>
      <RouterProvider router={router} />
    </AccessProvider>
  </StrictMode>,
)

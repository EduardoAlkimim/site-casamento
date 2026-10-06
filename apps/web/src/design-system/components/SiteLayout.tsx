import { useEffect, useRef } from 'react'
import { Outlet, ScrollRestoration, useLocation } from 'react-router'
import { wedding } from '../../content/wedding'
import { useReveal } from '../../lib/useReveal'
import { useAccess } from '../../lib/access'
import { Divider } from './Ornaments'
import { SiteHeader } from './SiteHeader'
import styles from './SiteLayout.module.css'

export function SiteLayout() {
  const { pathname } = useLocation()
  const { site } = useAccess()
  useReveal()

  // Ao trocar de página, leva o foco para o conteúdo (leitores de tela).
  const firstRender = useRef(true)
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    document.getElementById('conteudo')?.focus({ preventScroll: true })
  }, [pathname])

  return (
    <>
      <a href="#conteudo" className="skip-link">Pular para o conteúdo</a>
      <SiteHeader />
      <main id="conteudo" tabIndex={-1} className={styles.main}>
        <Outlet />
      </main>
      <footer className={styles.footer}>
        <Divider />
        <p className={styles.names}>
          {wedding.couple.first} <em>&amp;</em> {wedding.couple.second}
        </p>
        <p className={styles.meta}>
          {wedding.dateShort} · {site.city}
        </p>
      </footer>
      <ScrollRestoration />
    </>
  )
}

import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { navigation, padrinhosNav, wedding } from '../../content/wedding'
import { slugOf, useAccess } from '../../lib/access'
import { Monstera } from '../botanicals/Botanicals'
import styles from './SiteHeader.module.css'

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']

export function SiteHeader() {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const { pages, padrinho, admin, site } = useAccess()
  const items = padrinho || admin ? [...navigation, padrinhosNav] : navigation

  // Fecha o menu ao navegar.
  useEffect(() => {
    dialogRef.current?.close()
  }, [pathname])

  const openMenu = () => {
    dialogRef.current?.showModal()
    setOpen(true)
  }

  return (
    <header className={styles.header}>
      <Link to="/" className={styles.monogram} aria-label={`${wedding.couple.first} e ${wedding.couple.second} — início`}>
        E<span className={styles.amp}>&amp;</span>T
      </Link>

      <button
        type="button"
        className={styles.dots}
        onClick={openMenu}
        aria-label="Abrir menu"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="site-menu"
      >
        <span />
        <span />
        <span />
      </button>

      <dialog
        id="site-menu"
        ref={dialogRef}
        className={styles.menu}
        aria-label="Menu"
        onClose={() => setOpen(false)}
        onClick={e => e.target === e.currentTarget && dialogRef.current?.close()}
      >
        <div className={styles.menuInner}>
          <div className={styles.menuTop}>
            <span className={styles.menuDate}>{wedding.dateShort}</span>
            <button type="button" className={styles.close} onClick={() => dialogRef.current?.close()} aria-label="Fechar menu">
              <span />
              <span />
            </button>
          </div>

          <nav aria-label="Principal">
            <ol className={styles.list}>
              {items.map((item, i) => (
                <li key={item.to} style={{ '--i': i } as CSSProperties}>
                  <NavLink to={item.to} end className={({ isActive }) => [styles.link, isActive && styles.active].filter(Boolean).join(' ')}>
                    <span className={styles.num} aria-hidden="true">{ROMAN[i]}</span>
                    <span className={styles.label}>{item.label}</span>
                    <span className={styles.hint}>{pages[slugOf(item.to)]?.locked ? 'Em breve' : item.hint}</span>
                  </NavLink>
                </li>
              ))}
            </ol>
          </nav>

          <p className={styles.menuFoot}>
            {site.venue}
            <br />
            {site.city}
          </p>
        </div>
        <Monstera className={styles.menuLeaf} strokeWidth={1} />
      </dialog>
    </header>
  )
}

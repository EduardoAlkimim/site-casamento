import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { api, type AdminPadrinho, type ManualSection, type Page } from '../lib/api'
import { useAccess } from '../lib/access'
import { formatBRL } from '../lib/money'
import { Button } from '../design-system/components/Button'
import { Field } from '../design-system/components/Field'
import { Eyebrow } from '../design-system/components/Ornaments'
import { Switch } from '../design-system/components/Switch'
import styles from './Painel.module.css'
import { SectionEditor } from './painel/ManualEditor'
import { ListasPanel } from './painel/ListasPanel'
import { RecebidosPanel } from './painel/RecebidosPanel'
import { HistoriaPanel, InformacoesPanel, InicioPanel, PendenciasPanel, RecadosPanel } from './painel/ContentPanels'

export default function Painel() {
  const { admin, ready } = useAccess()
  if (!ready) return <div className={styles.pending} aria-busy="true" />
  return admin ? <Dashboard /> : <Login />
}

/* ── Entrada ─────────────────────────────────────────────────────────── */
function Login() {
  const { refresh } = useAccess()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(undefined)
    try {
      await api('/admin/login', { body: { password } })
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className={styles.login}>
      <Eyebrow>Painel dos noivos</Eyebrow>
      <h1 className={styles.title}>Entrar</h1>
      <form className={styles.loginForm} onSubmit={submit}>
        <Field
          label="Senha"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          error={error}
          required
        />
        <Button type="submit" loading={loading}>
          Entrar
        </Button>
      </form>
    </section>
  )
}

/* ── Painel: índice + uma página por seção ───────────────────────────── */
type Section = {
  slug: string
  label: string
  group: 'O site' | 'Presentes' | 'Convidados'
  num?: string
  render: () => ReactNode
}

const SECTIONS: Section[] = [
  { slug: 'revisar', label: 'Textos para revisar', group: 'O site', render: () => <PendenciasPanel /> },
  { slug: 'paginas', label: 'Abrir e bloquear', group: 'O site', num: 'I', render: () => <PagesPanel /> },
  { slug: 'inicio', label: 'Página inicial', group: 'O site', num: 'II', render: () => <InicioPanel /> },
  { slug: 'historia', label: 'Nossa História', group: 'O site', num: 'III', render: () => <HistoriaPanel /> },
  { slug: 'informacoes', label: 'Informações', group: 'O site', num: 'IV', render: () => <InformacoesPanel /> },
  { slug: 'presentes', label: 'Lista do casamento', group: 'Presentes', num: 'V', render: () => <ListasPanel /> },
  { slug: 'cha', label: 'Chá de Panela', group: 'Presentes', num: 'VI', render: () => <ListasPanel initial="cha" /> },
  { slug: 'recebidos', label: 'Presentes recebidos', group: 'Presentes', num: 'VII', render: () => <RecebidosPanel /> },
  { slug: 'recados', label: 'Recados', group: 'Convidados', num: 'VIII', render: () => <RecadosPanel /> },
  { slug: 'padrinhos', label: 'Padrinhos e tags NFC', group: 'Convidados', num: 'IX', render: () => <PadrinhosPanel /> },
  { slug: 'manual', label: 'Manual do Padrinho', group: 'Convidados', num: 'X', render: () => <ManualPanel /> },
]

function Dashboard() {
  const { secao } = useParams()
  if (!secao) return <Overview />
  const section = SECTIONS.find(s => s.slug === secao)
  return (
    <div className={`${styles.dashboard} ${styles.sectionPage}`}>
      <Link to="/painel" className={styles.back}>
        <svg viewBox="0 0 32 12" aria-hidden="true">
          <path d="M32 6H2M7 1 2 6l5 5" fill="none" stroke="currentColor" strokeWidth="1" />
        </svg>
        Painel
      </Link>
      {section ? section.render() : <p className={styles.help}>Esta seção não existe.</p>}
    </div>
  )
}

type Summary = {
  pendencias: number
  recadosNovos: number
  recebidoCents: number
  recebidos: number
  padrinhos: number
  presentes: number
  cha: number
  chaReservados: number
}

function Overview() {
  const { pages, refresh } = useAccess()
  const [sum, setSum] = useState<Summary | null>(null)

  useEffect(() => {
    // Números do resumo; se algum falhar, o índice aparece mesmo assim.
    const safe = <T,>(p: Promise<T>, fallback: T) => p.catch(() => fallback)
    Promise.all([
      safe(api<{ items: unknown[] }>('/admin/pendencias'), { items: [] }),
      safe(api<{ messages: { status: string }[] }>('/admin/recados'), { messages: [] }),
      safe(api<{ payments: { status: string; amountCents: number }[] }>('/admin/pagamentos'), { payments: [] }),
      safe(api<{ padrinhos: unknown[] }>('/admin/padrinhos'), { padrinhos: [] }),
      safe(api<{ gifts: unknown[] }>('/admin/listas/casamento'), { gifts: [] }),
      safe(api<{ gifts: { status: string }[] }>('/admin/listas/cha'), { gifts: [] }),
    ]).then(([p, r, pay, pad, gc, gh]) => {
      const approved = pay.payments.filter(x => x.status === 'approved')
      setSum({
        pendencias: p.items.length,
        recadosNovos: r.messages.filter(m => m.status === 'pendente').length,
        recebidoCents: approved.reduce((t, x) => t + x.amountCents, 0),
        recebidos: approved.length,
        padrinhos: pad.padrinhos.length,
        presentes: gc.gifts.length,
        cha: gh.gifts.length,
        chaReservados: gh.gifts.filter(g => g.status === 'reservado').length,
      })
    })
  }, [])

  const logout = async () => {
    await api('/admin/logout', { body: {} })
    await refresh()
  }

  const locked = Object.values(pages).filter(p => p.locked)
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

  // Resumo curto ao lado de cada seção; destaque quando pede atenção.
  const hint = (slug: string): { text: string; alert?: boolean } => {
    if (!sum) return { text: '' }
    switch (slug) {
      case 'revisar':
        return sum.pendencias ? { text: plural(sum.pendencias, 'pendente', 'pendentes'), alert: true } : { text: 'Tudo revisado' }
      case 'paginas':
        return { text: locked.length ? `${plural(locked.length, 'bloqueada', 'bloqueadas')}` : 'Todas abertas' }
      case 'inicio':
        return { text: 'Frase, horário e local' }
      case 'historia':
        return { text: 'Capítulos e fotos' }
      case 'informacoes':
        return { text: 'Blocos e perguntas' }
      case 'presentes':
        return { text: plural(sum.presentes, 'presente', 'presentes') }
      case 'cha':
        return {
          text: sum.cha
            ? `${plural(sum.cha, 'item', 'itens')} · ${plural(sum.chaReservados, 'reservado', 'reservados')}`
            : 'Lista por cômodos — comece colando a lista',
        }
      case 'recebidos':
        return { text: sum.recebidos ? `${formatBRL(sum.recebidoCents)} em ${plural(sum.recebidos, 'presente', 'presentes')}` : 'Nenhum ainda' }
      case 'recados':
        return sum.recadosNovos ? { text: plural(sum.recadosNovos, 'novo', 'novos'), alert: true } : { text: 'Nenhum novo' }
      case 'padrinhos':
        return { text: plural(sum.padrinhos, 'cadastrado', 'cadastrados') }
      case 'manual':
        return { text: 'Texto para os padrinhos' }
      default:
        return { text: '' }
    }
  }

  return (
    <div className={styles.dashboard}>
      <header className={styles.head}>
        <div>
          <Eyebrow>Painel dos noivos</Eyebrow>
          <h1 className={styles.title}>
            Olá, <em>noivos</em>
          </h1>
        </div>
        <Button variant="quiet" onClick={logout}>
          Sair
        </Button>
      </header>

      {(['O site', 'Presentes', 'Convidados'] as const).map(group => (
        <section key={group} className={styles.group} aria-labelledby={`grupo-${group}`}>
          <h2 id={`grupo-${group}`} className={styles.groupTitle}>{group}</h2>
          <ul className={styles.index}>
            {SECTIONS.filter(s => s.group === group).map(s => {
              const h = hint(s.slug)
              return (
                <li key={s.slug}>
                  <Link to={`/painel/${s.slug}`} className={styles.indexLink}>
                    <span className={styles.indexNum} aria-hidden="true">{s.num ?? '·'}</span>
                    <span className={styles.indexLabel}>{s.label}</span>
                    <span className={`${styles.indexHint} ${h.alert ? styles.indexAlert : ''}`}>{h.text}</span>
                    <svg className={styles.arrow} viewBox="0 0 32 12" aria-hidden="true">
                      <path d="M0 6h30M25 1l5 5-5 5" fill="none" stroke="currentColor" strokeWidth="1" />
                    </svg>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

function PagesPanel() {
  const { pages, refresh } = useAccess()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string>()

  const toggle = async (page: Page, locked: boolean) => {
    setBusy(page.slug)
    setError(undefined)
    try {
      await api(`/admin/pages/${page.slug}`, { method: 'PATCH', body: { locked } })
      await refresh()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className={styles.block} aria-labelledby="paginas">
      <Eyebrow index="I">Páginas</Eyebrow>
      <h2 id="paginas" className={styles.blockTitle}>Abrir e bloquear</h2>
      <p className={styles.help}>Página bloqueada mostra “Em breve” para os convidados. Vocês continuam vendo tudo.</p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <ul className={styles.rows}>
        {Object.values(pages).map(page => (
          <li key={page.slug} className={styles.row}>
            <span className={styles.rowMain}>
              <span className={styles.rowTitle}>{page.title}</span>
              <span className={page.locked ? styles.statusLocked : styles.statusOpen}>
                {page.locked ? 'Bloqueada' : 'Aberta'}
              </span>
            </span>
            <Switch
              label={`Bloquear ${page.title}`}
              checked={page.locked}
              disabled={busy === page.slug}
              onChange={next => toggle(page, next)}
            />
          </li>
        ))}
      </ul>
    </section>
  )
}

type Draft = { name: string; role: 'padrinho' | 'madrinha' | 'casal'; personalMessage: string }
const emptyDraft: Draft = { name: '', role: 'padrinho', personalMessage: '' }

function PadrinhosPanel() {
  const [list, setList] = useState<AdminPadrinho[] | null>(null)
  const [draft, setDraft] = useState<Draft>(emptyDraft)
  const [editing, setEditing] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string>()
  const [newLink, setNewLink] = useState<{ name: string; link: string } | null>(null)

  useEffect(() => {
    api<{ padrinhos: AdminPadrinho[] }>('/admin/padrinhos')
      .then(d => setList(d.padrinhos))
      .catch(err => setError(err.message))
  }, [])

  const run = async (fn: () => Promise<void>) => {
    setSaving(true)
    setError(undefined)
    try {
      await fn()
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const submit = (e: FormEvent) => {
    e.preventDefault()
    run(async () => {
      if (editing) {
        const d = await api<{ padrinhos: AdminPadrinho[] }>(`/admin/padrinhos/${editing}`, { method: 'PATCH', body: draft })
        setList(d.padrinhos)
      } else {
        const d = await api<{ link: string; padrinhos: AdminPadrinho[] }>('/admin/padrinhos', { body: draft })
        setList(d.padrinhos)
        setNewLink({ name: draft.name, link: d.link })
      }
      setDraft(emptyDraft)
      setEditing(null)
    })
  }

  const regenerate = (p: AdminPadrinho) => {
    if (!confirm(`Gerar um link novo para ${p.name}? O link gravado na tag atual deixa de funcionar.`)) return
    run(async () => {
      const d = await api<{ link: string }>(`/admin/padrinhos/${p.id}/novo-link`, { body: {} })
      setNewLink({ name: p.name, link: d.link })
    })
  }

  const remove = (p: AdminPadrinho) => {
    if (!confirm(`Remover ${p.name}? Ele(a) perde o acesso ao manual.`)) return
    run(async () => {
      const d = await api<{ padrinhos: AdminPadrinho[] }>(`/admin/padrinhos/${p.id}`, { method: 'DELETE' })
      setList(d.padrinhos)
    })
  }

  const edit = (p: AdminPadrinho) => {
    setEditing(p.id)
    setDraft({ name: p.name, role: p.role, personalMessage: p.personalMessage })
    setNewLink(null)
  }

  return (
    <section className={styles.block} aria-labelledby="padrinhos">
      <Eyebrow index="VIII">Padrinhos</Eyebrow>
      <h2 id="padrinhos" className={styles.blockTitle}>Tags NFC</h2>
      <p className={styles.help}>
        Cada padrinho recebe um link único. Gravem esse link na tag (ex.: app NFC Tools → Escrever → URL). Ao
        aproximar o celular, ele vê a página pessoal e o manual.
      </p>

      {newLink && (
        <div className={styles.linkBox} role="status">
          <p className={styles.linkLabel}>Link de {newLink.name} — aparece só agora</p>
          <code className={styles.link}>{newLink.link}</code>
          <div className={styles.linkActions}>
            <Button variant="outline" onClick={() => navigator.clipboard.writeText(newLink.link)}>
              Copiar link
            </Button>
            <Button variant="quiet" onClick={() => setNewLink(null)}>
              Já gravei
            </Button>
          </div>
        </div>
      )}

      <form className={styles.form} onSubmit={submit}>
        <p className={styles.formTitle}>{editing ? 'Editar padrinho' : 'Novo padrinho'}</p>
        <Field label="Nome" required value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} />
        <fieldset className={styles.roles}>
          <legend className={styles.legend}>Saudação</legend>
          {(['madrinha', 'padrinho', 'casal'] as const).map(role => (
            <label key={role} className={styles.radio}>
              <input
                type="radio"
                name="role"
                value={role}
                checked={draft.role === role}
                onChange={() => setDraft({ ...draft, role })}
              />
              {role === 'padrinho' ? 'Padrinho (“Querido”)' : role === 'madrinha' ? 'Madrinha (“Querida”)' : 'Casal (“Queridos”)'}
            </label>
          ))}
        </fieldset>
        <Field
          label="Mensagem pessoal"
          multiline
          hint="Aparece no topo da página dele(a), como uma carta."
          value={draft.personalMessage}
          onChange={e => setDraft({ ...draft, personalMessage: e.target.value })}
        />
        <div className={styles.formActions}>
          <Button type="submit" loading={saving}>
            {editing ? 'Salvar' : 'Criar e gerar link'}
          </Button>
          {editing && (
            <Button
              variant="quiet"
              onClick={() => {
                setEditing(null)
                setDraft(emptyDraft)
              }}
            >
              Cancelar
            </Button>
          )}
        </div>
      </form>

      {error && <p className={styles.error} role="alert">{error}</p>}

      {list && list.length === 0 && <p className={styles.help}>Nenhum padrinho cadastrado ainda.</p>}
      {list && list.length > 0 && (
        <ul className={styles.rows}>
          {list.map(p => (
            <li key={p.id} className={styles.row}>
              <span className={styles.rowMain}>
                <span className={styles.rowTitle}>{p.name}</span>
                <span className={styles.rowMeta}>
                  {p.role === 'madrinha' ? 'Madrinha' : p.role === 'casal' ? 'Casal' : 'Padrinho'} ·{' '}
                  {p.lastSeenAt ? `abriu em ${formatDate(p.lastSeenAt)}` : 'ainda não abriu'}
                </span>
              </span>
              <span className={styles.rowActions}>
                <Button variant="quiet" onClick={() => edit(p)}>Editar</Button>
                <Button variant="quiet" onClick={() => regenerate(p)}>Novo link</Button>
                <Button variant="quiet" className={styles.danger} onClick={() => remove(p)}>Remover</Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/* ── Manual: a noiva escreve aqui ────────────────────────────────────── */
function ManualPanel() {
  const [sections, setSections] = useState<ManualSection[] | null>(null)
  const [error, setError] = useState<string>()
  const [adding, setAdding] = useState(false)

  useEffect(() => {
    api<{ sections: ManualSection[] }>('/admin/manual')
      .then(d => setSections(d.sections))
      .catch(err => setError(err.message))
  }, [])

  // Toda ação devolve a lista atualizada.
  const apply = async (path: string, init: { method?: string; body?: unknown }) => {
    setError(undefined)
    try {
      const d = await api<{ sections: ManualSection[] }>(path, init)
      setSections(d.sections)
      return true
    } catch (err) {
      setError((err as Error).message)
      return false
    }
  }

  const add = async () => {
    setAdding(true)
    await apply('/admin/manual', { body: { title: 'Nova seção', body: '' } })
    setAdding(false)
  }

  return (
    <section className={styles.block} aria-labelledby="manual">
      <Eyebrow index="IX">Manual</Eyebrow>
      <h2 id="manual" className={styles.blockTitle}>Manual dos padrinhos</h2>
      <p className={styles.help}>
        Cada seção pode ser para todos, só madrinhas ou só padrinhos (o casal vê as duas). Escolha o tipo: texto, paleta de
        cores, roteiro com horários ou dicas.{' '}
        <Link to="/padrinhos" className={styles.inlineLink}>Ver como fica</Link>
      </p>
      {error && <p className={styles.error} role="alert">{error}</p>}
      {sections?.map((section, i) => (
        <SectionEditor
          key={section.id}
          section={section}
          index={i}
          isFirst={i === 0}
          isLast={i === sections.length - 1}
          onSave={draft => apply(`/admin/manual/${section.id}`, { method: 'PATCH', body: draft })}
          onMove={direction => apply(`/admin/manual/${section.id}/mover`, { body: { direction } })}
          onRemove={() =>
            confirm(`Apagar a seção “${section.title}”?`) && apply(`/admin/manual/${section.id}`, { method: 'DELETE' })
          }
        />
      ))}
      <div>
        <Button variant="outline" loading={adding} onClick={add}>
          Adicionar seção
        </Button>
      </div>
    </section>
  )
}

// SQLite guarda em UTC ("2026-10-04 01:02:03").
const formatDate = (utc: string) =>
  new Date(utc.replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

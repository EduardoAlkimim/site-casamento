import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { api, type AdminPadrinho, type ManualSection, type Page } from '../lib/api'
import { useAccess } from '../lib/access'
import { Button } from '../design-system/components/Button'
import { Field } from '../design-system/components/Field'
import { Eyebrow } from '../design-system/components/Ornaments'
import { Switch } from '../design-system/components/Switch'
import styles from './Painel.module.css'
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

/* ── Painel ──────────────────────────────────────────────────────────── */
function Dashboard() {
  const { refresh } = useAccess()

  const logout = async () => {
    await api('/admin/logout', { body: {} })
    await refresh()
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
      <nav className={styles.jump} aria-label="Ir para">
        {[
          ['#revisar', 'Revisar'],
          ['#paginas', 'Abrir e bloquear'],
          ['#painel-inicio', 'Início'],
          ['#painel-historia', 'História'],
          ['#painel-info', 'Informações'],
          ['#listas', 'Presentes'],
          ['#recebidos', 'Recebidos'],
          ['#painel-recados', 'Recados'],
          ['#padrinhos', 'Padrinhos'],
          ['#manual', 'Manual'],
        ].map(([href, label]) => (
          <a key={href} href={href}>{label}</a>
        ))}
      </nav>
      <PendenciasPanel />
      <PagesPanel />
      <InicioPanel />
      <HistoriaPanel />
      <InformacoesPanel />
      <ListasPanel />
      <RecebidosPanel />
      <RecadosPanel />
      <PadrinhosPanel />
      <ManualPanel />
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

type Draft = { name: string; role: 'padrinho' | 'madrinha'; personalMessage: string }
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
          {(['padrinho', 'madrinha'] as const).map(role => (
            <label key={role} className={styles.radio}>
              <input
                type="radio"
                name="role"
                value={role}
                checked={draft.role === role}
                onChange={() => setDraft({ ...draft, role })}
              />
              {role === 'padrinho' ? 'Padrinho (“Querido”)' : 'Madrinha (“Querida”)'}
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
                  {p.role === 'madrinha' ? 'Madrinha' : 'Padrinho'} ·{' '}
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
        O mesmo texto para todos, abaixo da mensagem pessoal. Quebras de linha aparecem como vocês escreverem.{' '}
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
          onSave={(title, body) => apply(`/admin/manual/${section.id}`, { method: 'PATCH', body: { title, body } })}
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

type SectionEditorProps = {
  section: ManualSection
  index: number
  isFirst: boolean
  isLast: boolean
  onSave: (title: string, body: string) => Promise<boolean>
  onMove: (direction: 'up' | 'down') => void
  onRemove: () => void
}

function SectionEditor({ section, index, isFirst, isLast, onSave, onMove, onRemove }: SectionEditorProps) {
  const [title, setTitle] = useState(section.title)
  const [body, setBody] = useState(section.body)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const dirty = title !== section.title || body !== section.body

  // Recarrega quando a seção muda no servidor (ex.: depois de reordenar).
  useEffect(() => {
    setTitle(section.title)
    setBody(section.body)
  }, [section.title, section.body])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const ok = await onSave(title, body)
    setSaving(false)
    if (ok) {
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2500)
    }
  }

  return (
    <form className={styles.form} onSubmit={save} aria-label={`Seção ${index + 1}: ${section.title}`}>
      <Field label={`Seção ${index + 1} · título`} required value={title} onChange={e => setTitle(e.target.value)} />
      <Field label="Texto" multiline rows={6} value={body} onChange={e => setBody(e.target.value)} />
      <div className={styles.formActions}>
        <Button type="submit" loading={saving} disabled={!dirty}>
          Salvar
        </Button>
        {saved && !dirty && <span className={styles.saved} role="status">Salvo</span>}
        <span className={styles.rowActions}>
          <Button variant="quiet" disabled={isFirst} onClick={() => onMove('up')} aria-label={`Subir ${section.title}`}>
            Subir
          </Button>
          <Button variant="quiet" disabled={isLast} onClick={() => onMove('down')} aria-label={`Descer ${section.title}`}>
            Descer
          </Button>
          <Button variant="quiet" className={styles.danger} onClick={onRemove}>
            Apagar
          </Button>
        </span>
      </div>
    </form>
  )
}

// SQLite guarda em UTC ("2026-10-04 01:02:03").
const formatDate = (utc: string) =>
  new Date(utc.replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

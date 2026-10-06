import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { api, type AdminMessage, type Pendencia, type SiteTexts } from '../../lib/api'
import { useAccess } from '../../lib/access'
import { Button } from '../../design-system/components/Button'
import { Field } from '../../design-system/components/Field'
import { Eyebrow } from '../../design-system/components/Ornaments'
import base from '../Painel.module.css'
import { PageTextEditor } from './ListasPanel'
import { OrderedEditor } from './OrderedEditor'
import styles from './ContentPanels.module.css'

/** Título e abertura da página, lidos do estado de acesso (já carregado). */
function PageTexts({ slug, path }: { slug: string; path: string }) {
  const { pages } = useAccess()
  const page = pages[slug]
  if (!page) return null
  return <PageTextEditor slug={slug} path={path} heading={page.heading} intro={page.intro} onSaved={() => {}} />
}

export function HistoriaPanel() {
  return (
    <section className={base.block} aria-labelledby="painel-historia" id="painel-historia-sec">
      <Eyebrow index="III">Nossa História</Eyebrow>
      <h2 id="painel-historia" className={base.blockTitle}>Capítulos</h2>
      <p className={base.help}>
        Cada capítulo tem data, título, texto e foto. Um capítulo <strong>sem foto</strong> vira o fechamento, com a contagem
        regressiva — ideal para o dia do casamento.
      </p>
      <PageTexts slug="nossa-historia" path="/nossa-historia" />
      <OrderedEditor
        path="historia"
        noun="capítulo"
        addLabel="Adicionar capítulo"
        defaults={{ dateLabel: '', title: '', body: '', image: null }}
        title={i => String(i.title)}
        meta={i => String(i.dateLabel || 'Sem data')}
        fields={[
          { key: 'image', label: 'Foto', kind: 'image', hint: 'Fotos em pé (retrato) ficam melhores no arco.' },
          { key: 'dateLabel', label: 'Data', kind: 'text', placeholder: 'Ex.: Dezembro de 2023' },
          { key: 'title', label: 'Título', kind: 'text', required: true },
          { key: 'body', label: 'Texto', kind: 'textarea' },
        ]}
      />
    </section>
  )
}

export function InformacoesPanel() {
  return (
    <section className={base.block} aria-labelledby="painel-info" id="painel-info-sec">
      <Eyebrow index="IV">Informações</Eyebrow>
      <h2 id="painel-info" className={base.blockTitle}>Blocos e perguntas</h2>
      <p className={base.help}>
        “Bloco” aparece como seção (cerimônia, traje, hospedagem…). “Pergunta frequente” aparece no fim, abrindo e fechando.
        Com endereço, o site mostra “Abrir no mapa” sozinho.
      </p>
      <PageTexts slug="informacoes" path="/informacoes" />
      <OrderedEditor
        path="informacoes"
        noun="item"
        addLabel="Adicionar item"
        defaults={{ kind: 'destaque', title: '', subtitle: '', body: '', address: '', mapUrl: null }}
        title={i => String(i.title)}
        meta={i => (i.kind === 'faq' ? 'Pergunta frequente' : String(i.subtitle || 'Bloco'))}
        fields={[
          {
            key: 'kind',
            label: 'Tipo',
            kind: 'select',
            options: [
              { value: 'destaque', label: 'Bloco' },
              { value: 'faq', label: 'Pergunta frequente' },
            ],
          },
          { key: 'title', label: 'Título ou pergunta', kind: 'text', required: true },
          { key: 'subtitle', label: 'Destaque (opcional)', kind: 'text', placeholder: 'Ex.: 21 de abril · 16h30' },
          { key: 'body', label: 'Texto ou resposta', kind: 'textarea' },
          { key: 'address', label: 'Endereço (opcional)', kind: 'text' },
          { key: 'mapUrl', label: 'Link do mapa (opcional)', kind: 'url', hint: 'Se vazio, o site busca o endereço no Google Maps.' },
        ]}
      />
    </section>
  )
}

const STATUS = { pendente: 'Novo', aprovado: 'Lido', oculto: 'Lido' } as const

// SQLite guarda em UTC ("2026-10-04 01:02:03").
const when = (utc: string) =>
  new Date(utc.replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export function RecadosPanel() {
  const [list, setList] = useState<AdminMessage[] | null>(null)
  const [error, setError] = useState<string>()

  const load = () =>
    api<{ messages: AdminMessage[] }>('/admin/recados')
      .then(d => setList(d.messages))
      .catch(err => setError(err.message))

  useEffect(() => {
    load()
  }, [])

  const act = async (id: number, init: { method: string; body?: unknown }) => {
    setError(undefined)
    try {
      await api(`/admin/recados/${id}`, init)
      await load()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const pending = list?.filter(m => m.status === 'pendente').length ?? 0

  return (
    <section className={base.block} aria-labelledby="painel-recados" id="painel-recados-sec">
      <Eyebrow index="VII">Recados</Eyebrow>
      <h2 id="painel-recados" className={base.blockTitle}>
        Recados recebidos {pending > 0 && <span className={styles.badge}>{pending} {pending === 1 ? 'novo' : 'novos'}</span>}
      </h2>
      <p className={base.help}>Só vocês dois leem os recados — eles não aparecem no site.</p>
      <PageTexts slug="recados" path="/recados" />
      <div className={styles.toolbar}>
        <Button variant="quiet" onClick={load}>Atualizar</Button>
      </div>
      {error && <p className={base.error} role="alert">{error}</p>}
      {list && list.length === 0 && <p className={base.help}>Nenhum recado ainda.</p>}
      {list && list.length > 0 && (
        <ul className={base.rows}>
          {list.map(m => (
            <li key={m.id} className={`${styles.message} ${m.status === 'pendente' ? styles.pending : ''}`}>
              <blockquote className={styles.body}>{m.body}</blockquote>
              <p className={base.rowMeta}>
                — {m.name} · {when(m.createdAt)} · <span className={m.status === 'pendente' ? styles.pendente : styles.oculto}>{STATUS[m.status]}</span>
              </p>
              <span className={base.rowActions}>
                {m.status === 'pendente' && (
                  <Button variant="quiet" onClick={() => act(m.id, { method: 'PATCH', body: { status: 'aprovado' } })}>
                    Marcar como lido
                  </Button>
                )}
                <Button
                  variant="quiet"
                  className={base.danger}
                  onClick={() => confirm(`Apagar o recado de ${m.name}?`) && act(m.id, { method: 'DELETE' })}
                >
                  Apagar
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/* ── Para revisar: todos os textos provisórios, com atalho ───────────── */
export function PendenciasPanel() {
  const [items, setItems] = useState<Pendencia[] | null>(null)
  const load = () => api<{ items: Pendencia[] }>('/admin/pendencias').then(d => setItems(d.items), () => setItems([]))

  useEffect(() => {
    load()
  }, [])

  if (!items) return null
  const areas = [...new Set(items.map(i => i.area))]

  return (
    <section className={`${base.block} ${styles.review}`} aria-labelledby="revisar">
      <Eyebrow>Para revisar</Eyebrow>
      <h2 id="revisar" className={base.blockTitle}>
        {items.length === 0 ? (
          <>
            Tudo <em>revisado</em>
          </>
        ) : (
          <>
            {items.length} {items.length === 1 ? 'texto provisório' : 'textos provisórios'}
          </>
        )}
      </h2>
      <p className={base.help}>
        {items.length === 0
          ? 'Nenhum texto provisório no site. Tudo com a cara de vocês.'
          : 'Toque em um item para ir direto ao lugar de editar. Quando o texto deixar de começar com “Texto provisório”, ele sai daqui.'}
      </p>
      {areas.map(area => (
        <div key={area} className={styles.reviewGroup}>
          <p className={styles.reviewArea}>{area}</p>
          <ul className={styles.reviewList}>
            {items
              .filter(i => i.area === area)
              .map((i, n) => (
                <li key={n}>
                  <a href={`#${i.anchor}`}>{i.label}</a>
                </li>
              ))}
          </ul>
        </div>
      ))}
      {items.length > 0 && (
        <div>
          <Button variant="quiet" onClick={load}>
            Atualizar lista
          </Button>
        </div>
      )}
    </section>
  )
}

/* ── Início: frase de abertura e o bloco “O dia” ────────────────────── */
export function InicioPanel() {
  const { site, refresh } = useAccess()
  const [values, setValues] = useState<SiteTexts>(site)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string>()
  const dirty = (Object.keys(site) as (keyof SiteTexts)[]).some(k => values[k] !== site[k])
  const set = (k: keyof SiteTexts, v: string) => setValues(prev => ({ ...prev, [k]: v }))

  useEffect(() => setValues(site), [site])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(undefined)
    try {
      await api('/admin/site', { method: 'PATCH', body: values })
      await refresh()
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className={base.block} aria-labelledby="painel-inicio">
      <Eyebrow index="II">Início</Eyebrow>
      <h2 id="painel-inicio" className={base.blockTitle}>Página inicial</h2>
      <p className={base.help}>Os nomes e a data ficam fixos. O resto da primeira página vocês escrevem aqui.</p>
      <form className={base.form} onSubmit={save}>
        <Field
          label="Frase de abertura"
          multiline
          rows={3}
          hint="Aparece logo abaixo da foto em arco."
          value={values.phrase}
          onChange={e => set('phrase', e.target.value)}
        />
        <Field label="Bloco “O dia” — primeira linha" value={values.dayTitle} onChange={e => set('dayTitle', e.target.value)} />
        <Field
          label="Bloco “O dia” — segunda linha (em itálico)"
          value={values.dayTitleEm}
          onChange={e => set('dayTitleEm', e.target.value)}
        />
        <Field label="Horário da cerimônia" value={values.ceremonyTime} onChange={e => set('ceremonyTime', e.target.value)} />
        <Field label="Local" value={values.venue} onChange={e => set('venue', e.target.value)} />
        <Field
          label="Cidade"
          hint="Também aparece no rodapé e no menu."
          value={values.city}
          onChange={e => set('city', e.target.value)}
        />
        {error && <p className={base.error} role="alert">{error}</p>}
        <div className={base.formActions}>
          <Button type="submit" loading={saving} disabled={!dirty}>
            Salvar
          </Button>
          {saved && !dirty && <span className={base.saved} role="status">Salvo</span>}
          <Link to="/" className={base.inlineLink}>Ver como fica</Link>
        </div>
      </form>
    </section>
  )
}

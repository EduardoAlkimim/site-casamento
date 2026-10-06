import { useEffect, useState } from 'react'
import { api, type AdminMessage } from '../../lib/api'
import { useAccess } from '../../lib/access'
import { Button } from '../../design-system/components/Button'
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
      <Eyebrow index="VI">Nossa História</Eyebrow>
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
      <Eyebrow index="VII">Informações</Eyebrow>
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

const STATUS = { pendente: 'Esperando aprovação', aprovado: 'No mural', oculto: 'Escondido' } as const

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
      <Eyebrow index="VIII">Recados</Eyebrow>
      <h2 id="painel-recados" className={base.blockTitle}>
        Mural {pending > 0 && <span className={styles.badge}>{pending} {pending === 1 ? 'novo' : 'novos'}</span>}
      </h2>
      <p className={base.help}>Os recados só aparecem no mural depois que vocês aprovarem.</p>
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
                — {m.name} · {when(m.createdAt)} · <span className={styles[m.status]}>{STATUS[m.status]}</span>
              </p>
              <span className={base.rowActions}>
                {m.status !== 'aprovado' && (
                  <Button variant="quiet" onClick={() => act(m.id, { method: 'PATCH', body: { status: 'aprovado' } })}>
                    Aprovar
                  </Button>
                )}
                {m.status !== 'oculto' && (
                  <Button variant="quiet" onClick={() => act(m.id, { method: 'PATCH', body: { status: 'oculto' } })}>
                    Esconder
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

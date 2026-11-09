import { useEffect, useState, type FormEvent } from 'react'
import { api, type ConviteAdmin, type ConviteTexts } from '../../lib/api'
import { Button } from '../../design-system/components/Button'
import { Field } from '../../design-system/components/Field'
import { Eyebrow } from '../../design-system/components/Ornaments'
import base from '../Painel.module.css'
import { EventEditor } from './ChaTools'

// Convite do Chá (/cha): quem confirmou, o link para o PDF e os textos.

const LINK = 'https://www.eduardothamires.com.br/cha'

const FIELDS: { key: keyof ConviteTexts; label: string; hint?: string; multiline?: boolean; url?: boolean }[] = [
  { key: 'intro', label: 'Frase de abertura', multiline: true },
  { key: 'letter', label: 'Texto do cartão', multiline: true, hint: 'O que ficar entre **dois asteriscos** aparece em negrito.' },
  { key: 'mapsUrl', label: 'Link do local no mapa', url: true, hint: 'Botão “Ver Localização”. Vazio: usa o endereço do chá.' },
  { key: 'homeText', label: 'Texto da casa nova', multiline: true },
  { key: 'homeUrl', label: 'Link do endereço da casa nova', url: true, hint: 'Botão “Ver Endereço”. Vazio: o bloco some.' },
  { key: 'rsvpNote', label: 'Aviso na confirmação', hint: 'Ex.: “Confirme até 20 de novembro”. Opcional.' },
  { key: 'verse', label: 'Versículo', multiline: true },
  { key: 'verseRef', label: 'Referência do versículo' },
  { key: 'closing', label: 'Frase final' },
]

const when = (iso: string) =>
  new Date(iso.replace(' ', 'T') + 'Z').toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

export function ConvitePanel() {
  const [data, setData] = useState<ConviteAdmin | null>(null)
  const [error, setError] = useState<string>()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    api<ConviteAdmin>('/admin/convite').then(setData, err => setError(err.message))
  }, [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(LINK)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2500)
    } catch {
      /* sem permissão: o link está à vista para copiar à mão */
    }
  }

  const remove = async (id: number, name: string) => {
    if (!confirm(`Apagar a confirmação de ${name}?`)) return
    try {
      setData(await api<ConviteAdmin>(`/admin/convite/presencas/${id}`, { method: 'DELETE' }))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

  return (
    <section className={base.block} aria-labelledby="painel-convite">
      <Eyebrow>Chá de Panela</Eyebrow>
      <h2 id="painel-convite" className={base.blockTitle}>Convite do Chá</h2>
      <p className={base.help}>
        Este é o link para colocar no PDF do convite: <strong>{LINK.replace('https://www.', '')}</strong>
      </p>
      <div className={base.formActions}>
        <Button variant="outline" onClick={copy}>
          {copied ? 'Link copiado' : 'Copiar link'}
        </Button>
        <a className={base.inlineLink} href="/cha" target="_blank" rel="noopener">
          Ver o convite
        </a>
      </div>

      {error && <p className={base.error} role="alert">{error}</p>}
      {!data && !error && <p className={base.help}>Carregando…</p>}

      {data && (
        <>
          <p className={base.formTitle}>
            {data.totals.people ? `${plural(data.totals.people, 'pessoa confirmada', 'pessoas confirmadas')}` : 'Ninguém confirmou ainda'}
          </p>
          <p className={base.help}>
            {plural(data.totals.confirmed, 'confirmação', 'confirmações')}
            {data.totals.declined > 0 && ` · ${plural(data.totals.declined, 'não vai', 'não vão')}`}
          </p>
          {data.rsvps.length > 0 && (
            <ul className={base.rows}>
              {data.rsvps.map(r => (
                <li key={r.id}>
                  <span className={base.rowMain}>
                    <strong>{r.name}</strong>
                    <span className={base.rowMeta}>
                      {[r.attending ? plural(r.people, 'pessoa', 'pessoas') : 'Não vai', r.phone, when(r.createdAt)].filter(Boolean).join(' · ')}
                    </span>
                    {r.message && <span className={base.rowMeta}>“{r.message}”</span>}
                  </span>
                  <span className={base.rowActions}>
                    <Button variant="quiet" className={base.danger} onClick={() => remove(r.id, r.name)}>
                      Apagar
                    </Button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <EventEditor event={data.event} onSaved={event => setData(prev => (prev ? { ...prev, event } : prev))} />
          <TextsEditor texts={data.texts} onSaved={d => setData(d)} />
        </>
      )}
    </section>
  )
}

function TextsEditor({ texts, onSaved }: { texts: ConviteTexts; onSaved: (d: ConviteAdmin) => void }) {
  const [values, setValues] = useState(texts)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string>()
  const dirty = FIELDS.some(f => values[f.key] !== texts[f.key])

  useEffect(() => setValues(texts), [texts])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    const badUrl = FIELDS.find(f => f.url && values[f.key].trim() && !/^https?:\/\/\S+$/.test(values[f.key].trim()))
    if (badUrl) return setError(`${badUrl.label}: cole o link completo, começando com https://`)
    setSaving(true)
    setError(undefined)
    try {
      onSaved(await api<ConviteAdmin>('/admin/convite', { method: 'PATCH', body: values }))
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className={base.form} onSubmit={save} aria-label="Textos do convite">
      <p className={base.formTitle}>Textos do convite</p>
      <p className={base.help}>Data, horário e local vêm de “Sobre o chá”, logo acima.</p>
      {FIELDS.map(f =>
        f.multiline ? (
          <Field
            key={f.key}
            label={f.label}
            hint={f.hint}
            multiline
            rows={f.key === 'letter' ? 6 : 3}
            value={values[f.key]}
            onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
          />
        ) : (
          <Field
            key={f.key}
            label={f.label}
            hint={f.hint}
            {...(f.url ? { type: 'url', inputMode: 'url' as const, placeholder: 'https://' } : {})}
            value={values[f.key]}
            onChange={e => setValues(v => ({ ...v, [f.key]: e.target.value }))}
          />
        ),
      )}
      {error && <p className={base.error} role="alert">{error}</p>}
      <div className={base.formActions}>
        <Button type="submit" loading={saving} disabled={!dirty}>
          Salvar
        </Button>
        {saved && !dirty && <span className={base.saved} role="status">Salvo</span>}
      </div>
    </form>
  )
}

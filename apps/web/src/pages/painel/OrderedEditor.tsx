import { useEffect, useRef, useState, type FormEvent } from 'react'
import { api, uploadImage } from '../../lib/api'
import { resizeImage } from '../../lib/resizeImage'
import { Button } from '../../design-system/components/Button'
import { Field } from '../../design-system/components/Field'
import base from '../Painel.module.css'
import lists from './ListasPanel.module.css'

// Editor genérico de listas ordenadas do painel (História, Informações…).
// Cada campo é descrito uma vez; o resto (salvar, mover, apagar, foto) é igual.

export type FieldDef = {
  key: string
  label: string
  kind: 'text' | 'textarea' | 'image' | 'select' | 'url'
  options?: { value: string; label: string }[]
  hint?: string
  required?: boolean
  placeholder?: string
}

type Item = { id: number; imageUrl?: string | null } & Record<string, unknown>

type Props = {
  path: string
  fields: FieldDef[]
  title: (item: Item) => string
  meta?: (item: Item) => string
  defaults: Record<string, unknown>
  addLabel: string
  noun: string
}

export function OrderedEditor({ path, fields, title, meta, defaults, addLabel, noun }: Props) {
  const [items, setItems] = useState<Item[] | null>(null)
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [error, setError] = useState<string>()
  const hasImage = fields.some(f => f.kind === 'image')

  useEffect(() => {
    api<{ items: Item[] }>(`/admin/${path}`)
      .then(d => setItems(d.items))
      .catch(err => setError(err.message))
  }, [path])

  const apply = async (url: string, init: { method?: string; body?: unknown }) => {
    setError(undefined)
    try {
      const d = await api<{ items: Item[] }>(url, init)
      setItems(d.items)
      return true
    } catch (err) {
      setError((err as Error).message)
      return false
    }
  }

  return (
    <>
      {error && <p className={base.error} role="alert">{error}</p>}
      {!items && !error && <p className={base.help}>Carregando…</p>}
      {items && (
        <>
          <div className={lists.listHead}>
            <p className={base.formTitle}>
              {items.length} {items.length === 1 ? noun : `${noun}s`}
            </p>
            {editing !== 'new' && (
              <Button variant="outline" onClick={() => setEditing('new')}>
                {addLabel}
              </Button>
            )}
          </div>

          {editing === 'new' && (
            <ItemForm
              fields={fields}
              initial={defaults}
              heading={addLabel}
              onCancel={() => setEditing(null)}
              onSave={async body => {
                const ok = await apply(`/admin/${path}`, { body })
                if (ok) setEditing(null)
                return ok
              }}
            />
          )}

          <ul className={base.rows}>
            {items.map((item, i) => (
              <li key={item.id} className={lists.giftRow}>
                <div className={lists.summary}>
                  {hasImage && <span className={lists.thumb}>{item.imageUrl && <img src={item.imageUrl} alt="" />}</span>}
                  <span className={base.rowMain}>
                    <span className={lists.giftName}>{title(item)}</span>
                    {meta && <span className={base.rowMeta}>{meta(item)}</span>}
                  </span>
                </div>
                <span className={base.rowActions}>
                  <Button variant="quiet" onClick={() => setEditing(editing === item.id ? null : item.id)}>
                    {editing === item.id ? 'Fechar' : 'Editar'}
                  </Button>
                  <Button
                    variant="quiet"
                    disabled={i === 0}
                    aria-label={`Subir ${title(item)}`}
                    onClick={() => apply(`/admin/${path}/${item.id}/mover`, { body: { direction: 'up' } })}
                  >
                    Subir
                  </Button>
                  <Button
                    variant="quiet"
                    disabled={i === items.length - 1}
                    aria-label={`Descer ${title(item)}`}
                    onClick={() => apply(`/admin/${path}/${item.id}/mover`, { body: { direction: 'down' } })}
                  >
                    Descer
                  </Button>
                  <Button
                    variant="quiet"
                    className={base.danger}
                    onClick={() =>
                      confirm(`Apagar “${title(item)}”?`) && apply(`/admin/${path}/${item.id}`, { method: 'DELETE' })
                    }
                  >
                    Apagar
                  </Button>
                </span>
                {editing === item.id && (
                  <ItemForm
                    fields={fields}
                    initial={item}
                    heading={`Editar ${noun}`}
                    onCancel={() => setEditing(null)}
                    onSave={async body => {
                      const ok = await apply(`/admin/${path}/${item.id}`, { method: 'PATCH', body })
                      if (ok) setEditing(null)
                      return ok
                    }}
                  />
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

function ItemForm({
  fields,
  initial,
  heading,
  onSave,
  onCancel,
}: {
  fields: FieldDef[]
  initial: Record<string, unknown>
  heading: string
  onSave: (body: Record<string, unknown>) => Promise<boolean>
  onCancel: () => void
}) {
  const [values, setValues] = useState<Record<string, unknown>>(() =>
    Object.fromEntries(fields.map(f => [f.key, initial[f.key] ?? (f.kind === 'image' ? null : '')])),
  )
  const [preview, setPreview] = useState<string | null>((initial.imageUrl as string | null) ?? null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const fileRef = useRef<HTMLInputElement>(null)
  const set = (key: string, v: unknown) => setValues(prev => ({ ...prev, [key]: v }))

  const pick = async (key: string, file?: File) => {
    if (!file) return
    setUploading(true)
    setErrors(e => ({ ...e, [key]: '' }))
    try {
      const up = await uploadImage(await resizeImage(file))
      set(key, up.image)
      setPreview(up.url)
    } catch (err) {
      setErrors(e => ({ ...e, [key]: (err as Error).message }))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    for (const f of fields) {
      const v = values[f.key]
      if (f.required && !String(v ?? '').trim()) next[f.key] = 'Campo obrigatório.'
      if (f.kind === 'url' && v && !/^https:\/\/\S+$/.test(String(v).trim())) next[f.key] = 'Cole o link completo, começando com https://'
    }
    setErrors(next)
    if (Object.values(next).some(Boolean)) return
    setSaving(true)
    // URL vazia vira null (o campo é opcional no banco).
    const body = Object.fromEntries(
      Object.entries(values).map(([k, v]) => [k, fields.find(f => f.key === k)?.kind === 'url' && !v ? null : v]),
    )
    await onSave(body)
    setSaving(false)
  }

  return (
    <form className={`${base.form} ${lists.giftForm}`} onSubmit={submit} noValidate>
      <p className={base.formTitle}>{heading}</p>
      {fields.map(f => {
        if (f.kind === 'image') {
          return (
            <div key={f.key} className={lists.photoField}>
              <span className={lists.photoPreview}>{preview ? <img src={preview} alt={f.label} /> : <span>Sem foto</span>}</span>
              <div className={lists.photoActions}>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="visually-hidden"
                  onChange={e => pick(f.key, e.target.files?.[0])}
                />
                <Button variant="outline" loading={uploading} onClick={() => fileRef.current?.click()}>
                  {preview ? 'Trocar foto' : 'Escolher foto'}
                </Button>
                {preview && (
                  <Button
                    variant="quiet"
                    onClick={() => {
                      set(f.key, null)
                      setPreview(null)
                    }}
                  >
                    Tirar foto
                  </Button>
                )}
                {f.hint && <p className={base.help}>{f.hint}</p>}
                {errors[f.key] && <p className={base.error} role="alert">{errors[f.key]}</p>}
              </div>
            </div>
          )
        }
        if (f.kind === 'select') {
          return (
            <label key={f.key} className={lists.selectField}>
              <span className={lists.selectLabel}>{f.label}</span>
              <select className={lists.select} value={String(values[f.key] ?? '')} onChange={e => set(f.key, e.target.value)}>
                {f.options!.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          )
        }
        const common = {
          label: f.label,
          required: f.required,
          hint: f.hint,
          placeholder: f.placeholder,
          error: errors[f.key] || undefined,
          value: String(values[f.key] ?? ''),
        }
        return f.kind === 'textarea' ? (
          <Field key={f.key} {...common} multiline rows={5} onChange={e => set(f.key, e.target.value)} />
        ) : (
          <Field key={f.key} {...common} type={f.kind === 'url' ? 'url' : 'text'} onChange={e => set(f.key, e.target.value)} />
        )
      })}
      <div className={base.formActions}>
        <Button type="submit" loading={saving} disabled={uploading}>
          Salvar
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}

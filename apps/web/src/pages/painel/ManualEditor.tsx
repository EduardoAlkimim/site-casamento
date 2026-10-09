import { useEffect, useRef, useState, type FormEvent } from 'react'
import { uploadImage, type ManualAudience, type ManualKind, type ManualSection } from '../../lib/api'
import { resizeImage } from '../../lib/resizeImage'
import { Button } from '../../design-system/components/Button'
import { Field } from '../../design-system/components/Field'
import base from '../Painel.module.css'
import lists from './ListasPanel.module.css'
import styles from './ManualEditor.module.css'

export type SectionDraft = Pick<ManualSection, 'title' | 'body' | 'audience' | 'kind' | 'colors' | 'image'>

const AUDIENCE: { id: ManualAudience; label: string }[] = [
  { id: 'todos', label: 'Todos' },
  { id: 'madrinha', label: 'Só madrinhas' },
  { id: 'padrinho', label: 'Só padrinhos' },
]

const KIND: { id: ManualKind; label: string; hint: string }[] = [
  { id: 'texto', label: 'Texto', hint: 'Cada linha vira um parágrafo.' },
  { id: 'paleta', label: 'Paleta de cores', hint: 'Texto em cima, cores em círculos embaixo.' },
  { id: 'agenda', label: 'Roteiro (horários)', hint: 'Uma linha por horário, assim: 15h00 | Chegada dos padrinhos' },
  { id: 'dicas', label: 'Dicas', hint: 'Uma dica por linha; cada uma ganha um ícone.' },
]

type Props = {
  section: ManualSection
  index: number
  isFirst: boolean
  isLast: boolean
  onSave: (draft: SectionDraft) => Promise<boolean>
  onMove: (direction: 'up' | 'down') => void
  onRemove: () => void
}

export function SectionEditor({ section, index, isFirst, isLast, onSave, onMove, onRemove }: Props) {
  const from = (s: ManualSection): SectionDraft => ({
    title: s.title,
    body: s.body,
    audience: s.audience,
    kind: s.kind,
    colors: s.colors,
    image: s.image,
  })
  const [draft, setDraft] = useState<SectionDraft>(() => from(section))
  const [preview, setPreview] = useState<string | null>(section.imageUrl)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [imageError, setImageError] = useState<string>()
  const fileRef = useRef<HTMLInputElement>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(from(section))
  const set = <K extends keyof SectionDraft>(k: K, v: SectionDraft[K]) => setDraft(d => ({ ...d, [k]: v }))

  // Recarrega quando a seção muda no servidor (ex.: depois de reordenar).
  useEffect(() => {
    setDraft(from(section))
    setPreview(section.imageUrl)
  }, [JSON.stringify(section)])

  const pick = async (file?: File) => {
    if (!file) return
    setUploading(true)
    setImageError(undefined)
    try {
      const up = await uploadImage(await resizeImage(file))
      set('image', up.image)
      setPreview(up.url)
    } catch (err) {
      setImageError((err as Error).message)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const ok = await onSave(draft)
    setSaving(false)
    if (ok) {
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2500)
    }
  }

  const kind = KIND.find(k => k.id === draft.kind)!

  return (
    <form className={base.form} onSubmit={save} aria-label={`Seção ${index + 1}: ${section.title}`}>
      <Field label={`Seção ${index + 1} · título`} required value={draft.title} onChange={e => set('title', e.target.value)} />

      <div className={styles.row}>
        <label className={lists.selectField}>
          <span className={lists.selectLabel}>Para quem</span>
          <select className={lists.select} value={draft.audience} onChange={e => set('audience', e.target.value as ManualAudience)}>
            {AUDIENCE.map(a => (
              <option key={a.id} value={a.id}>{a.label}</option>
            ))}
          </select>
        </label>
        <label className={lists.selectField}>
          <span className={lists.selectLabel}>Tipo</span>
          <select className={lists.select} value={draft.kind} onChange={e => set('kind', e.target.value as ManualKind)}>
            {KIND.map(k => (
              <option key={k.id} value={k.id}>{k.label}</option>
            ))}
          </select>
        </label>
      </div>

      <Field label="Texto" multiline rows={6} hint={kind.hint} value={draft.body} onChange={e => set('body', e.target.value)} />

      {draft.kind === 'paleta' && (
        <fieldset className={styles.colors}>
          <legend className={base.legend}>Cores da paleta</legend>
          <ul>
            {draft.colors.map((c, i) => (
              <li key={i}>
                <input
                  type="color"
                  value={c}
                  aria-label={`Cor ${i + 1}`}
                  onChange={e => set('colors', draft.colors.map((x, j) => (j === i ? e.target.value.toUpperCase() : x)))}
                />
                <button
                  type="button"
                  className={styles.removeColor}
                  aria-label={`Tirar cor ${i + 1}`}
                  onClick={() => set('colors', draft.colors.filter((_, j) => j !== i))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
          <Button variant="quiet" onClick={() => set('colors', [...draft.colors, '#B95F3B'])}>
            Adicionar cor
          </Button>
        </fieldset>
      )}

      <div className={lists.photoField}>
        <span className={lists.photoPreview}>{preview ? <img src={preview} alt="Imagem da seção" /> : <span>Sem imagem</span>}</span>
        <div className={lists.photoActions}>
          <input ref={fileRef} type="file" accept="image/*" className="visually-hidden" onChange={e => pick(e.target.files?.[0])} />
          <Button variant="outline" loading={uploading} onClick={() => fileRef.current?.click()}>
            {preview ? 'Trocar imagem' : 'Colocar imagem'}
          </Button>
          {preview && (
            <Button
              variant="quiet"
              onClick={() => {
                set('image', null)
                setPreview(null)
              }}
            >
              Tirar imagem
            </Button>
          )}
          {imageError && <p className={base.error} role="alert">{imageError}</p>}
        </div>
      </div>

      <div className={base.formActions}>
        <Button type="submit" loading={saving} disabled={!dirty || uploading}>
          Salvar
        </Button>
        {saved && !dirty && <span className={base.saved} role="status">Salvo</span>}
        <span className={base.rowActions}>
          <Button variant="quiet" disabled={isFirst} onClick={() => onMove('up')} aria-label={`Subir ${section.title}`}>
            Subir
          </Button>
          <Button variant="quiet" disabled={isLast} onClick={() => onMove('down')} aria-label={`Descer ${section.title}`}>
            Descer
          </Button>
          <Button variant="quiet" className={base.danger} onClick={onRemove}>
            Apagar
          </Button>
        </span>
      </div>
    </form>
  )
}

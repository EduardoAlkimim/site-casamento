import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { api, uploadImage, type Gift, type GiftListData, type GiftListName, type GiftRoom, type GiftStatus } from '../../lib/api'
import { useAccess } from '../../lib/access'
import { centsToInput, formatBRL, parseBRL } from '../../lib/money'
import { resizeImage } from '../../lib/resizeImage'
import { Button } from '../../design-system/components/Button'
import { Field } from '../../design-system/components/Field'
import { Eyebrow } from '../../design-system/components/Ornaments'
import base from '../Painel.module.css'
import styles from './ListasPanel.module.css'
import { EventEditor, ImportBox, RoomsEditor, roomCounts } from './ChaTools'

const LISTS: { id: GiftListName; label: string; slug: string; path: string }[] = [
  { id: 'casamento', label: 'Casamento', slug: 'presentes', path: '/presentes' },
  { id: 'cha', label: 'Chá de Panela', slug: 'cha-de-panela', path: '/cha-de-panela' },
]

const STATUS: { id: GiftStatus; label: string }[] = [
  { id: 'disponivel', label: 'Disponível' },
  { id: 'reservado', label: 'Reservado' },
  { id: 'presenteado', label: 'Presenteado' },
]

export function ListasPanel({ initial = 'casamento' }: { initial?: GiftListName }) {
  const [active, setActive] = useState<GiftListName>(initial)
  const [data, setData] = useState<GiftListData | null>(null)
  const [error, setError] = useState<string>()
  const [editing, setEditing] = useState<number | 'new' | null>(null)
  const [roomFilter, setRoomFilter] = useState<number | 'todos' | 'sem'>('todos')
  const list = LISTS.find(l => l.id === active)!

  useEffect(() => {
    setData(null)
    setEditing(null)
    setRoomFilter('todos')
    api<GiftListData>(`/admin/listas/${active}`)
      .then(setData)
      .catch(err => setError(err.message))
  }, [active])

  const apply = async (path: string, init: { method?: string; body?: unknown }) => {
    setError(undefined)
    try {
      const d = await api<Partial<GiftListData>>(path, init)
      setData(prev => (prev ? { ...prev, ...d } : prev))
      return true
    } catch (err) {
      setError((err as Error).message)
      return false
    }
  }

  const importList = async (path: string, init: { method?: string; body?: unknown }) => {
    setError(undefined)
    try {
      const d = await api<GiftListData & { added: number; skipped: number }>(path, init)
      setData(prev => (prev ? { ...prev, ...d } : prev))
      return { added: d.added, skipped: d.skipped }
    } catch (err) {
      setError((err as Error).message)
      return null
    }
  }

  const roomName = (id: number | null) => data?.rooms.find(r => r.id === id)?.name
  const shown =
    data?.gifts.filter(g =>
      roomFilter === 'todos' ? true : roomFilter === 'sem' ? g.roomId == null : g.roomId === roomFilter,
    ) ?? []
  const usesRooms = active === 'cha' || Boolean(data?.rooms.length)

  return (
    <section className={base.block} aria-labelledby="listas">
      <Eyebrow index="V">Presentes</Eyebrow>
      <h2 id="listas" className={base.blockTitle}>Listas de presentes</h2>

      <div className={styles.tabs} role="group" aria-label="Escolha a lista">
        {LISTS.map(l => (
          <button
            key={l.id}
            type="button"
            className={styles.tab}
            aria-pressed={active === l.id}
            onClick={() => setActive(l.id)}
          >
            {l.label}
          </button>
        ))}
      </div>

      {data && (
        <PageTextEditor
          slug={list.slug}
          heading={data.page.heading}
          intro={data.page.intro}
          path={list.path}
          onSaved={(heading, intro) => setData(prev => (prev ? { ...prev, page: { ...prev.page, heading, intro } } : prev))}
        />
      )}

      {data?.event && (
        <EventEditor event={data.event} onSaved={event => setData(prev => (prev ? { ...prev, event } : prev))} />
      )}
      {data && usesRooms && <RoomsEditor list={active} rooms={data.rooms} counts={roomCounts(data)} apply={apply} />}

      {error && <p className={base.error} role="alert">{error}</p>}
      {!data && !error && <p className={base.help}>Carregando…</p>}

      {data && (
        <>
          <div className={styles.listHead}>
            <p className={base.formTitle}>
              {data.gifts.length} {data.gifts.length === 1 ? 'presente' : 'presentes'}
            </p>
            {editing !== 'new' && (
              <Button variant="outline" onClick={() => setEditing('new')}>
                Adicionar presente
              </Button>
            )}
          </div>

          <ImportBox list={active} apply={importList} />

          {usesRooms && data.rooms.length > 0 && (
            <div className={styles.filter} role="group" aria-label="Filtrar por cômodo">
              {(
                [
                  ['todos', 'Todos', data.gifts.length],
                  ...data.rooms.map(r => [r.id, r.name, data.gifts.filter(g => g.roomId === r.id).length] as const),
                  ['sem', 'Sem cômodo', data.gifts.filter(g => g.roomId == null).length],
                ] as const
              ).map(([id, label, n]) => (
                <button key={String(id)} type="button" aria-pressed={roomFilter === id} onClick={() => setRoomFilter(id as typeof roomFilter)}>
                  {label} <span>{n}</span>
                </button>
              ))}
            </div>
          )}

          {editing === 'new' && (
            <GiftForm
              rooms={data.rooms}
              defaultMode={active === 'cha' ? 'reserva' : 'site'}
              defaultRoom={typeof roomFilter === 'number' ? roomFilter : null}
              onCancel={() => setEditing(null)}
              onSave={async body => {
                const ok = await apply(`/admin/listas/${active}/presentes`, { body })
                if (ok) setEditing(null)
                return ok
              }}
            />
          )}

          <ul className={base.rows}>
            {shown.map((gift, i) => (
              <li key={gift.id} className={styles.giftRow}>
                <div className={styles.summary}>
                  <span className={styles.thumb}>{gift.imageUrl && <img src={gift.imageUrl} alt="" />}</span>
                  <span className={base.rowMain}>
                    <span className={styles.giftName}>{gift.name}</span>
                    <span className={base.rowMeta}>
                      {[
                        roomName(gift.roomId),
                        gift.priceCents != null ? formatBRL(gift.priceCents) : 'Sem valor',
                        STATUS.find(s => s.id === gift.status)!.label,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                    {gift.reservedBy && (
                      <span className={styles.reserved}>
                        Vai levar: <strong>{gift.reservedBy}</strong>
                        {gift.reservedContact && <> · {gift.reservedContact}</>}
                      </span>
                    )}
                  </span>
                </div>
                <span className={base.rowActions}>
                  {gift.status === 'reservado' && (
                    <Button
                      variant="quiet"
                      onClick={() =>
                        confirm(`Liberar “${gift.name}”? Ele volta a ficar disponível para outra pessoa.`) &&
                        apply(`/admin/presentes/${gift.id}`, { method: 'PATCH', body: { status: 'disponivel' } })
                      }
                    >
                      Liberar reserva
                    </Button>
                  )}
                  <Button variant="quiet" onClick={() => setEditing(editing === gift.id ? null : gift.id)}>
                    {editing === gift.id ? 'Fechar' : 'Editar'}
                  </Button>
                  <Button
                    variant="quiet"
                    disabled={i === 0}
                    aria-label={`Subir ${gift.name}`}
                    onClick={() => apply(`/admin/presentes/${gift.id}/mover`, { body: { direction: 'up' } })}
                  >
                    Subir
                  </Button>
                  <Button
                    variant="quiet"
                    disabled={i === shown.length - 1}
                    aria-label={`Descer ${gift.name}`}
                    onClick={() => apply(`/admin/presentes/${gift.id}/mover`, { body: { direction: 'down' } })}
                  >
                    Descer
                  </Button>
                  <Button
                    variant="quiet"
                    className={base.danger}
                    onClick={() =>
                      confirm(`Apagar “${gift.name}” da lista?`) &&
                      apply(`/admin/presentes/${gift.id}`, { method: 'DELETE' })
                    }
                  >
                    Apagar
                  </Button>
                </span>
                {editing === gift.id && (
                  <GiftForm
                    gift={gift}
                    rooms={data.rooms}
                    defaultMode={active === 'cha' ? 'reserva' : 'site'}
                    defaultRoom={null}
                    onCancel={() => setEditing(null)}
                    onSave={async body => {
                      const ok = await apply(`/admin/presentes/${gift.id}`, { method: 'PATCH', body })
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
    </section>
  )
}

/* ── Título e texto de abertura da página ────────────────────────────── */
export function PageTextEditor(props: {
  slug: string
  heading: string | null
  intro: string | null
  path: string
  onSaved: (heading: string | null, intro: string | null) => void
}) {
  const { refresh } = useAccess()
  const [heading, setHeading] = useState(props.heading ?? '')
  const [intro, setIntro] = useState(props.intro ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string>()
  const dirty = heading !== (props.heading ?? '') || intro !== (props.intro ?? '')

  useEffect(() => {
    setHeading(props.heading ?? '')
    setIntro(props.intro ?? '')
  }, [props.heading, props.intro])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(undefined)
    try {
      const next = { heading: heading.trim() || null, intro: intro.trim() || null }
      await api(`/admin/pages/${props.slug}`, { method: 'PATCH', body: next })
      props.onSaved(next.heading, next.intro)
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
    <form className={base.form} onSubmit={save} aria-label="Textos da página">
      <p className={base.formTitle}>Topo da página</p>
      <Field label="Título" value={heading} onChange={e => setHeading(e.target.value)} />
      <Field label="Texto de abertura" multiline rows={4} value={intro} onChange={e => setIntro(e.target.value)} />
      {error && <p className={base.error} role="alert">{error}</p>}
      <div className={base.formActions}>
        <Button type="submit" loading={saving} disabled={!dirty}>
          Salvar
        </Button>
        {saved && !dirty && <span className={base.saved} role="status">Salvo</span>}
        <Link to={props.path} className={base.inlineLink}>Ver como fica</Link>
      </div>
    </form>
  )
}

/* ── Formulário de presente ──────────────────────────────────────────── */
type GiftBody = {
  name: string
  description: string
  image: string | null
  priceCents: number | null
  status: GiftStatus
  purchaseMode: Mode
  externalUrl: string | null
  roomId: number | null
}

type Mode = 'site' | 'link' | 'reserva'

function GiftForm({
  gift,
  rooms,
  defaultMode,
  defaultRoom,
  onSave,
  onCancel,
}: {
  gift?: Gift
  rooms: GiftRoom[]
  defaultMode: Mode
  defaultRoom: number | null
  onSave: (b: GiftBody) => Promise<boolean>
  onCancel: () => void
}) {
  const [name, setName] = useState(gift?.name ?? '')
  const [description, setDescription] = useState(gift?.description ?? '')
  const [price, setPrice] = useState(centsToInput(gift?.priceCents ?? null))
  const [status, setStatus] = useState<GiftStatus>(gift?.status ?? 'disponivel')
  const [mode, setMode] = useState<Mode>(gift?.purchaseMode ?? defaultMode)
  const [roomId, setRoomId] = useState<number | null>(gift ? gift.roomId : defaultRoom)
  const [url, setUrl] = useState(gift?.externalUrl ?? '')
  const [image, setImage] = useState<{ name: string | null; url: string | null }>({
    name: gift?.image ?? null,
    url: gift?.imageUrl ?? null,
  })
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [errors, setErrors] = useState<{ price?: string; url?: string; image?: string }>({})
  const fileRef = useRef<HTMLInputElement>(null)

  const pickImage = async (file: File | undefined) => {
    if (!file) return
    setUploading(true)
    setErrors(e => ({ ...e, image: undefined }))
    try {
      const uploaded = await uploadImage(await resizeImage(file))
      setImage({ name: uploaded.image, url: uploaded.url })
    } catch (err) {
      setErrors(e => ({ ...e, image: (err as Error).message }))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const priceCents = parseBRL(price)
    const next: typeof errors = {}
    if (Number.isNaN(priceCents)) next.price = 'Use só números, ex.: 349,90.'
    if (mode === 'link' && !/^https?:\/\/\S+$/.test(url.trim())) next.url = 'Cole o link completo da loja, começando com https://'
    setErrors(next)
    if (next.price || next.url) return
    setSaving(true)
    await onSave({
      name,
      description,
      image: image.name,
      priceCents: priceCents as number | null,
      status,
      purchaseMode: mode,
      externalUrl: mode === 'link' ? url.trim() : null,
      roomId,
    })
    setSaving(false)
  }

  return (
    <form className={`${base.form} ${styles.giftForm}`} onSubmit={submit}>
      <p className={base.formTitle}>{gift ? 'Editar presente' : 'Novo presente'}</p>

      <div className={styles.photoField}>
        <span className={styles.photoPreview}>
          {image.url ? <img src={image.url} alt="Foto do presente" /> : <span>Sem foto</span>}
        </span>
        <div className={styles.photoActions}>
          <input
            ref={fileRef}
            id={`foto-${gift?.id ?? 'novo'}`}
            type="file"
            accept="image/*"
            className="visually-hidden"
            onChange={e => pickImage(e.target.files?.[0])}
          />
          <Button variant="outline" loading={uploading} onClick={() => fileRef.current?.click()}>
            {image.url ? 'Trocar foto' : 'Escolher foto'}
          </Button>
          {image.url && (
            <Button variant="quiet" onClick={() => setImage({ name: null, url: null })}>
              Tirar foto
            </Button>
          )}
          {errors.image && <p className={base.error} role="alert">{errors.image}</p>}
        </div>
      </div>

      <Field label="Nome" required value={name} onChange={e => setName(e.target.value)} />
      <Field label="Descrição" multiline rows={3} value={description} onChange={e => setDescription(e.target.value)} />
      <Field
        label="Valor (R$)"
        inputMode="decimal"
        placeholder="349,90"
        hint="Deixe vazio se não quiser mostrar valor."
        value={price}
        error={errors.price}
        onChange={e => setPrice(e.target.value)}
      />

      {rooms.length > 0 && (
        <label className={styles.selectField}>
          <span className={styles.selectLabel}>Cômodo</span>
          <select
            className={styles.select}
            value={roomId ?? ''}
            onChange={e => setRoomId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">Sem cômodo</option>
            {rooms.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </label>
      )}

      <label className={styles.selectField}>
        <span className={styles.selectLabel}>Situação</span>
        <select className={styles.select} value={status} onChange={e => setStatus(e.target.value as GiftStatus)}>
          {STATUS.map(s => (
            <option key={s.id} value={s.id}>{s.label}</option>
          ))}
        </select>
      </label>

      <fieldset className={base.roles}>
        <legend className={base.legend}>Como presentear</legend>
        <label className={base.radio}>
          <input type="radio" name={`modo-${gift?.id ?? 'novo'}`} checked={mode === 'reserva'} onChange={() => setMode('reserva')} />
          “Eu vou levar” (o convidado reserva e traz)
        </label>
        <label className={base.radio}>
          <input type="radio" name={`modo-${gift?.id ?? 'novo'}`} checked={mode === 'site'} onChange={() => setMode('site')} />
          Pelo site (PIX ou cartão)
        </label>
        <label className={base.radio}>
          <input type="radio" name={`modo-${gift?.id ?? 'novo'}`} checked={mode === 'link'} onChange={() => setMode('link')} />
          Link de uma loja
        </label>
      </fieldset>
      {mode === 'link' && (
        <Field
          label="Link da loja"
          type="url"
          inputMode="url"
          placeholder="https://"
          value={url}
          error={errors.url}
          onChange={e => setUrl(e.target.value)}
        />
      )}

      <div className={base.formActions}>
        <Button type="submit" loading={saving} disabled={uploading}>
          {gift ? 'Salvar' : 'Adicionar à lista'}
        </Button>
        <Button variant="quiet" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}

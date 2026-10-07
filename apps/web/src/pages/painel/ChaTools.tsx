import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { api, type ChaEvent, type GiftListData, type GiftListName, type GiftRoom } from '../../lib/api'
import { formatBRL, parseBRL } from '../../lib/money'
import { Button } from '../../design-system/components/Button'
import { Field } from '../../design-system/components/Field'
import base from '../Painel.module.css'
import styles from './ChaTools.module.css'

/* ── Dados do evento do chá ──────────────────────────────────────────── */
export function EventEditor({ event, onSaved }: { event: ChaEvent; onSaved: (e: ChaEvent) => void }) {
  const [values, setValues] = useState(event)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string>()
  const dirty = (Object.keys(event) as (keyof ChaEvent)[]).some(k => values[k] !== event[k])
  const set = (k: keyof ChaEvent, v: string) => setValues(prev => ({ ...prev, [k]: v }))

  useEffect(() => setValues(event), [event])

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(undefined)
    try {
      const d = await api<{ event: ChaEvent }>('/admin/cha-evento', { method: 'PATCH', body: values })
      onSaved(d.event)
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2500)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className={base.form} onSubmit={save} aria-label="Dados do chá">
      <p className={base.formTitle}>Sobre o chá</p>
      <p className={base.help}>Aparece no topo da página. O que ficar vazio não aparece.</p>
      <Field label="Data" placeholder="Ex.: Sábado, 13 de fevereiro de 2027" value={values.date} onChange={e => set('date', e.target.value)} />
      <Field label="Horário" placeholder="Ex.: 15h" value={values.time} onChange={e => set('time', e.target.value)} />
      <Field label="Local" placeholder="Ex.: Casa da Thamires" value={values.venue} onChange={e => set('venue', e.target.value)} />
      <Field label="Endereço" hint="Com endereço, aparece “Abrir no mapa”." value={values.address} onChange={e => set('address', e.target.value)} />
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

/* ── Cômodos ─────────────────────────────────────────────────────────── */
type Apply = (path: string, init: { method?: string; body?: unknown }) => Promise<boolean>

export function RoomsEditor({ list, rooms, counts, apply }: { list: GiftListName; rooms: GiftRoom[]; counts: Record<number, number>; apply: Apply }) {
  const [name, setName] = useState('')
  const [renaming, setRenaming] = useState<number | null>(null)
  const [draft, setDraft] = useState('')

  const add = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    if (await apply(`/admin/listas/${list}/comodos`, { body: { name: name.trim() } })) setName('')
  }

  return (
    <div className={base.form}>
      <p className={base.formTitle}>Cômodos</p>
      <p className={base.help}>A lista aparece separada nesta ordem. Apagar um cômodo não apaga os itens: eles vão para “Outros”.</p>
      <ul className={styles.rooms}>
        {rooms.map((room, i) => (
          <li key={room.id} className={styles.room}>
            {renaming === room.id ? (
              <form
                className={styles.rename}
                onSubmit={async e => {
                  e.preventDefault()
                  if (draft.trim() && (await apply(`/admin/comodos/${room.id}`, { method: 'PATCH', body: { name: draft.trim() } }))) setRenaming(null)
                }}
              >
                <input className={styles.input} value={draft} onChange={e => setDraft(e.target.value)} aria-label={`Novo nome de ${room.name}`} autoFocus />
                <Button type="submit" variant="quiet">Salvar</Button>
                <Button variant="quiet" onClick={() => setRenaming(null)}>Cancelar</Button>
              </form>
            ) : (
              <>
                <span className={styles.roomName}>
                  {room.name} <span className={styles.count}>{counts[room.id] ?? 0}</span>
                </span>
                <span className={base.rowActions}>
                  <Button
                    variant="quiet"
                    onClick={() => {
                      setRenaming(room.id)
                      setDraft(room.name)
                    }}
                  >
                    Renomear
                  </Button>
                  <Button variant="quiet" disabled={i === 0} aria-label={`Subir ${room.name}`} onClick={() => apply(`/admin/comodos/${room.id}/mover`, { body: { direction: 'up' } })}>
                    Subir
                  </Button>
                  <Button
                    variant="quiet"
                    disabled={i === rooms.length - 1}
                    aria-label={`Descer ${room.name}`}
                    onClick={() => apply(`/admin/comodos/${room.id}/mover`, { body: { direction: 'down' } })}
                  >
                    Descer
                  </Button>
                  <Button
                    variant="quiet"
                    className={base.danger}
                    onClick={() => confirm(`Apagar o cômodo “${room.name}”? Os itens dele vão para “Outros”.`) && apply(`/admin/comodos/${room.id}`, { method: 'DELETE' })}
                  >
                    Apagar
                  </Button>
                </span>
              </>
            )}
          </li>
        ))}
      </ul>
      <form className={styles.addRoom} onSubmit={add}>
        <Field label="Novo cômodo" placeholder="Ex.: Varanda" value={name} onChange={e => setName(e.target.value)} />
        <Button type="submit" variant="outline" disabled={!name.trim()}>
          Adicionar
        </Button>
      </form>
    </div>
  )
}

/* ── Colar uma lista ─────────────────────────────────────────────────── */
type Parsed = { room: string; name: string; priceCents: number | null }

const BULLET = /^\s*(?:[-–—•*·]|\d+[.)])\s+/
// Preço só quando vem marcado: "R$ 180", "- 180", "— 180,00". Evita ler "Kit 3 potes" como R$ 3.
const PRICE = /\s*(?:[-–—|:]\s*(?:R\$\s*)?|R\$\s*)(\d[\d.]*(?:,\d{1,2})?)\s*(?:reais)?\s*$/i

export function parseList(text: string): Parsed[] {
  const lines = text.split(/\r?\n/).map(l => l.replace(/\s+$/, ''))
  const out: Parsed[] = []
  let room = ''
  lines.forEach((line, i) => {
    if (!line.trim()) return
    const next = lines.slice(i + 1).find(l => l.trim()) ?? ''
    const isHeader =
      /^\s*#/.test(line) || /:\s*$/.test(line) || (!BULLET.test(line) && BULLET.test(next) && !PRICE.test(line))
    if (isHeader) {
      room = line.replace(/^\s*#+\s*/, '').replace(/:\s*$/, '').trim()
      return
    }
    let name = line.replace(BULLET, '').trim()
    let priceCents: number | null = null
    const m = name.match(PRICE)
    if (m) {
      const cents = parseBRL(m[1])
      if (cents && !Number.isNaN(cents)) {
        priceCents = cents
        name = name.slice(0, m.index).trim()
      }
    }
    if (name) out.push({ room, name: name.slice(0, 120), priceCents })
  })
  return out
}

export function ImportBox({ list, apply }: { list: GiftListName; apply: (path: string, init: { method?: string; body?: unknown }) => Promise<{ added: number; skipped: number } | null> }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const items = useMemo(() => parseList(text), [text])
  const rooms = useMemo(() => [...new Set(items.map(i => i.room || 'Outros'))], [items])

  const run = async () => {
    setBusy(true)
    setResult(null)
    const r = await apply(`/admin/listas/${list}/importar`, { body: { items } })
    setBusy(false)
    if (r) {
      setResult(`${r.added} ${r.added === 1 ? 'item cadastrado' : 'itens cadastrados'}${r.skipped ? ` · ${r.skipped} já estavam na lista` : ''}.`)
      setText('')
    }
  }

  if (!open) {
    return (
      <div>
        <Button variant="outline" onClick={() => setOpen(true)}>
          Colar uma lista
        </Button>
        {result && <p className={base.saved} role="status">{result}</p>}
      </div>
    )
  }

  return (
    <div className={base.form}>
      <p className={base.formTitle}>Colar uma lista</p>
      <p className={base.help}>
        Escreva o cômodo numa linha e os itens embaixo (com traço ou não). Valor é opcional: “Jogo de facas - 180” ou “R$ 180”.
        Itens que já estão na lista não são repetidos.
      </p>
      <pre className={styles.example}>{'Cozinha\n- Jogo de facas - 180\n- Escorredor de louça\n\nBanheiro\n- Jogo de toalhas R$ 120'}</pre>
      <Field label="Lista" className={styles.listField} multiline rows={10} value={text} onChange={e => setText(e.target.value)} placeholder="Cole aqui…" />

      {items.length > 0 && (
        <div className={styles.preview} aria-live="polite">
          <p className={base.formTitle}>
            Prévia: {items.length} {items.length === 1 ? 'item' : 'itens'} em {rooms.length} {rooms.length === 1 ? 'cômodo' : 'cômodos'}
          </p>
          {rooms.map(room => (
            <div key={room}>
              <p className={styles.previewRoom}>{room}</p>
              <ul className={styles.previewList}>
                {items
                  .filter(i => (i.room || 'Outros') === room)
                  .map((i, n) => (
                    <li key={n}>
                      {i.name}
                      {i.priceCents != null && <span> · {formatBRL(i.priceCents)}</span>}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div className={base.formActions}>
        <Button onClick={run} loading={busy} disabled={!items.length}>
          Cadastrar {items.length || ''} {items.length === 1 ? 'item' : 'itens'}
        </Button>
        <Button variant="quiet" onClick={() => setOpen(false)}>
          Fechar
        </Button>
      </div>
      {result && <p className={base.saved} role="status">{result}</p>}
    </div>
  )
}

export const roomCounts = (data: GiftListData) =>
  data.gifts.reduce<Record<number, number>>((acc, g) => {
    if (g.roomId != null) acc[g.roomId] = (acc[g.roomId] ?? 0) + 1
    return acc
  }, {})

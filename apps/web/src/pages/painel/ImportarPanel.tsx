import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent } from 'react'
import { api, uploadImage, type Gift, type GiftListData, type GiftListName } from '../../lib/api'
import { centsToInput, formatBRL, parseBRL } from '../../lib/money'
import { resizeImage } from '../../lib/resizeImage'
import { Button } from '../../design-system/components/Button'
import { Eyebrow } from '../../design-system/components/Ornaments'
import base from '../Painel.module.css'
import styles from './ImportarPanel.module.css'

// "Adicionar pela loja": um botão nos favoritos lê o produto na página da loja
// (no navegador dos noivos) e manda para cá. Aqui cada produto preenche um
// item que já existe na lista (descrição, valor, link e foto) ou vira um novo.

type Draft = {
  key: string
  url: string
  title: string
  price: string
  imageUrl: string
  /** Foto já enviada para o site (quando colada/escolhida aqui). */
  upload?: { image: string; url: string }
  name: string
  description: string
  roomId: number | null
  saved?: string
}

const STORAGE = 'importar-fila'
const LIST_KEY = 'importar-lista'

/* ── Leitura do que veio da loja ─────────────────────────────────────── */
const STORE_SUFFIX = /\s*[|\-–]\s*(Shopee|Mercado ?Livre|Magazine ?Luiza|Magalu|Amazon|Americanas|Casas ?Bahia|KaBuM|Tok ?& ?Stok|Leroy ?Merlin|Tramontina|Camicado)\b.*$/i
const cleanTitle = (t: string) => t.replace(STORE_SUFFIX, '').replace(/\s+/g, ' ').trim()

/** "R$ 1.299,90", "R$29,90 - R$49,90", "41.99" → texto "1.299,90" pronto para o campo. */
function priceInput(raw: string) {
  const token = raw.replace(/\s/g, '').match(/\d[\d.,]*/)?.[0]
  if (!token) return ''
  let n: number
  if (token.includes(',')) n = Number(token.replace(/\./g, '').replace(',', '.'))
  else if (/\.\d{1,2}$/.test(token)) n = Number(token)
  else n = Number(token.replace(/\./g, ''))
  return Number.isFinite(n) && n > 0 ? centsToInput(Math.round(n * 100)) : ''
}

/** Foto em tamanho cheio (a Shopee manda miniaturas com sufixos). */
const fullImage = (u: string) => u.replace(/@resize_w\d+[^/?#]*$/, '').replace(/_tn$/, '')

const words = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length > 2 && !['com', 'para', 'sem', 'dos', 'das', 'kit', 'jogo'].includes(w))

/** Item da lista (ainda sem link) cujo nome inteiro aparece no título do produto. */
function bestMatch(title: string, gifts: Gift[]) {
  const t = new Set(words(title).flatMap(w => [w, w.replace(/s$/, '')]))
  let best: Gift | null = null
  let score = 0
  for (const g of gifts) {
    if (g.externalUrl) continue
    const w = words(g.name).map(x => x.replace(/s$/, ''))
    if (!w.length || !w.every(x => t.has(x))) continue
    const s = w.length * 10 + g.name.length / 100
    if (s > score) [best, score] = [g, s]
  }
  return best
}

const shortName = (title: string) => {
  const w = title.split(' ')
  let out = ''
  for (const x of w) {
    if ((out + ' ' + x).trim().length > 32) break
    out = (out + ' ' + x).trim()
  }
  return out || title.slice(0, 32)
}

const load = (): Draft[] => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE) ?? '[]')
  } catch {
    return []
  }
}

/* ── Botão dos favoritos ─────────────────────────────────────────────── */
const bookmarklet = (origin: string) =>
  `javascript:(()=>{const q=s=>document.querySelector(s),m=n=>q('meta[property="'+n+'"],meta[name="'+n+'"]')?.content;let p={};try{for(const s of document.querySelectorAll('script[type="application/ld+json"]')){const j=JSON.parse(s.textContent);const a=[].concat(j['@graph']||j);const f=a.find(x=>x&&[].concat(x['@type']).includes('Product'));if(f){p=f;break}}}catch(e){}const o=[].concat(p.offers||[])[0]||{};let price=o.price||o.lowPrice||m('product:price:amount')||'';if(!price){const c=[...document.querySelectorAll('body *')].filter(e=>e.childElementCount===0&&/^\\s*R\\$\\s?\\d/.test(e.textContent)&&e.getBoundingClientRect().width>0).map(e=>[e.textContent,parseFloat(getComputedStyle(e).fontSize)]);c.sort((a,b)=>b[1]-a[1]);price=c[0]?c[0][0]:''}let img=[].concat(p.image||[])[0]||m('og:image')||'';if(typeof img==='object')img=img.url||'';if(!img){const i=[...document.images].filter(i=>i.naturalWidth>=250&&i.getBoundingClientRect().top<innerHeight*1.5).sort((a,b)=>b.naturalWidth*b.naturalHeight-a.naturalWidth*a.naturalHeight)[0];img=i?i.currentSrc||i.src:''}const d={url:location.href,title:(p.name||m('og:title')||document.title||q('h1')?.innerText||'').trim(),price:String(price),image:img};window.open('${origin}/painel/importar#add='+encodeURIComponent(JSON.stringify(d)),'et-lista')})()`

export function ImportarPanel() {
  const [list, setList] = useState<GiftListName>(() => (localStorage.getItem(LIST_KEY) as GiftListName) || 'cha')
  const [data, setData] = useState<Record<GiftListName, GiftListData | null>>({ cha: null, casamento: null })
  const [drafts, setDrafts] = useState<Draft[]>(load)
  const [pasted, setPasted] = useState('')
  const [error, setError] = useState<string>()
  const [savingAll, setSavingAll] = useState(false)
  const linkRef = useRef<HTMLAnchorElement>(null)

  useEffect(() => {
    for (const l of ['cha', 'casamento'] as const) {
      api<GiftListData>(`/admin/listas/${l}`).then(
        d => setData(prev => ({ ...prev, [l]: d })),
        err => setError(err.message),
      )
    }
  }, [])

  useEffect(() => {
    try {
      const next = JSON.stringify(drafts)
      if (localStorage.getItem(STORAGE) !== next) localStorage.setItem(STORAGE, next)
    } catch {
      /* sem armazenamento: a fila só vale enquanto a página estiver aberta */
    }
  }, [drafts])

  // Ao trocar de loja, o navegador pode abrir o painel em outra aba. As abas
  // dividem a mesma fila: o que chega numa aparece na outra, sem sobrescrever.
  useEffect(() => {
    const sync = (e: StorageEvent) => e.key === STORAGE && setDrafts(load())
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(LIST_KEY, list)
    } catch {
      /* idem */
    }
  }, [list])

  // React não deixa pôr "javascript:" no href; o botão dos favoritos precisa.
  useEffect(() => {
    linkRef.current?.setAttribute('href', bookmarklet(location.origin))
  }, [])

  const gifts = data[list]?.gifts ?? []
  const rooms = data[list]?.rooms ?? []

  const addDraft = useCallback(
    (raw: { url: string; title?: string; price?: string; image?: string }) => {
      const title = cleanTitle(raw.title ?? '')
      setDrafts(prev => {
        if (prev.some(d => d.url === raw.url && !d.saved)) return prev
        return [
          {
            key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            url: raw.url,
            title,
            price: priceInput(raw.price ?? ''),
            imageUrl: raw.image ? fullImage(raw.image) : '',
            name: '',
            description: title,
            roomId: null,
          },
          ...prev,
        ]
      })
    },
    [],
  )

  // Produto chegando do botão dos favoritos: #add={...}
  useEffect(() => {
    const read = () => {
      const m = location.hash.match(/^#add=(.+)$/)
      if (!m) return
      try {
        const d = JSON.parse(decodeURIComponent(m[1]))
        if (typeof d.url === 'string' && /^https?:\/\//.test(d.url)) addDraft(d)
      } catch {
        setError('Não consegui ler o produto. Tente clicar no botão de novo.')
      }
      history.replaceState(null, '', location.pathname)
      window.scrollTo({ top: 0 })
    }
    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [addDraft])

  const addPasted = (e: FormEvent) => {
    e.preventDefault()
    const urls = pasted.match(/https?:\/\/\S+/g) ?? []
    if (!urls.length) return setError('Cole pelo menos um link começando com https://')
    setError(undefined)
    urls.reverse().forEach(url => addDraft({ url }))
    setPasted('')
  }

  const update = (key: string, patch: Partial<Draft>) => setDrafts(prev => prev.map(d => (d.key === key ? { ...d, ...patch } : d)))
  const remove = (key: string) => setDrafts(prev => prev.filter(d => d.key !== key))

  /** Item existente que este rascunho vai preencher (pelo nome escolhido ou sugerido). */
  const targetOf = useCallback(
    (d: Draft) => {
      if (d.name.trim()) {
        const n = d.name.trim().toLowerCase()
        return gifts.find(g => g.name.toLowerCase() === n && !g.externalUrl) ?? gifts.find(g => g.name.toLowerCase() === n) ?? null
      }
      return bestMatch(d.title, gifts)
    },
    [gifts],
  )

  const save = async (d: Draft) => {
    const priceCents = parseBRL(d.price)
    if (Number.isNaN(priceCents)) throw new Error('Valor inválido. Use só números, ex.: 49,90.')
    if (list === 'casamento' && priceCents == null) throw new Error('Na lista do casamento o valor é obrigatório (é o que o convidado paga).')
    let image = d.upload?.image
    if (!image && d.imageUrl) {
      const res = await fetch(`/api/admin/imagem-externa?url=${encodeURIComponent(d.imageUrl)}`, { credentials: 'same-origin' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Não consegui baixar a foto.')
      const blob = await res.blob()
      image = (await uploadImage(await resizeImage(new File([blob], 'foto', { type: blob.type })))).image
    }
    const target = targetOf(d)
    const fill = {
      description: d.description.trim().slice(0, 600),
      priceCents,
      externalUrl: d.url,
      ...(image ? { image } : {}),
    }
    const result = target
      ? await api<GiftListData>(`/admin/presentes/${target.id}`, { method: 'PATCH', body: fill })
      : await api<GiftListData>(`/admin/listas/${list}/presentes`, {
          body: {
            ...fill,
            name: (d.name.trim() || shortName(d.title) || 'Presente').slice(0, 120),
            purchaseMode: list === 'cha' ? 'reserva' : 'site',
            roomId: d.roomId,
          },
        })
    setData(prev => ({ ...prev, [list]: { ...prev[list]!, ...result } }))
    update(d.key, { saved: target ? `Preenchido: ${target.name}` : `Novo item: ${d.name.trim() || shortName(d.title)}`, upload: undefined })
  }

  const saveOne = async (d: Draft) => {
    setError(undefined)
    try {
      await save(d)
    } catch (err) {
      setError(`${d.title || d.url}: ${(err as Error).message}`)
    }
  }

  const pending = drafts.filter(d => !d.saved)
  const saveAll = async () => {
    setSavingAll(true)
    setError(undefined)
    for (const d of pending) {
      try {
        await save(d)
      } catch (err) {
        setError(`${d.title || d.url}: ${(err as Error).message}`)
        break
      }
    }
    setSavingAll(false)
  }

  const ready = Boolean(data[list])

  return (
    <section className={base.block} aria-labelledby="painel-importar">
      <Eyebrow>Presentes</Eyebrow>
      <h2 id="painel-importar" className={base.blockTitle}>Adicionar pela loja</h2>

      <div className={styles.howto}>
        <p className={base.formTitle}>Uma vez só: o botão nos favoritos</p>
        <ol>
          <li>
            Arraste este botão para a barra de favoritos do navegador:{' '}
            <a ref={linkRef} className={styles.bookmarklet} onClick={e => e.preventDefault()} draggable>
              ＋ Lista E&amp;T
            </a>
          </li>
          <li>Na Shopee (ou em outra loja), abra a página do produto e clique no favorito “＋ Lista E&amp;T”.</li>
          <li>O produto aparece aqui embaixo com nome, valor, foto e link. Confira e salve.</li>
        </ol>
        <p className={base.help}>
          A barra de favoritos não aparece? No Chrome e no Edge: <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd>.
        </p>
      </div>

      <form className={styles.paste} onSubmit={addPasted}>
        <label htmlFor="links-colados" className={base.formTitle}>
          Ou cole os links
        </label>
        <p className={base.help}>Um por linha. Depois é só completar valor e foto (dá para colar a foto com Ctrl + V no card).</p>
        <textarea id="links-colados" rows={3} value={pasted} onChange={e => setPasted(e.target.value)} placeholder="https://shopee.com.br/…" />
        <div className={base.formActions}>
          <Button type="submit" variant="outline" disabled={!pasted.trim()}>
            Adicionar à fila
          </Button>
        </div>
      </form>

      <div className={styles.listChoice} role="group" aria-label="Em qual lista entram">
        <span>Entram na lista:</span>
        {(['cha', 'casamento'] as const).map(l => (
          <button key={l} type="button" aria-pressed={list === l} onClick={() => setList(l)}>
            {l === 'cha' ? 'Chá de Panela' : 'Casamento'}
          </button>
        ))}
      </div>

      {error && <p className={base.error} role="alert">{error}</p>}
      {!ready && <p className={base.help}>Carregando as listas…</p>}

      {drafts.length > 0 && (
        <div className={styles.queueHead}>
          <p className={base.formTitle}>
            {pending.length ? `${pending.length} na fila` : 'Tudo salvo'}
          </p>
          <span className={base.formActions}>
            {pending.length > 1 && (
              <Button onClick={saveAll} loading={savingAll} disabled={!ready}>
                Salvar todos
              </Button>
            )}
            {drafts.some(d => d.saved) && (
              <Button variant="quiet" onClick={() => setDrafts(prev => prev.filter(d => !d.saved))}>
                Limpar os salvos
              </Button>
            )}
          </span>
        </div>
      )}

      <datalist id="itens-da-lista">
        {gifts
          .filter(g => !g.externalUrl)
          .map(g => (
            <option key={g.id} value={g.name} />
          ))}
      </datalist>

      <ul className={styles.queue}>
        {drafts.map(d => (
          <DraftCard
            key={d.key}
            draft={d}
            list={list}
            rooms={rooms}
            target={ready ? targetOf(d) : null}
            sameLink={gifts.find(g => g.externalUrl === d.url) ?? null}
            onChange={patch => update(d.key, patch)}
            onSave={() => saveOne(d)}
            onRemove={() => remove(d.key)}
            onError={setError}
          />
        ))}
      </ul>
    </section>
  )
}

/* ── Um produto da fila ──────────────────────────────────────────────── */
function DraftCard({
  draft: d,
  list,
  rooms,
  target,
  sameLink,
  onChange,
  onSave,
  onRemove,
  onError,
}: {
  draft: Draft
  list: GiftListName
  rooms: { id: number; name: string }[]
  target: Gift | null
  sameLink: Gift | null
  onChange: (p: Partial<Draft>) => void
  onSave: () => Promise<void>
  onRemove: () => void
  onError: (m: string) => void
}) {
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const host = useMemo(() => {
    try {
      return new URL(d.url).hostname.replace(/^www\./, '')
    } catch {
      return d.url
    }
  }, [d.url])

  const takeFile = async (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return
    setUploading(true)
    try {
      const up = await uploadImage(await resizeImage(file))
      onChange({ upload: up, imageUrl: '' })
    } catch (err) {
      onError((err as Error).message)
    } finally {
      setUploading(false)
    }
  }

  // Ctrl + V de uma foto copiada da loja (botão direito → Copiar imagem).
  const onPaste = (e: ClipboardEvent) => {
    const file = [...e.clipboardData.files].find(f => f.type.startsWith('image/'))
    if (file) {
      e.preventDefault()
      void takeFile(file)
    }
  }
  // Arrastar a foto da página da loja para o card.
  const onDrop = (e: DragEvent) => {
    e.preventDefault()
    const file = [...e.dataTransfer.files].find(f => f.type.startsWith('image/'))
    if (file) return void takeFile(file)
    const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')
    if (/^https:\/\//.test(url)) onChange({ imageUrl: fullImage(url.trim()), upload: undefined })
  }

  const preview = d.upload?.url ?? (d.imageUrl ? `/api/admin/imagem-externa?url=${encodeURIComponent(d.imageUrl)}` : null)

  if (d.saved) {
    return (
      <li className={`${styles.card} ${styles.done}`}>
        <span className={styles.doneMark} aria-hidden="true">✓</span>
        <span>
          <strong>{d.saved}</strong>
          <span className={base.rowMeta}>{d.title || host}</span>
        </span>
        <Button variant="quiet" onClick={onRemove}>
          Tirar da fila
        </Button>
      </li>
    )
  }

  return (
    <li className={styles.card} onPaste={onPaste} onDragOver={e => e.preventDefault()} onDrop={onDrop}>
      <div className={styles.photo}>
        {preview ? <img src={preview} alt="" /> : <span>Sem foto</span>}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="visually-hidden"
          tabIndex={-1}
          onChange={e => takeFile(e.target.files?.[0])}
        />
        <Button variant="quiet" loading={uploading} onClick={() => fileRef.current?.click()}>
          {preview ? 'Trocar' : 'Escolher'}
        </Button>
      </div>

      <div className={styles.fields}>
        <a className={styles.source} href={d.url} target="_blank" rel="noopener noreferrer">
          {host}
        </a>
        <p className={styles.title}>{d.title || 'Produto sem nome — preencha abaixo'}</p>
        {sameLink && <p className={styles.warn}>Esse link já está na lista em “{sameLink.name}”.</p>}

        <label className={styles.field}>
          <span>Item da lista</span>
          <input
            list="itens-da-lista"
            value={d.name}
            placeholder={target ? target.name : shortName(d.title) || 'Nome do presente'}
            onChange={e => onChange({ name: e.target.value })}
          />
        </label>
        <p className={styles.hint}>
          {target ? (
            <>
              Vai preencher <strong>{target.name}</strong>
              {target.roomId && rooms.find(r => r.id === target.roomId) ? ` (${rooms.find(r => r.id === target.roomId)!.name})` : ''} com
              descrição, valor, link e foto.
            </>
          ) : (
            <>Vai criar um item novo{list === 'cha' ? ' — escolha o cômodo' : ''}.</>
          )}
        </p>

        {!target && list === 'cha' && rooms.length > 0 && (
          <label className={styles.field}>
            <span>Cômodo</span>
            <select value={d.roomId ?? ''} onChange={e => onChange({ roomId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">Sem cômodo</option>
              {rooms.map(r => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className={styles.row2}>
          <label className={styles.field}>
            <span>Valor (R$)</span>
            <input inputMode="decimal" value={d.price} placeholder="49,90" onChange={e => onChange({ price: e.target.value })} />
          </label>
          {d.price && !Number.isNaN(parseBRL(d.price)) && parseBRL(d.price) != null && (
            <span className={styles.pricePreview}>{formatBRL(parseBRL(d.price)!)}</span>
          )}
        </div>
        <label className={styles.field}>
          <span>Descrição</span>
          <textarea rows={2} value={d.description} onChange={e => onChange({ description: e.target.value })} />
        </label>

        <div className={base.formActions}>
          <Button
            loading={saving}
            onClick={async () => {
              setSaving(true)
              await onSave()
              setSaving(false)
            }}
          >
            Salvar
          </Button>
          <Button variant="quiet" onClick={onRemove}>
            Descartar
          </Button>
        </div>
      </div>
    </li>
  )
}

import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type DragEvent, type FormEvent } from 'react'
import { api, uploadImage, type Gift, type GiftListData, type GiftListName } from '../../lib/api'
import { formatBRL, parseBRL } from '../../lib/money'
import { resizeImage } from '../../lib/resizeImage'
import { Button } from '../../design-system/components/Button'
import { Eyebrow } from '../../design-system/components/Ornaments'
import base from '../Painel.module.css'
import styles from './ImportarPanel.module.css'
import { priceInput, type CheckHandler, type Incoming, type Reply } from './loja'
import { PriceCheck } from './PriceCheck'

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
  /** Cômodo escolhido aqui. Sem escolha: o do item que vai ser preenchido. */
  room?: number | null
  saved?: string
}

const STORAGE = 'importar-fila'
const LIST_KEY = 'importar-lista'

/* ── Leitura do que veio da loja ─────────────────────────────────────── */
const STORE_SUFFIX = /\s*[|\-–]\s*(Shopee|Mercado ?Livre|Magazine ?Luiza|Magalu|Amazon|Americanas|Casas ?Bahia|KaBuM|Tok ?& ?Stok|Leroy ?Merlin|Tramontina|Camicado)\b.*$/i
const cleanTitle = (t: string) => t.replace(STORE_SUFFIX, '').replace(/\s+/g, ' ').trim()

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
  `javascript:(()=>{const q=s=>document.querySelector(s),m=n=>q('meta[property="'+n+'"],meta[name="'+n+'"]')?.content;let p={};try{for(const s of document.querySelectorAll('script[type="application/ld+json"]')){const j=JSON.parse(s.textContent);const a=[].concat(j['@graph']||j);const f=a.find(x=>x&&[].concat(x['@type']).includes('Product'));if(f){p=f;break}}}catch(e){}const o=[].concat(p.offers||[])[0]||{};let price=o.price||o.lowPrice||m('product:price:amount')||'';if(!price){const c=[...document.querySelectorAll('body *')].filter(e=>e.childElementCount===0&&/^\\s*R\\$\\s?\\d/.test(e.textContent)&&e.getBoundingClientRect().width>0).map(e=>[e.textContent,parseFloat(getComputedStyle(e).fontSize)]);c.sort((a,b)=>b[1]-a[1]);price=c[0]?c[0][0]:''}let img=[].concat(p.image||[])[0]||m('og:image')||'';if(typeof img==='object')img=img.url||'';if(!img){const i=[...document.images].filter(i=>i.naturalWidth>=250&&i.getBoundingClientRect().top<innerHeight*1.5).sort((a,b)=>b.naturalWidth*b.naturalHeight-a.naturalWidth*a.naturalHeight)[0];img=i?i.currentSrc||i.src:''}const d={url:location.href,title:(p.name||m('og:title')||document.title||q('h1')?.innerText||'').trim(),price:String(price),image:img};const O='${origin}';const toast=t=>{const b=document.createElement('div');b.textContent=t;b.style.cssText='position:fixed;z-index:2147483647;left:0;right:0;top:16px;margin:auto;width:max-content;background:#3a2a22;color:#fff;padding:10px 16px;border-radius:999px;font:600 14px system-ui;box-shadow:0 6px 20px rgba(0,0,0,.3)';document.body.appendChild(b);setTimeout(()=>b.remove(),2600)};const send=()=>window.open(O+'/painel/importar#add='+encodeURIComponent(JSON.stringify(d)),'et-lista');if(window.opener){let ok=0;const h=e=>{if(e.origin!==O)return;ok=1;toast(e.data==='et-wait'?'Confira no Painel: o preço mudou muito':e.data==='et-draft'?'✓ Enviado para o Painel':'✓ Preço conferido')};addEventListener('message',h);try{opener.postMessage({et:d},O)}catch(e){}setTimeout(()=>{removeEventListener('message',h);if(!ok)send()},700)}else send()})()`

export function ImportarPanel() {
  const [list, setList] = useState<GiftListName>(() => (localStorage.getItem(LIST_KEY) as GiftListName) || 'cha')
  const [data, setData] = useState<Record<GiftListName, GiftListData | null>>({ cha: null, casamento: null })
  const [drafts, setDrafts] = useState<Draft[]>(load)
  const [pasted, setPasted] = useState('')
  const [error, setError] = useState<string>()
  const [savingAll, setSavingAll] = useState(false)
  const linkRef = useRef<HTMLAnchorElement>(null)
  /** Conferência de preços ativa: recebe os produtos que chegam (devolve a resposta para a loja). */
  const checkRef = useRef<CheckHandler | null>(null)

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

  const registerCheck = useCallback((fn: CheckHandler | null) => {
    checkRef.current = fn
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
          },
          ...prev,
        ]
      })
    },
    [],
  )

  /** Produto que chegou do favorito: vai para a conferência de preços (se ativa) ou para a fila. */
  const receive = useCallback(
    (d: Incoming, from: MessageEventSource | null): Reply => {
      const r = checkRef.current?.(d, from)
      if (r) return r
      addDraft(d)
      return 'et-draft'
    },
    [addDraft],
  )

  // O favorito, numa aba de loja aberta por este painel, manda o produto por
  // mensagem (a pessoa continua na loja). Senão chega pelo endereço (#add=).
  useEffect(() => {
    window.name = 'et-lista'
    const onMessage = (e: MessageEvent) => {
      const d = (e.data as { et?: Incoming } | null)?.et
      if (!d || typeof d.url !== 'string' || !/^https?:\/\//.test(d.url)) return
      const reply = receive(d, e.source)
      ;(e.source as Window | null)?.postMessage(reply, e.origin)
    }
    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [receive])

  // Produto chegando do botão dos favoritos: #add={...}
  useEffect(() => {
    const read = () => {
      const m = location.hash.match(/^#add=(.+)$/)
      if (!m) return
      try {
        const d = JSON.parse(decodeURIComponent(m[1]))
        if (typeof d.url === 'string' && /^https?:\/\//.test(d.url)) receive(d, null)
      } catch {
        setError('Não consegui ler o produto. Tente clicar no botão de novo.')
      }
      history.replaceState(null, '', location.pathname)
      window.scrollTo({ top: 0 })
    }
    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [receive])

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

  const roomOf = (d: Draft, target: Gift | null) => (d.room !== undefined ? d.room : (target?.roomId ?? null))

  /** Foto: o servidor baixa da loja e guarda (o celular não precisa baixar nem reenviar). */
  const storeImage = async (url: string) => {
    try {
      return (await api<{ image: string }>('/admin/imagem-externa', { body: { url } })).image
    } catch {
      // Plano B: pelo navegador, como antes.
      const res = await fetch(`/api/admin/imagem-externa?url=${encodeURIComponent(url)}`, { credentials: 'same-origin' })
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? 'Não consegui baixar a foto.')
      const blob = await res.blob()
      return (await uploadImage(await resizeImage(new File([blob], 'foto', { type: blob.type })))).image
    }
  }

  const save = async (d: Draft) => {
    const priceCents = parseBRL(d.price)
    if (Number.isNaN(priceCents)) throw new Error('Valor inválido. Use só números, ex.: 49,90.')
    if (list === 'casamento' && priceCents == null) throw new Error('Na lista do casamento o valor é obrigatório (é o que o convidado paga).')
    const image = d.upload?.image ?? (d.imageUrl ? await storeImage(d.imageUrl) : undefined)
    const target = targetOf(d)
    const room = roomOf(d, target)
    const fill = {
      description: d.description.trim().slice(0, 600),
      priceCents,
      externalUrl: d.url,
      ...(priceCents != null ? { priceChecked: true } : {}),
      ...(image ? { image } : {}),
      ...(rooms.length && (!target || room !== target.roomId) ? { roomId: room } : {}),
    }
    // ?leve=1: o servidor devolve só o item salvo, não a lista inteira.
    const { gift } = target
      ? await api<{ gift: Gift }>(`/admin/presentes/${target.id}?leve=1`, { method: 'PATCH', body: fill })
      : await api<{ gift: Gift }>(`/admin/listas/${list}/presentes?leve=1`, {
          body: {
            ...fill,
            name: (d.name.trim() || shortName(d.title) || 'Presente').slice(0, 120),
            purchaseMode: list === 'cha' ? 'reserva' : 'site',
          },
        })
    setData(prev => {
      const cur = prev[list]!
      const gifts = cur.gifts.some(g => g.id === gift.id) ? cur.gifts.map(g => (g.id === gift.id ? gift : g)) : [...cur.gifts, gift]
      return { ...prev, [list]: { ...cur, gifts } }
    })
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

      {ready && (
        <PriceCheck
          gifts={gifts}
          onGift={g => setData(prev => ({ ...prev, [list]: { ...prev[list]!, gifts: prev[list]!.gifts.map(x => (x.id === g.id ? g : x)) } }))}
          register={registerCheck}
        />
      )}

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
            rooms={rooms}
            target={ready ? targetOf(d) : null}
            room={roomOf(d, ready ? targetOf(d) : null)}
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
  rooms,
  target,
  room,
  sameLink,
  onChange,
  onSave,
  onRemove,
  onError,
}: {
  draft: Draft
  rooms: { id: number; name: string }[]
  target: Gift | null
  room: number | null
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

  // Prévia direto do servidor de imagens da loja (miniatura na Shopee): leve.
  const preview = d.upload?.url ?? (d.imageUrl ? (/susercontent\.com\/file\/[^/?#@_]+$/.test(d.imageUrl) ? `${d.imageUrl}_tn` : d.imageUrl) : null)

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
        {preview ? <img src={preview} alt="" referrerPolicy="no-referrer" /> : <span>Sem foto</span>}
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
              Vai preencher <strong>{target.name}</strong> com descrição, valor, link e foto
              {rooms.length > 0 && room !== target.roomId ? ` e mudar o cômodo para “${rooms.find(r => r.id === room)?.name ?? 'Sem cômodo'}”` : ''}.
            </>
          ) : (
            <>Vai criar um item novo.</>
          )}
        </p>

        {rooms.length > 0 && (
          <label className={styles.field}>
            <span>Cômodo</span>
            <select value={room ?? ''} onChange={e => onChange({ room: e.target.value ? Number(e.target.value) : null })}>
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

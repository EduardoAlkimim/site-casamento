import { config } from './config.ts'

// Avisos por e-mail para os noivos (Resend). Nunca atrapalha a requisição:
// o envio roda em segundo plano e falhas só vão para o log.

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

type Row = [label: string, value: string | null | undefined]

export function layout(title: string, rows: Row[], quote?: string | null) {
  const lines = rows
    .filter(([, v]) => v)
    .map(
      ([k, v]) => `<tr>
        <td style="padding:10px 0;border-bottom:1px solid #EBE0CF;font:500 11px/1.4 Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:#6A5446;width:120px;vertical-align:top">${esc(k)}</td>
        <td style="padding:10px 0;border-bottom:1px solid #EBE0CF;font:17px/1.4 Georgia,serif;color:#3A2A22">${esc(v!)}</td>
      </tr>`,
    )
    .join('')
  const q = quote
    ? `<p style="margin:24px 0 0;padding-left:16px;border-left:2px solid #B08A45;font:italic 18px/1.5 Georgia,serif;color:#3A2A22;white-space:pre-line">“${esc(quote)}”</p>`
    : ''
  return `<!doctype html><html><body style="margin:0;background:#F6F0E6">
  <div style="max-width:520px;margin:0 auto;padding:32px 24px;background:#FBF8F2">
    <p style="margin:0 0 4px;font:500 11px/1.4 Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:#6A5446">Eduardo &amp; Thamires · aviso do site</p>
    <h1 style="margin:0 0 20px;font:400 28px/1.15 Georgia,serif;color:#3A2A22">${esc(title)}</h1>
    <table role="presentation" style="width:100%;border-collapse:collapse;border-top:1px solid #EBE0CF">${lines}</table>
    ${q}
    <p style="margin:28px 0 0"><a href="${config.publicSiteUrl}/painel" style="display:inline-block;padding:12px 22px;background:#74303A;color:#FBF8F2;text-decoration:none;font:500 12px/1 Arial,sans-serif;letter-spacing:.14em;text-transform:uppercase">Abrir o painel</a></p>
  </div></body></html>`
}

export const notifyEnabled = () => Boolean(config.resendApiKey && config.notifyTo.length)

export function notify(subject: string, title: string, rows: Row[], quote?: string | null): void {
  if (!notifyEnabled()) return
  void (async () => {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.resendApiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: config.notifyFrom, to: config.notifyTo, subject, html: layout(title, rows, quote) }),
        signal: AbortSignal.timeout(15_000),
      })
      if (!res.ok) console.error(`resend: ${res.status} ${await res.text().catch(() => '')}`)
    } catch (err) {
      console.error('resend: falha ao enviar aviso', err)
    }
  })()
}

export const brl = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

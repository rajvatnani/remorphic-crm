// Email through Resend (https://resend.com). Skipped, without error, unless
// RESEND_API_KEY and RESEND_FROM are set. Never log addresses or bodies.

export function emailConfigured() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM)
}

export async function sendEmail(to: string, subject: string, html: string, text: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY
  const from = process.env.RESEND_FROM
  if (!apiKey || !from || !to) return false
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html, text }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) console.error('[Email] Failed. Status:', res.status)
    return res.ok
  } catch {
    console.error('[Email] Failed to reach Resend')
    return false
  }
}

export function escapeHtml(s: string) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

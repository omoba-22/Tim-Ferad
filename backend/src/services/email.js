import { env } from '../config/env.js'

// An error that tells the outbox whether retrying could ever help.
export class EmailError extends Error {
  constructor(message, { retryable }) {
    super(message)
    this.name = 'EmailError'
    this.retryable = retryable
  }
}

// Sends one email through Resend.
// idempotencyKey: Resend ignores a repeat of the same key, so a retry after a
// network timeout cannot send the customer two emails.
export async function sendEmail({ to, subject, html, text, idempotencyKey }) {
  if (!env.RESEND_API_KEY) {
    // Not retryable-forever: once the key is added, the next run will work.
    throw new EmailError('RESEND_API_KEY is not set', { retryable: true })
  }

  let res
  try {
    res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      body: JSON.stringify({ from: env.EMAIL_FROM, to: [to], subject, html, text }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch (err) {
    // Network failure or timeout: worth retrying.
    throw new EmailError(`Could not reach Resend: ${err.message}`, { retryable: true })
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const detail = body.message || res.statusText
    // 429 (too many requests) and 5xx are temporary. Other 4xx errors
    // (bad address, bad sender) will fail every time.
    const retryable = res.status === 429 || res.status >= 500
    throw new EmailError(`Resend error ${res.status}: ${detail}`, { retryable })
  }

  const data = await res.json()
  return data.id
}
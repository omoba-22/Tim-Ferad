import { env } from '../config/env.js'

const BASE_URL = 'https://api.paystack.co'

// Talks to Paystack. The secret key is only ever sent from here.
async function call(path, options = {}) {
  let res
  try {
    res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    })
  } catch (err) {
    throw new Error(`Paystack request failed: ${err.name} ${err.cause?.code ?? ''}`.trim())
  }

  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.status) {
    throw new Error(`Paystack error (HTTP ${res.status}): ${body?.message ?? 'no message'}`)
  }
  return body.data
}

// Amount is in kobo. Returns { authorization_url, access_code, reference }.
export function initializeTransaction({ email, amountKobo, reference, callbackUrl, metadata }) {
  return call('/transaction/initialize', {
    method: 'POST',
    body: JSON.stringify({
      email,
      amount: amountKobo,
      currency: 'NGN',
      reference,
      callback_url: callbackUrl,
      metadata,
    }),
  })
}

// Asks Paystack what really happened to this payment.
export function verifyTransaction(reference) {
  return call(`/transaction/verify/${encodeURIComponent(reference)}`)
}
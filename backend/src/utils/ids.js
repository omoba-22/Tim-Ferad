import { randomBytes, createHash, createHmac, timingSafeEqual } from 'node:crypto'

// Unambiguous letters and digits (no 0/O or 1/I) so references are easy to read out
const ALPHABET = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'

// Random, not sequential, so references cannot be guessed.
export function newBookingReference() {
  const chars = [...randomBytes(10)].map((b) => ALPHABET[b % ALPHABET.length])
  return `TF-${chars.join('')}`
}

export function newPaystackReference() {
  return `tf_${randomBytes(16).toString('hex')}`
}

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex')
}

// The customer's private access token for a booking. It is derived from the
// booking reference with a server-only secret, so it cannot be guessed, and a
// repeated request can return the same token without us storing it.
export function deriveAccessToken(reference, secret) {
  return createHmac('sha256', secret).update(`booking:${reference}`).digest('base64url')
}

// Kept for the earlier test scripts.
export function newAccessToken() {
  const token = randomBytes(24).toString('base64url')
  return { token, hash: hashToken(token) }
}

export function tokenMatches(token, storedHash) {
  const a = Buffer.from(hashToken(token), 'hex')
  const b = Buffer.from(storedHash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}
export function newDeliveryReference() {
  const chars = [...randomBytes(10)].map((b) => ALPHABET[b % ALPHABET.length])
  return `DL-${chars.join('')}`
}

// Different prefix from bookings, so a booking token can never open a delivery order
export function deriveDeliveryToken(reference, secret) {
  return createHmac('sha256', secret).update(`delivery:${reference}`).digest('base64url')
}
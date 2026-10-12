import { randomBytes, createHash } from 'node:crypto'

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

// The token goes to the customer; only its hash is stored in the database.
export function newAccessToken() {
  const token = randomBytes(24).toString('base64url')
  const hash = createHash('sha256').update(token).digest('hex')
  return { token, hash }
}
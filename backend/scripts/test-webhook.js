// Tests the Paystack webhook using signed requests we build ourselves.
// 1. Start the server in another terminal:  npm run dev
// 2. Run from the backend folder:
//      node --env-file=.env scripts/test-webhook.js
import readline from 'node:readline/promises'
import { randomUUID, createHmac } from 'node:crypto'
import { supabase } from '../src/db/supabase.js'

const API = 'http://localhost:3000/api'
const TEST_EMAIL = 'test-webhook@example.com'
let failures = 0

function check(label, condition) {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}`)
  if (!condition) failures++
}

async function cleanup() {
  await supabase.from('notifications').delete().eq('recipient_email', TEST_EMAIL)
  const { data } = await supabase.from('bookings').select('id').eq('contact_email', TEST_EMAIL)
  const ids = (data ?? []).map((b) => b.id)
  if (ids.length) {
    const { data: pays } = await supabase.from('payments').select('paystack_reference').in('booking_id', ids)
    const refs = (pays ?? []).map((p) => p.paystack_reference)
    if (refs.length) await supabase.from('payment_events').delete().in('reference', refs)
    await supabase.from('payments').delete().in('booking_id', ids)
    await supabase.from('bookings').delete().in('id', ids)
  }
}

const sign = (body) => createHmac('sha512', process.env.PAYSTACK_SECRET_KEY).update(body).digest('hex')

async function sendWebhook(bodyObject, { signature } = {}) {
  const body = JSON.stringify(bodyObject)
  const headers = { 'Content-Type': 'application/json' }
  const sig = signature === undefined ? sign(body) : signature
  if (sig !== null) headers['x-paystack-signature'] = sig
  const res = await fetch(`${API}/webhooks/paystack`, { method: 'POST', headers, body })
  return { status: res.status, body: await res.json().catch(() => null) }
}

const { data: trip } = await supabase.from('trips').select('id')
  .like('departure_point', 'TEST%').limit(1).maybeSingle()
if (!trip) {
  console.error('No test trip found. Run supabase/dev/test-trip.sql first.')
  process.exit(1)
}

await cleanup()

// Create a real booking and a real Paystack test payment link
const created = await fetch(`${API}/bookings`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tripId: trip.id,
    passengers: [{ fullName: 'Webhook Tester' }],
    email: TEST_EMAIL,
    phone: '08000000000',
    idempotencyKey: randomUUID().replaceAll('-', ''),
  }),
})
const booking = await created.json()
if (created.status !== 201) {
  console.error('Could not create booking:', booking)
  process.exit(1)
}

const { data: bookingRow } = await supabase.from('bookings').select('id').eq('reference', booking.reference).single()
const { data: paymentRow } = await supabase.from('payments').select('paystack_reference, amount_kobo').eq('booking_id', bookingRow.id).single()
const ref = paymentRow.paystack_reference

console.log('\n----------------------------------------------------------')
console.log('Pay on this link with the Paystack TEST card, then come back:')
console.log(booking.authorizationUrl)
console.log('Test card: 4084 0840 8408 4081, any future expiry, CVV 408.')
console.log('Do NOT call any verify page. The webhook must do the confirming.')
console.log('----------------------------------------------------------\n')

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
await rl.question('Press Enter AFTER the payment succeeds... ')
rl.close()

const statusOf = async () =>
  (await supabase.from('bookings').select('status').eq('id', bookingRow.id).single()).data.status
const emailCount = async () =>
  (await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('recipient_email', TEST_EMAIL)).count

const fakeId = Date.now()
const event = {
  event: 'charge.success',
  data: { id: fakeId, reference: ref, amount: paymentRow.amount_kobo, currency: 'NGN', status: 'success' },
}

check('before any webhook: booking is still pending (nothing verified it)', (await statusOf()) === 'pending_payment')

// Security
check('no signature is rejected (401)', (await sendWebhook(event, { signature: null })).status === 401)
check('wrong signature is rejected (401)', (await sendWebhook(event, { signature: 'abc123' })).status === 401)
check('a forged request did NOT confirm the booking', (await statusOf()) === 'pending_payment')

// Unrelated events and references are acknowledged but ignored
check('other event types are ignored (200)',
  (await sendWebhook({ event: 'transfer.success', data: { reference: ref } })).status === 200)
check('unknown reference is ignored (200)',
  (await sendWebhook({ event: 'charge.success', data: { id: 1, reference: 'tf_unknown', amount: 1, currency: 'NGN' } })).status === 200)
check('still pending after those', (await statusOf()) === 'pending_payment')

// The real thing
const first = await sendWebhook(event)
check('signed charge.success is accepted (200)', first.status === 200)
check('booking is now confirmed by the webhook alone', (await statusOf()) === 'confirmed')
check('one ticket email queued', (await emailCount()) === 1)

// Duplicates
const second = await sendWebhook(event)
check('same event again is a harmless duplicate (200)', second.status === 200 && second.body.duplicate === true)

const [r1, r2, r3] = await Promise.all([sendWebhook(event), sendWebhook(event), sendWebhook(event)])
check('three simultaneous duplicates all return 200', [r1, r2, r3].every((r) => r.status === 200))
check('still exactly one ticket email', (await emailCount()) === 1)

const { count: eventRows } = await supabase.from('payment_events')
  .select('id', { count: 'exact', head: true }).eq('reference', ref)
check('only one event row recorded', eventRows === 1)

await cleanup()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
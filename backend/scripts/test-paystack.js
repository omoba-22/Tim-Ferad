// End-to-end test with Paystack TEST mode. No real money.
// 1. Start the server in another terminal:  npm run dev
// 2. Run this from the backend folder:
//      node --env-file=.env scripts/test-paystack.js
import readline from 'node:readline/promises'
import { randomUUID } from 'node:crypto'
import { supabase } from '../src/db/supabase.js'

const API = 'http://localhost:3000/api'
const TEST_EMAIL = 'test-paystack@example.com'
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
    await supabase.from('payments').delete().in('booking_id', ids)
    await supabase.from('bookings').delete().in('id', ids)
  }
}

const call = async (path, options = {}) => {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers ?? {}) },
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

const { data: trip } = await supabase.from('trips').select('id')
  .like('departure_point', 'TEST%').limit(1).maybeSingle()
if (!trip) {
  console.error('No test trip found. Run supabase/dev/test-trip.sql first.')
  process.exit(1)
}

await cleanup()

const key = randomUUID().replaceAll('-', '')
const payload = {
  tripId: trip.id,
  passengers: [{ fullName: 'Test Passenger' }],
  email: TEST_EMAIL,
  phone: '08000000000',
  idempotencyKey: key,
}

// Bad input is rejected
check('extra field (price) is rejected',
  (await call('/bookings', { method: 'POST', body: JSON.stringify({ ...payload, idempotencyKey: randomUUID().replaceAll('-', ''), totalKobo: 1 }) })).status === 400)

// Create the booking
const created = await call('/bookings', { method: 'POST', body: JSON.stringify(payload) })
check('booking created (201)', created.status === 201)
if (created.status !== 201) {
  console.error(created.body)
  process.exit(1)
}
const { reference, accessToken, authorizationUrl, totalKobo } = created.body
check('amount comes from the database (100000 kobo)', totalKobo === 100000)

// Double submit
const again = await call('/bookings', { method: 'POST', body: JSON.stringify(payload) })
check('same idempotency key returns the same booking and link',
  again.status === 201 && again.body.reference === reference && again.body.authorizationUrl === authorizationUrl)

// Not paid yet
const early = await call(`/bookings/${reference}/verify`, { method: 'POST', headers: { 'x-booking-token': accessToken } })
check('verify before paying: booking is NOT confirmed', early.status === 200 && early.body.bookingStatus === 'pending_payment')

console.log('\n----------------------------------------------------------')
console.log('Open this link in your browser and pay with a Paystack TEST card:')
console.log(authorizationUrl)
console.log('\nTest card: 4084 0840 8408 4081, any future expiry date, CVV 408.')
console.log('If Paystack asks for a PIN or OTP, use the test values on its checkout screen')
console.log('or in the Paystack test-cards docs.')
console.log('After paying, the browser may show a page-not-found. That is expected for now.')
console.log('----------------------------------------------------------\n')

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
await rl.question('Press Enter AFTER the payment succeeds... ')
rl.close()

// Wrong or missing token
check('wrong token is rejected (404)',
  (await call(`/bookings/${reference}/verify`, { method: 'POST', headers: { 'x-booking-token': 'wrong' } })).status === 404)
check('missing token is rejected (404)',
  (await call(`/bookings/${reference}/verify`, { method: 'POST' })).status === 404)

// Real verification
const verified = await call(`/bookings/${reference}/verify`, { method: 'POST', headers: { 'x-booking-token': accessToken } })
check('after paying: booking is confirmed',
  verified.status === 200 && verified.body.bookingStatus === 'confirmed' && verified.body.paymentStatus === 'succeeded')

// Verifying again must not duplicate anything
await call(`/bookings/${reference}/verify`, { method: 'POST', headers: { 'x-booking-token': accessToken } })
const { count } = await supabase.from('notifications')
  .select('id', { count: 'exact', head: true }).eq('recipient_email', TEST_EMAIL)
check('verifying twice still queues exactly one ticket email', count === 1)

const status = await call(`/bookings/${reference}/status`, { headers: { 'x-booking-token': accessToken } })
check('status endpoint agrees', status.status === 200 && status.body.bookingStatus === 'confirmed')

await cleanup()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
// Tests tickets. Start the server first (node --env-file=.env src/server.js),
// then from the backend folder:  node --env-file=.env scripts/test-ticket.js
// It saves a sample PDF to backend/test-output/ticket.pdf so you can look at it.
import fs from 'node:fs'
import { supabase } from '../src/db/supabase.js'
import {
  newBookingReference, newPaystackReference, deriveAccessToken, hashToken,
} from '../src/utils/ids.js'

const API = 'http://localhost:3000/api'
const TEST_EMAIL = 'test-ticket@example.com'
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

const { data: trip } = await supabase.from('trips').select('id')
  .like('departure_point', 'TEST%').limit(1).maybeSingle()
if (!trip) {
  console.error('No test trip found. Run supabase/dev/test-trip.sql first.')
  process.exit(1)
}

async function makeBooking(names) {
  const reference = newBookingReference()
  const token = deriveAccessToken(reference, process.env.ACCESS_TOKEN_SECRET)
  const paystackReference = newPaystackReference()
  const { data, error } = await supabase.rpc('create_booking', {
    p_trip_id: trip.id,
    p_passenger_names: names,
    p_contact_email: TEST_EMAIL,
    p_contact_phone: '08000000000',
    p_reference: reference,
    p_access_token_hash: hashToken(token),
    p_paystack_reference: paystackReference,
  })
  if (error) throw new Error(error.message)
  return { reference, token, paystackReference, total: data.total_kobo }
}

const get = (path, token) =>
  fetch(`${API}${path}${token ? `?t=${encodeURIComponent(token)}` : ''}`)

await cleanup()

const a = await makeBooking(['Ọlaoluwa Ṣẹyẹ Adéwálé', 'Chukwuemeka Ụzọ Nwosu', 'Ɗanladi Ƙasim'])
const b = await makeBooking(['Other Customer'])

// Not paid yet
check('unpaid booking has no ticket (409)', (await get(`/tickets/${a.reference}`, a.token)).status === 409)

// Pay booking A (simulated here; Paystack was tested separately)
const { error } = await supabase.rpc('confirm_payment', {
  p_paystack_reference: a.paystackReference,
  p_amount_kobo: a.total,
  p_currency: 'NGN',
})
if (error) throw new Error(error.message)

// Access control
check('no token is rejected (404)', (await get(`/tickets/${a.reference}`)).status === 404)
check('wrong token is rejected (404)', (await get(`/tickets/${a.reference}`, 'wrong')).status === 404)
check("another customer's token is rejected (404)", (await get(`/tickets/${a.reference}`, b.token)).status === 404)
check('made-up reference is rejected (404)', (await get('/tickets/TF-AAAAAAAAAA', a.token)).status === 404)
check('PDF without token is rejected (404)', (await get(`/tickets/${a.reference}/pdf`)).status === 404)

// The real thing
const res = await get(`/tickets/${a.reference}`, a.token)
const body = await res.json()
check('correct token returns the ticket (200)', res.status === 200)
check('ticket lists both passengers', body.ticket?.passengers?.length === 2)
check('ticket has no contact details', !JSON.stringify(body).includes(TEST_EMAIL))
check('ticket response is not cacheable', res.headers.get('cache-control') === 'no-store')

const pdf = await get(`/tickets/${a.reference}/pdf`, a.token)
const bytes = Buffer.from(await pdf.arrayBuffer())
check('PDF returned (200, application/pdf)', pdf.status === 200 && pdf.headers.get('content-type') === 'application/pdf')
check('PDF file is valid', bytes.subarray(0, 4).toString() === '%PDF' && bytes.length > 1500)

fs.mkdirSync('test-output', { recursive: true })
fs.writeFileSync('test-output/ticket.pdf', bytes)
console.log('\nSample ticket saved to backend/test-output/ticket.pdf. Open it and have a look.')

await cleanup()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
// Tries to oversell the test trip. Run from the backend folder:
//   node --env-file=.env scripts/test-reservation.js
import { supabase } from '../src/db/supabase.js'
import { newBookingReference, newPaystackReference, newAccessToken } from '../src/utils/ids.js'

const TEST_EMAIL = 'test-reservation@example.com'
let failures = 0

function check(label, condition) {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}`)
  if (!condition) failures++
}

async function cleanup(tripId) {
  const { data } = await supabase.from('bookings').select('id')
    .eq('trip_id', tripId).eq('contact_email', TEST_EMAIL)
  const ids = (data ?? []).map((b) => b.id)
  if (ids.length) {
    await supabase.from('payments').delete().in('booking_id', ids)
    await supabase.from('bookings').delete().in('id', ids)
  }
}

async function attempt(tripId, names, idempotencyKey = null) {
  const { data, error } = await supabase.rpc('create_booking', {
    p_trip_id: tripId,
    p_passenger_names: names,
    p_contact_email: TEST_EMAIL,
    p_contact_phone: '08000000000',
    p_reference: newBookingReference(),
    p_access_token_hash: newAccessToken().hash,
    p_paystack_reference: newPaystackReference(),
    p_idempotency_key: idempotencyKey,
  })
  return { ok: !error, message: error?.message, data }
}

const { data: trip } = await supabase.from('trips').select('id, capacity')
  .like('departure_point', 'TEST%').limit(1).maybeSingle()
if (!trip) {
  console.error('No test trip found. Run supabase/dev/test-trip.sql first.')
  process.exit(1)
}
const cap = trip.capacity
console.log(`Test trip capacity: ${cap}\n`)

// Test 1: many people book 1 place at the same instant
await cleanup(trip.id)
const results = await Promise.all(
  Array.from({ length: cap + 3 }, (_, i) => attempt(trip.id, [`Test Person ${i}`]))
)
const won = results.filter((r) => r.ok).length
const lost = results.filter((r) => r.message === 'not_enough_places').length
check(`${cap + 3} simultaneous bookings: exactly ${cap} succeed (got ${won})`, won === cap)
check(`the other 3 are rejected with not_enough_places (got ${lost})`, lost === 3)

// Test 2: multi-passenger bookings reserve every place
await cleanup(trip.id)
const names = (n) => Array.from({ length: n }, (_, i) => `Test Person ${i}`)
check(`booking ${cap - 1} passengers at once succeeds`, (await attempt(trip.id, names(cap - 1))).ok)
check('then a 2-passenger booking is rejected', (await attempt(trip.id, names(2))).message === 'not_enough_places')
check('then 1 more passenger fits', (await attempt(trip.id, names(1))).ok)
check('then the trip is full', (await attempt(trip.id, names(1))).message === 'not_enough_places')

// Test 3: double submission with the same key makes ONE booking
await cleanup(trip.id)
const key = `test-key-${Date.now()}`
const first = await attempt(trip.id, names(1), key)
const second = await attempt(trip.id, names(1), key)
check('same idempotency key returns the original booking',
  first.ok && second.ok && second.data.already_existed === true &&
  second.data.booking_id === first.data.booking_id)

// Test 4: bad input is rejected
check('empty passenger name is rejected', (await attempt(trip.id, [''])).message === 'invalid_passenger_name')
check('zero passengers is rejected', (await attempt(trip.id, [])).message === 'invalid_passenger_count')

await cleanup(trip.id)
console.log(failures === 0 ? '\nAll tests passed.' : `\n${failures} test(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
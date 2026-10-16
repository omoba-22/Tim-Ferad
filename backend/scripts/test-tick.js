// Tests the cleanup job. Start the server first (node --env-file=.env src/server.js),
// then from the backend folder:  node --env-file=.env scripts/test-tick.js
import { supabase } from '../src/db/supabase.js'
import { newBookingReference, newPaystackReference, newAccessToken } from '../src/utils/ids.js'

const API = 'http://localhost:3000/api'
const TEST_EMAIL = 'test-tick@example.com'
let failures = 0

function check(label, condition) {
  console.log(`${condition ? 'PASS' : 'FAIL'}  ${label}`)
  if (!condition) failures++
}

async function cleanup() {
  const { data } = await supabase.from('bookings').select('id').eq('contact_email', TEST_EMAIL)
  const ids = (data ?? []).map((b) => b.id)
  if (ids.length) {
    await supabase.from('payments').delete().in('booking_id', ids)
    await supabase.from('bookings').delete().in('id', ids)
  }
}

const tick = (secret) =>
  fetch(`${API}/internal/tick`, {
    method: 'POST',
    headers: secret === null ? {} : { 'x-cron-secret': secret },
  })

const { data: trip } = await supabase.from('trips').select('id')
  .like('departure_point', 'TEST%').limit(1).maybeSingle()
if (!trip) {
  console.error('No test trip found. Run supabase/dev/test-trip.sql first.')
  process.exit(1)
}

await cleanup()

// Access control
check('no secret is rejected (401)', (await tick(null)).status === 401)
check('wrong secret is rejected (401)', (await tick('wrong')).status === 401)

// A booking that is unpaid and past its deadline
const { data: created, error } = await supabase.rpc('create_booking', {
  p_trip_id: trip.id,
  p_passenger_names: ['Tick Tester', 'Tick Tester Two'],
  p_contact_email: TEST_EMAIL,
  p_contact_phone: '08000000000',
  p_reference: newBookingReference(),
  p_access_token_hash: newAccessToken().hash,
  p_paystack_reference: newPaystackReference(),
})
if (error) {
  console.error('Could not create test booking:', error.message)
  process.exit(1)
}
await supabase.from('bookings').update({
  created_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
  expires_at: new Date(Date.now() - 60 * 1000).toISOString(),
}).eq('id', created.booking_id)

const res = await tick(process.env.CRON_SECRET)
const body = await res.json()
check('correct secret runs the job (200)', res.status === 200)
check('job reports at least one expired booking', body.expired >= 1)
check('job survives a payment Paystack does not know (errors counted, not crashed)', typeof body.errors === 'number')

const { data: row } = await supabase.from('bookings').select('status').eq('id', created.booking_id).single()
check('the unpaid booking is now expired', row.status === 'expired')

const { data: held } = await supabase.rpc('trip_held_places', { p_trip_id: trip.id })
check('its places are free again', held === 0)

await cleanup()
console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
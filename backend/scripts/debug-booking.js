// Runs the booking logic directly (no web server), so any error shows in full.
// From the backend folder:  node --env-file=.env scripts/debug-booking.js
import { randomUUID } from 'node:crypto'
import { supabase } from '../src/db/supabase.js'
import { createBooking } from '../src/services/bookings.js'

const EMAIL = 'test-paystack@example.com'

async function cleanup() {
  const { data } = await supabase.from('bookings').select('id').eq('contact_email', EMAIL)
  const ids = (data ?? []).map((b) => b.id)
  if (ids.length) {
    await supabase.from('payments').delete().in('booking_id', ids)
    await supabase.from('bookings').delete().in('id', ids)
  }
}

const { data: trip } = await supabase.from('trips').select('id')
  .like('departure_point', 'TEST%').limit(1).maybeSingle()
if (!trip) {
  console.error('No test trip found.')
  process.exit(1)
}

await cleanup()
console.log('Creating booking and starting Paystack payment...')
const started = Date.now()
try {
  const r = await createBooking({
    tripId: trip.id,
    passengers: [{ fullName: 'Debug Person' }],
    email: EMAIL,
    phone: '08000000000',
    idempotencyKey: randomUUID().replaceAll('-', ''),
  })
  console.log(`OK after ${Date.now() - started} ms`)
  console.log('Reference:', r.reference)
  console.log('Amount (kobo):', r.totalKobo)
  console.log('Paystack link:', r.authorizationUrl)
} catch (err) {
  console.error(`FAILED after ${Date.now() - started} ms:`, err)
}
await cleanup()
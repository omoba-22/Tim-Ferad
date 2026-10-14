// Tests the payment confirmation logic. No Paystack involved.
// Run from the backend folder:
//   node --env-file=.env scripts/test-payments.js
import { supabase } from '../src/db/supabase.js'
import { newBookingReference, newPaystackReference, newAccessToken } from '../src/utils/ids.js'

const TEST_EMAIL = 'test-payments@example.com'
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

const { data: trip } = await supabase.from('trips').select('id, capacity')
  .like('departure_point', 'TEST%').limit(1).maybeSingle()
if (!trip) {
  console.error('No test trip found. Run supabase/dev/test-trip.sql first.')
  process.exit(1)
}
const cap = trip.capacity

async function newBooking(passengers = 1) {
  const ref = newPaystackReference()
  const { data, error } = await supabase.rpc('create_booking', {
    p_trip_id: trip.id,
    p_passenger_names: Array.from({ length: passengers }, (_, i) => `Test Person ${i}`),
    p_contact_email: TEST_EMAIL,
    p_contact_phone: '08000000000',
    p_reference: newBookingReference(),
    p_access_token_hash: newAccessToken().hash,
    p_paystack_reference: ref,
  })
  if (error) throw new Error(`create_booking failed: ${error.message}`)
  return { bookingId: data.booking_id, ref, total: data.total_kobo }
}

async function confirm(ref, amount, currency = 'NGN') {
  const { data, error } = await supabase.rpc('confirm_payment', {
    p_paystack_reference: ref,
    p_amount_kobo: amount,
    p_currency: currency,
    p_transaction_id: 'test-txn',
    p_paid_at: new Date().toISOString(),
    p_verify_response: { test: true },
  })
  if (error) throw new Error(`confirm_payment failed: ${error.message}`)
  return data
}

const bookingStatus = async (id) =>
  (await supabase.from('bookings').select('status').eq('id', id).single()).data.status
const paymentRow = async (ref) =>
  (await supabase.from('payments').select('status, exception_reason').eq('paystack_reference', ref).single()).data
const notificationCount = async (bookingId) =>
  (await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('booking_id', bookingId)).count

async function expireNow(bookingId) {
  await supabase.from('bookings')
    .update({ status: 'expired', expires_at: new Date(Date.now() - 60000).toISOString() })
    .eq('id', bookingId)
}

await cleanup()

// 1. Normal payment
{
  const b = await newBooking(2)
  const r = await confirm(b.ref, b.total)
  check('normal payment: outcome is confirmed', r.outcome === 'confirmed')
  check('normal payment: booking is confirmed', (await bookingStatus(b.bookingId)) === 'confirmed')
  check('normal payment: payment is succeeded', (await paymentRow(b.ref)).status === 'succeeded')
  check('normal payment: one ticket email queued', (await notificationCount(b.bookingId)) === 1)

  // 2. Same payment reported again
  const again = await confirm(b.ref, b.total)
  check('duplicate report: outcome is already_processed', again.outcome === 'already_processed')
  check('duplicate report: still only one email queued', (await notificationCount(b.bookingId)) === 1)
}
await cleanup()

// 3. Wrong amount
{
  const b = await newBooking(1)
  const r = await confirm(b.ref, b.total - 100)
  check('wrong amount: flagged as exception', r.outcome === 'exception' && r.reason === 'amount_mismatch')
  check('wrong amount: booking NOT confirmed', (await bookingStatus(b.bookingId)) === 'pending_payment')
  check('wrong amount: payment marked refund_required', (await paymentRow(b.ref)).status === 'refund_required')
}
await cleanup()

// 4. Wrong currency
{
  const b = await newBooking(1)
  const r = await confirm(b.ref, b.total, 'USD')
  check('wrong currency: flagged, not confirmed', r.outcome === 'exception' && (await bookingStatus(b.bookingId)) === 'pending_payment')
}
await cleanup()

// 5. Unknown reference
{
  const r = await confirm('tf_does_not_exist', 100000)
  check('unknown reference: outcome is unknown_reference', r.outcome === 'unknown_reference')
}

// 6. Customer paid twice for the same booking
{
  const b = await newBooking(1)
  await confirm(b.ref, b.total)
  const second = newPaystackReference()
  await supabase.from('payments').insert({ booking_id: b.bookingId, paystack_reference: second, amount_kobo: b.total })
  const r = await confirm(second, b.total)
  check('double payment: second flagged as duplicate_payment', r.outcome === 'exception' && r.reason === 'duplicate_payment')
  check('double payment: booking still confirmed', (await bookingStatus(b.bookingId)) === 'confirmed')
  check('double payment: first payment still succeeded', (await paymentRow(b.ref)).status === 'succeeded')
}
await cleanup()

// 7. Late payment, places still free
{
  const b = await newBooking(1)
  await expireNow(b.bookingId)
  const r = await confirm(b.ref, b.total)
  check('late payment, seats free: booking restored', r.outcome === 'confirmed' && r.late === true)
  check('late payment, seats free: booking is confirmed', (await bookingStatus(b.bookingId)) === 'confirmed')
}
await cleanup()

// 8. Late payment, places taken by someone else
{
  const late = await newBooking(1)
  await expireNow(late.bookingId)
  await newBooking(cap)   // someone else now holds every place
  const r = await confirm(late.ref, late.total)
  check('late payment, trip full: flagged late_payment_no_capacity', r.outcome === 'exception' && r.reason === 'late_payment_no_capacity')
  check('late payment, trip full: booking stays expired', (await bookingStatus(late.bookingId)) === 'expired')
  check('late payment, trip full: payment marked refund_required', (await paymentRow(late.ref)).status === 'refund_required')
}
await cleanup()

// 9. Expiry sweep
{
  const b = await newBooking(1)
  await supabase.from('bookings').update({ expires_at: new Date(Date.now() - 60000).toISOString() }).eq('id', b.bookingId)
  const { data: n } = await supabase.rpc('expire_stale_bookings')
  check('expiry sweep: expires at least one booking', n >= 1)
  check('expiry sweep: booking is now expired', (await bookingStatus(b.bookingId)) === 'expired')
}
await cleanup()

// 10. Releasing a booking frees its places
{
  const b = await newBooking(cap)
  const { data: heldBefore } = await supabase.rpc('trip_held_places', { p_trip_id: trip.id })
  await supabase.rpc('release_booking', { p_booking_id: b.bookingId, p_reason: 'test' })
  const { data: heldAfter } = await supabase.rpc('trip_held_places', { p_trip_id: trip.id })
  check(`release: places held went from ${heldBefore} to ${heldAfter}`, heldBefore === cap && heldAfter === 0)
}
await cleanup()

// 11. Two confirmations at the same instant
{
  const b = await newBooking(2)
  const [r1, r2] = await Promise.all([confirm(b.ref, b.total), confirm(b.ref, b.total)])
  const outcomes = [r1.outcome, r2.outcome].sort().join(',')
  check('simultaneous confirmations: one confirmed, one already_processed', outcomes === 'already_processed,confirmed')
  check('simultaneous confirmations: exactly one email queued', (await notificationCount(b.bookingId)) === 1)
}
await cleanup()

console.log(failures === 0 ? '\nAll tests passed.' : `\n${failures} test(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
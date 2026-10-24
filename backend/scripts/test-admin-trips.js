import { randomBytes } from 'node:crypto'
import { supabase } from '../src/db/supabase.js'
import { env } from '../src/config/env.js'

const base = `http://localhost:${env.PORT}/api`
let failed = 0
const check = (name, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) failed++
}

// A time far from your real test trip, 60 days ahead at 03:17 Lagos time
const day = new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10)
const departureAt = new Date(`${day}T03:17:00+01:00`).toISOString()

async function removeBookings(tripId) {
  const { data: bookings } = await supabase.from('bookings').select('id').eq('trip_id', tripId)
  const ids = (bookings ?? []).map((b) => b.id)
  if (ids.length === 0) return
  const { data: pays } = await supabase.from('payments').select('paystack_reference').in('booking_id', ids)
  const refs = (pays ?? []).map((p) => p.paystack_reference)
  if (refs.length > 0) await supabase.from('payment_events').delete().in('reference', refs)
  await supabase.from('payments').delete().in('booking_id', ids)
  await supabase.from('booking_passengers').delete().in('booking_id', ids)
  await supabase.from('notifications').delete().in('booking_id', ids)
  await supabase.from('bookings').delete().in('id', ids)
}

let tripId = null
try {
  const { data: route } = await supabase.from('routes').select('id')
    .eq('origin_city', 'Lagos').eq('destination_city', 'Ibadan').eq('is_active', true).limit(1).single()
  const { data: vehicle } = await supabase.from('vehicles').select('id, passenger_capacity')
    .eq('is_active', true).limit(1).single()

  const args = {
    p_actor_id: null,
    p_route_id: route.id,
    p_vehicle_id: vehicle.id,
    p_departure_at: departureAt,
    p_fare_kobo: 123400,
    p_departure_point: 'TEST ADMIN TRIP',
  }

  // 1. Create
  const created = await supabase.rpc('create_trip', args)
  tripId = created.data
  check('trip is created', !created.error && Boolean(tripId))

  const { data: trip } = await supabase.from('trips').select('*').eq('id', tripId).single()
  check('trip starts as published', trip.status === 'published')
  check('capacity is copied from the vehicle', trip.capacity === vehicle.passenger_capacity)
  check('fare is stored in kobo', trip.fare_kobo === 123400)

  const { data: listed } = await supabase.rpc('list_available_trips', { p_route_id: route.id, p_date: day })
  check('customers can find the new trip', (listed ?? []).some((t) => t.trip_id === tripId))

  const { data: audit } = await supabase.from('audit_events').select('id')
    .eq('entity_id', tripId).eq('action', 'trip.create')
  check('creation is recorded in the audit log', audit.length === 1)

  // 2. Rules
  const duplicate = await supabase.rpc('create_trip', args)
  check('same vehicle and time is refused (23505)', duplicate.error?.code === '23505')

  const past = await supabase.rpc('create_trip', { ...args, p_departure_at: '2020-01-01T09:00:00+01:00' })
  check('a departure in the past is refused', past.error?.message === 'departure_in_past')

  const badVehicle = await supabase.rpc('create_trip', { ...args, p_vehicle_id: crypto.randomUUID() })
  check('an unknown vehicle is refused', badVehicle.error?.message === 'vehicle_not_available')

  // 3. A trip with a held place cannot be cancelled
  const booking = await fetch(`${base}/bookings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tripId,
      passengers: [{ fullName: 'Test Admin Trip' }],
      email: 'test-admin-trip@example.com',
      phone: '+2340000000000',
      idempotencyKey: randomBytes(16).toString('hex'),
    }),
  })
  check('a test booking holds a place (201)', booking.status === 201)

  const blocked = await supabase.rpc('cancel_trip', { p_trip_id: tripId, p_actor_id: null })
  check('cancel is refused while a place is held', blocked.error?.message === 'trip_has_bookings')
  const { data: stillOpen } = await supabase.from('trips').select('status').eq('id', tripId).single()
  check('the trip is still published after the refused cancel', stillOpen.status === 'published')

  // 4. Cancel once nothing is held
  await removeBookings(tripId)
  const cancelled = await supabase.rpc('cancel_trip', { p_trip_id: tripId, p_actor_id: null })
  check('cancel works on a trip with no bookings', !cancelled.error)
  const { data: after } = await supabase.from('trips').select('status').eq('id', tripId).single()
  check('the trip is now cancelled', after.status === 'cancelled')

  const { data: cancelAudit } = await supabase.from('audit_events').select('id')
    .eq('entity_id', tripId).eq('action', 'trip.cancel')
  check('cancellation is recorded in the audit log', cancelAudit.length === 1)

  const again = await supabase.rpc('cancel_trip', { p_trip_id: tripId, p_actor_id: null })
  check('cancelling twice is refused', again.error?.message === 'already_cancelled')

  const { data: listedAfter } = await supabase.rpc('list_available_trips', { p_route_id: route.id, p_date: day })
  check('customers can no longer find the cancelled trip', !(listedAfter ?? []).some((t) => t.trip_id === tripId))
} catch (err) {
  console.error('Test crashed:', err.message)
  failed++
} finally {
  if (tripId) {
    await removeBookings(tripId)
    await supabase.from('trips').delete().eq('id', tripId)
  }
}

console.log(failed ? `\n${failed} check(s) FAILED.` : '\nAll checks passed.')
process.exit(failed ? 1 : 0)
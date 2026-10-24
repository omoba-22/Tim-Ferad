import { supabase } from '../db/supabase.js'
import { AppError } from '../utils/errors.js'

// Staff view of trips. "confirmedPlaces" counts paid bookings only; places
// held by unpaid bookings are not shown here.
export async function listTrips() {
  const { data: trips, error } = await supabase
    .from('trips')
    .select('id, departure_at, capacity, fare_kobo, status, departure_point, routes ( origin_city, destination_city ), vehicles ( label )')
    .order('departure_at', { ascending: false })
    .limit(100)
  if (error) throw error

  const confirmed = new Map()
  if (trips.length > 0) {
    const { data: bookings, error: bookingsError } = await supabase
      .from('bookings')
      .select('trip_id, passenger_count')
      .eq('status', 'confirmed')
      .in('trip_id', trips.map((t) => t.id))
    if (bookingsError) throw bookingsError
    for (const b of bookings) {
      confirmed.set(b.trip_id, (confirmed.get(b.trip_id) ?? 0) + b.passenger_count)
    }
  }

  return trips.map((t) => ({
    id: t.id,
    from: t.routes.origin_city,
    to: t.routes.destination_city,
    vehicle: t.vehicles?.label ?? '',
    departureAt: t.departure_at,
    capacity: t.capacity,
    fareKobo: t.fare_kobo,
    status: t.status,
    departurePoint: t.departure_point,
    confirmedPlaces: confirmed.get(t.id) ?? 0,
  }))
}

// Choices for the "add a trip" form
export async function getTripOptions() {
  const [routes, vehicles] = await Promise.all([
    supabase.from('routes')
      .select('id, origin_city, destination_city, default_departure_point')
      .eq('is_active', true)
      .order('origin_city'),
    supabase.from('vehicles')
      .select('id, label, passenger_capacity')
      .eq('is_active', true)
      .order('label'),
  ])
  if (routes.error) throw routes.error
  if (vehicles.error) throw vehicles.error
  return {
    routes: routes.data.map((r) => ({
      id: r.id,
      name: `${r.origin_city} to ${r.destination_city}`,
      defaultDeparturePoint: r.default_departure_point,
    })),
    vehicles: vehicles.data.map((v) => ({ id: v.id, label: v.label, capacity: v.passenger_capacity })),
  }
}

// What the database functions report, in words staff can act on
const MESSAGES = {
  route_not_available: [400, 'That route is not available.'],
  vehicle_not_available: [400, 'That vehicle is not available.'],
  departure_in_past: [400, 'The departure must be in the future.'],
  trip_not_found: [404, 'Trip not found.'],
  already_cancelled: [409, 'This trip is already cancelled.'],
  trip_completed: [409, 'A completed trip cannot be cancelled.'],
  trip_has_bookings: [409, 'This trip has paid or in-progress bookings, so it cannot be cancelled here. Refund handling is not set up yet.'],
}

function mapError(error) {
  if (error.code === '23505') {
    return new AppError(409, 'That vehicle already has a trip at that date and time.')
  }
  const known = MESSAGES[error.message]
  return known ? new AppError(known[0], known[1]) : error
}

// Lagos is UTC+1 all year (no daylight saving), so the offset is fixed.
function lagosToIso(date, time) {
  const [y, m, d] = date.split('-').map(Number)
  const check = new Date(Date.UTC(y, m - 1, d))
  // Reject impossible dates such as 2026-02-31
  if (check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return null
  const when = new Date(`${date}T${time}:00+01:00`)
  return Number.isNaN(when.getTime()) ? null : when.toISOString()
}

// "1500.50" to 150050, using whole numbers only so there is no rounding error
function nairaToKobo(text) {
  const [whole, fraction = ''] = text.split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

export async function createTrip(staffId, input) {
  const departureAt = lagosToIso(input.date, input.time)
  if (!departureAt) throw new AppError(400, 'Please enter a valid date and time.')
  const fareKobo = nairaToKobo(input.fareNaira)
  if (fareKobo <= 0) throw new AppError(400, 'The fare must be more than zero.')

  const { data, error } = await supabase.rpc('create_trip', {
    p_actor_id: staffId,
    p_route_id: input.routeId,
    p_vehicle_id: input.vehicleId,
    p_departure_at: departureAt,
    p_fare_kobo: fareKobo,
    p_departure_point: input.departurePoint ?? null,
  })
  if (error) throw mapError(error)
  return { id: data }
}

export async function cancelTrip(staffId, tripId) {
  const { error } = await supabase.rpc('cancel_trip', { p_trip_id: tripId, p_actor_id: staffId })
  if (error) throw mapError(error)
}
import { supabase } from '../db/supabase.js'
import { AppError } from '../utils/errors.js'
import { tokenMatches } from '../utils/ids.js'
import { formatMoney, formatLagosDate, formatLagosTime } from '../utils/format.js'

// Returns ticket details only for a CONFIRMED booking and only when the
// caller holds the booking's private token. Contact details are never included.
export async function getTicket(reference, token) {
  const { data: b, error } = await supabase
    .from('bookings')
    .select(`
      reference, status, passenger_count, unit_fare_kobo, total_kobo, access_token_hash,
      trips ( departure_at, departure_point, routes ( origin_city, destination_city, default_departure_point ) ),
      booking_passengers ( full_name, created_at )
    `)
    .eq('reference', reference)
    .order('created_at', { referencedTable: 'booking_passengers' })
    .maybeSingle()
  if (error) throw error

  // Same answer for "no such booking" and "wrong token"
  if (!b || !token || !tokenMatches(token, b.access_token_hash)) {
    throw new AppError(404, 'Ticket not found.')
  }
  if (b.status !== 'confirmed') {
    throw new AppError(409, 'This ticket is not available because the booking is not confirmed.')
  }

  const trip = b.trips
  const route = trip.routes
  return {
    reference: b.reference,
    from: route.origin_city,
    to: route.destination_city,
    departureAt: trip.departure_at,
    date: formatLagosDate(trip.departure_at),
    time: formatLagosTime(trip.departure_at),
    departurePoint: trip.departure_point ?? route.default_departure_point ?? 'To be confirmed',
    passengers: b.booking_passengers.map((p) => p.full_name),
    passengerCount: b.passenger_count,
    farePerPassenger: formatMoney(b.unit_fare_kobo),
    total: formatMoney(b.total_kobo),
    paymentStatus: 'Paid',
  }
}
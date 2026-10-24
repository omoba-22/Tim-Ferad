import { supabase } from '../db/supabase.js'

export async function listBookings({ q, status }) {
  let query = supabase
    .from('bookings')
    .select(`
      id, reference, status, contact_email, contact_phone, passenger_count, total_kobo,
      created_at, confirmed_at,
      trips ( departure_at, departure_point, routes ( origin_city, destination_city ) ),
      booking_passengers ( full_name, created_at ),
      payments ( status, amount_kobo, paystack_reference, paid_at, exception_reason )
    `)
    .order('created_at', { ascending: false })
    .limit(100)

  if (status) query = query.eq('status', status)

  // Keep only characters a reference, email or phone number can contain.
  // This also keeps commas and brackets out of the filter text.
  const term = (q ?? '').replace(/[^A-Za-z0-9@.+-]/g, '')
  if (term) {
    query = query.or(
      `reference.ilike.%${term}%,contact_email.ilike.%${term}%,contact_phone.ilike.%${term}%`,
    )
  }

  const { data, error } = await query
  if (error) throw error

  return data.map((b) => ({
    id: b.id,
    reference: b.reference,
    status: b.status,
    email: b.contact_email,
    phone: b.contact_phone,
    passengerCount: b.passenger_count,
    totalKobo: b.total_kobo,
    createdAt: b.created_at,
    confirmedAt: b.confirmed_at,
    from: b.trips?.routes?.origin_city ?? '',
    to: b.trips?.routes?.destination_city ?? '',
    departureAt: b.trips?.departure_at ?? null,
    departurePoint: b.trips?.departure_point ?? null,
    passengers: [...b.booking_passengers]
      .sort((a, c) => a.created_at.localeCompare(c.created_at))
      .map((p) => p.full_name),
    payments: b.payments.map((p) => ({
      status: p.status,
      amountKobo: p.amount_kobo,
      reference: p.paystack_reference,
      paidAt: p.paid_at,
      exceptionReason: p.exception_reason,
    })),
  }))
}
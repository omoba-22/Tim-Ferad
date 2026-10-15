import { supabase } from '../db/supabase.js'
import { env } from '../config/env.js'
import { AppError } from '../utils/errors.js'
import {
  newBookingReference, newPaystackReference, deriveAccessToken, hashToken, tokenMatches,
} from '../utils/ids.js'
import { initializeTransaction } from './paystack.js'
import { reconcilePayment } from './payments.js'

// Database error text -> safe message for the customer
const RPC_ERRORS = {
  not_enough_places: [409, 'Not enough places are left on this trip.'],
  trip_not_bookable: [409, 'This trip is not available for booking.'],
  booking_closed: [409, 'Booking for this trip has closed.'],
  trip_not_found: [404, 'Trip not found.'],
  invalid_passenger_count: [400, 'At least one passenger is required.'],
  invalid_passenger_name: [400, 'Every passenger needs a name.'],
}

export async function createBooking({ tripId, passengers, email, phone, idempotencyKey }) {
  const reference = newBookingReference()
  const paystackReference = newPaystackReference()

  // Reserves the places and records the booking in one database transaction.
  // The price comes from the trips table, never from the browser.
  const { data, error } = await supabase.rpc('create_booking', {
    p_trip_id: tripId,
    p_passenger_names: passengers.map((p) => p.fullName),
    p_contact_email: email,
    p_contact_phone: phone,
    p_reference: reference,
    p_access_token_hash: hashToken(deriveAccessToken(reference, env.ACCESS_TOKEN_SECRET)),
    p_paystack_reference: paystackReference,
    p_idempotency_key: idempotencyKey,
  })
  if (error) {
    const known = RPC_ERRORS[error.message]
    if (known) throw new AppError(...known)
    throw error
  }

  // On a repeated request (same idempotency key) the reference is the original one.
  const bookingReference = data.reference
  const accessToken = deriveAccessToken(bookingReference, env.ACCESS_TOKEN_SECRET)

  if (data.already_existed) {
    const { data: payment } = await supabase
      .from('payments').select('authorization_url').eq('paystack_reference', data.paystack_reference).single()
    if (!payment?.authorization_url) {
      throw new AppError(409, 'This booking could not be started. Please try again.')
    }
    return {
      reference: bookingReference, accessToken, authorizationUrl: payment.authorization_url,
      expiresAt: data.expires_at, totalKobo: data.total_kobo,
    }
  }

  // Start the Paystack payment. If that fails, give the places back at once.
  try {
    const init = await initializeTransaction({
      email,
      amountKobo: data.total_kobo,
      reference: data.paystack_reference,
      callbackUrl: `${env.FRONTEND_ORIGIN}/payment-result.html`,
      metadata: { booking_reference: bookingReference },
    })
    const { error: updateError } = await supabase
      .from('payments').update({ authorization_url: init.authorization_url })
      .eq('paystack_reference', data.paystack_reference)
    if (updateError) throw updateError

    return {
      reference: bookingReference, accessToken, authorizationUrl: init.authorization_url,
      expiresAt: data.expires_at, totalKobo: data.total_kobo,
    }
  } catch (err) {
    console.error('Could not start payment:', err.message)
    await supabase.rpc('release_booking', { p_booking_id: data.booking_id, p_reason: 'paystack_init_failed' })
    throw new AppError(502, 'We could not start the payment. Please try again.')
  }
}

// Finds a booking only if the caller holds its private token.
// "Wrong reference" and "wrong token" look identical, so nothing can be probed.
async function loadBooking(reference, token) {
  const { data: booking, error } = await supabase
    .from('bookings')
    .select('id, reference, access_token_hash')
    .eq('reference', reference)
    .maybeSingle()
  if (error) throw error
  if (!booking || !token || !tokenMatches(token, booking.access_token_hash)) {
    throw new AppError(404, 'Booking not found.')
  }
  return booking
}

async function currentState(bookingId) {
  const { data: booking } = await supabase
    .from('bookings')
    .select('reference, status, passenger_count, total_kobo, expires_at')
    .eq('id', bookingId).single()
  const { data: payment } = await supabase
    .from('payments').select('status')
    .eq('booking_id', bookingId).order('created_at', { ascending: false }).limit(1).single()
  return {
    reference: booking.reference,
    bookingStatus: booking.status,
    paymentStatus: payment.status,
    passengerCount: booking.passenger_count,
    totalKobo: booking.total_kobo,
    expiresAt: booking.expires_at,
  }
}

export async function getBookingStatus(reference, token) {
  const booking = await loadBooking(reference, token)
  return currentState(booking.id)
}

// Asks PAYSTACK what happened, then lets the database decide. Nothing the
// browser says about payment is trusted.
export async function verifyBookingPayment(reference, token) {
  const booking = await loadBooking(reference, token)

  const { data: payment } = await supabase
    .from('payments').select('paystack_reference, status')
    .eq('booking_id', booking.id).order('created_at', { ascending: false }).limit(1).single()

  if (payment.status === 'pending' || payment.status === 'failed') {
    try {
      await reconcilePayment(payment.paystack_reference)
    } catch (err) {
      console.error('Could not verify with Paystack:', err.message)
      throw new AppError(502, 'We could not check the payment right now. Please try again shortly.')
    }
  }

  return currentState(booking.id)
}
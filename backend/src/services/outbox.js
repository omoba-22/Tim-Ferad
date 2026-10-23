import { supabase } from '../db/supabase.js'
import { getTicket } from './tickets.js'
import { getDeliveryOrderById } from './deliveryOrders.js'
import { sendEmail } from './email.js'
import {
  ticketEmail, companyBookingEmail, deliveryCustomerEmail, deliveryCompanyEmail,
} from './emailTemplates.js'
import { deriveAccessToken } from '../utils/ids.js'
import { env } from '../config/env.js'
import { AppError } from '../utils/errors.js'

const MINUTE = 60 * 1000
const MAX_ATTEMPTS = 5
// Wait before attempt 2, 3, 4, 5
const BACKOFF_MS = [5 * MINUTE, 15 * MINUTE, 60 * MINUTE, 3 * 60 * MINUTE]
// While one worker is sending, hide the row from other workers for this long
const CLAIM_MS = 5 * MINUTE

async function buildBookingEmail(n) {
  if (!n.booking_id) throw new AppError(400, 'Notification has no booking')

  const { data: booking, error } = await supabase
    .from('bookings')
    .select('reference')
    .eq('id', n.booking_id)
    .maybeSingle()
  if (error) throw error
  if (!booking) throw new AppError(404, 'Booking no longer exists')

  const token = deriveAccessToken(booking.reference, env.ACCESS_TOKEN_SECRET)
  const ticket = await getTicket(booking.reference, token)
  return n.type === 'ticket' ? ticketEmail(ticket) : companyBookingEmail(ticket)
}

async function buildDeliveryEmail(n) {
  if (!n.delivery_order_id) throw new AppError(400, 'Notification has no delivery order')
  const order = await getDeliveryOrderById(n.delivery_order_id)
  if (!order) throw new AppError(404, 'Delivery order no longer exists')
  return n.type === 'delivery_customer' ? deliveryCustomerEmail(order) : deliveryCompanyEmail(order)
}

// Builds the email for one notification, using current data from the database.
async function buildEmail(n) {
  if (n.type === 'ticket' || n.type === 'booking_company') return buildBookingEmail(n)
  if (n.type === 'delivery_customer' || n.type === 'delivery_company') return buildDeliveryEmail(n)
  throw new AppError(400, `No email template for type "${n.type}"`)
}

async function markSent(n) {
  const { error } = await supabase
    .from('notifications')
    .update({
      status: 'sent',
      sent_at: new Date().toISOString(),
      attempts: n.attempts + 1,
      last_error: null,
    })
    .eq('id', n.id)
  if (error) console.error(`Outbox: could not mark ${n.id} as sent:`, error.message)
}

async function markFailedAttempt(n, err, retryable) {
  const attempts = n.attempts + 1
  const giveUp = !retryable || attempts >= MAX_ATTEMPTS
  const { error } = await supabase
    .from('notifications')
    .update({
      status: giveUp ? 'failed' : 'queued',
      attempts,
      last_error: String(err.message).slice(0, 500),
      next_attempt_at: new Date(Date.now() + (BACKOFF_MS[attempts - 1] ?? BACKOFF_MS.at(-1))).toISOString(),
    })
    .eq('id', n.id)
  if (error) console.error(`Outbox: could not record failure for ${n.id}:`, error.message)
  return giveUp
}

// Sends queued emails that are due. Safe to call from several places at once.
export async function processOutbox({ limit = 20 } = {}) {
  const result = { sent: 0, retrying: 0, failed: 0 }

  const { data: due, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('status', 'queued')
    .lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at')
    .limit(limit)
  if (error) throw error

  for (const candidate of due) {
    // Claim the row: only one worker can win this update.
    const { data: n } = await supabase
      .from('notifications')
      .update({ next_attempt_at: new Date(Date.now() + CLAIM_MS).toISOString() })
      .eq('id', candidate.id)
      .eq('status', 'queued')
      .eq('next_attempt_at', candidate.next_attempt_at)
      .select()
      .maybeSingle()
    if (!n) continue // another worker took it

    try {
      const email = await buildEmail(n)
      await sendEmail({
        to: n.recipient_email,
        ...email,
        idempotencyKey: `notification-${n.id}`,
      })
      await markSent(n)
      result.sent++
    } catch (err) {
      // AppError (missing booking, unconfirmed booking) will never fix itself.
      const retryable = err instanceof AppError ? false : err.retryable !== false
      const gaveUp = await markFailedAttempt(n, err, retryable)
      console.error(`Outbox: notification ${n.id} failed:`, err.message)
      if (gaveUp) result.failed++
      else result.retrying++
    }
  }
  return result
}
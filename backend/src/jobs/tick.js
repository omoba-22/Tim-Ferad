import { supabase } from '../db/supabase.js'
import { reconcilePayment } from '../services/payments.js'
import { processOutbox } from '../services/outbox.js'

const MINUTE = 60 * 1000

// Housekeeping that runs on a schedule.
export async function runTick() {
  const now = Date.now()
  const iso = (ms) => new Date(ms).toISOString()

  // 1. Re-check payments that may have succeeded without us hearing about it:
  //    bookings that are unpaid or expired within the last 30 minutes, and at
  //    least 2 minutes old (so we don't interrupt a customer mid-checkout).
  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id')
    .in('status', ['pending_payment', 'expired'])
    .gte('expires_at', iso(now - 30 * MINUTE))
    .lte('created_at', iso(now - 2 * MINUTE))
    .limit(50)
  if (error) throw error

  let checked = 0
  let errors = 0

  if (bookings.length > 0) {
    const { data: payments, error: paymentsError } = await supabase
      .from('payments')
      .select('paystack_reference')
      .in('booking_id', bookings.map((b) => b.id))
      .eq('status', 'pending')
    if (paymentsError) throw paymentsError

    for (const payment of payments) {
      try {
        await reconcilePayment(payment.paystack_reference)
        checked++
      } catch (err) {
        // One bad payment must not stop the others
        errors++
        console.error('Tick: could not check a payment:', err.message)
      }
    }
  }

  // 2. Mark unpaid bookings past their deadline as expired
  const { data: expired, error: expireError } = await supabase.rpc('expire_stale_bookings')
  if (expireError) throw expireError

    // 3. Send queued emails and retry failed ones that are due
  let outbox = { sent: 0, retrying: 0, failed: 0 }
  try {
    outbox = await processOutbox()
  } catch (err) {
    console.error('Tick: outbox failed:', err.message)
  }

  return { checked, errors, expired, outbox }
}
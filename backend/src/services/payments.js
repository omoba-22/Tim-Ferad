import { supabase } from '../db/supabase.js'
import { verifyTransaction } from './paystack.js'
import { processOutbox } from './outbox.js'

// Asks PAYSTACK what happened to a payment, then lets the database act on
// the answer. Used by both the verify page and the webhook, so there is one
// code path for confirming money.
export async function reconcilePayment(paystackReference) {
  const tx = await verifyTransaction(paystackReference)
  if (tx.reference !== paystackReference) {
    throw new Error('Paystack returned a different reference')
  }

  if (tx.status === 'success') {
    const { data, error } = await supabase.rpc('confirm_payment', {
      p_paystack_reference: paystackReference,
      p_amount_kobo: tx.amount,
      p_currency: tx.currency,
      p_transaction_id: String(tx.id),
      p_paid_at: tx.paid_at ?? null,
      // Only non-sensitive fields are stored
      p_verify_response: {
        status: tx.status, amount: tx.amount, currency: tx.currency,
        channel: tx.channel, gateway_response: tx.gateway_response, paid_at: tx.paid_at,
      },
    })
        if (error) throw error

    // Send any queued emails now, without making the customer wait.
    // If this fails, the notification stays queued and tick retries it.
    processOutbox().catch((err) => console.error('Outbox after payment failed:', err.message))

    return data
  }

  if (tx.status === 'failed') {
    await supabase.rpc('mark_payment_failed', { p_paystack_reference: paystackReference })
    return { outcome: 'failed' }
  }

  // abandoned, ongoing, pending: not paid yet
  return { outcome: 'not_paid', paystackStatus: tx.status }
}
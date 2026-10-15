import express, { Router } from 'express'
import { createHmac, timingSafeEqual } from 'node:crypto'
import { env } from '../config/env.js'
import { supabase } from '../db/supabase.js'
import { reconcilePayment } from '../services/payments.js'

export const webhooksRouter = Router()

// HMAC-SHA512 of the RAW body, compared in constant time.
function signatureIsValid(rawBody, signature) {
  const expected = createHmac('sha512', env.PAYSTACK_SECRET_KEY).update(rawBody).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  return a.length === b.length && timingSafeEqual(a, b)
}

webhooksRouter.post(
  '/webhooks/paystack',
  express.raw({ type: () => true, limit: '100kb' }), // keep the body as raw bytes
  async (req, res, next) => {
    try {
      const signature = req.get('x-paystack-signature') ?? ''
      if (!Buffer.isBuffer(req.body) || !signature || !signatureIsValid(req.body, signature)) {
        return res.status(401).json({ error: 'Invalid signature' })
      }

      let event
      try {
        event = JSON.parse(req.body.toString('utf8'))
      } catch {
        return res.status(400).json({ error: 'Invalid body' })
      }

      // We only act on successful charges. Other events are acknowledged and ignored.
      const data = event?.data ?? {}
      if (event?.event !== 'charge.success' || typeof data.reference !== 'string') {
        return res.status(200).json({ received: true, ignored: true })
      }

      // Not one of our payments: acknowledge so Paystack does not retry forever.
      const { data: payment, error: paymentError } = await supabase
        .from('payments').select('id').eq('paystack_reference', data.reference).maybeSingle()
      if (paymentError) throw paymentError
      if (!payment) return res.status(200).json({ received: true, ignored: true })

      // Record the event. The unique key blocks duplicate processing.
      const eventKey = `charge.success:${data.id ?? data.reference}`
      const { error: insertError } = await supabase.from('payment_events').insert({
        event_key: eventKey,
        event_type: event.event,
        reference: data.reference,
        // Only non-sensitive fields are stored
        payload: { id: data.id, reference: data.reference, amount: data.amount, currency: data.currency, status: data.status },
      })
      if (insertError) {
        if (insertError.code !== '23505') throw insertError // 23505 = already seen
        const { data: existing } = await supabase
          .from('payment_events').select('processed_at').eq('event_key', eventKey).single()
        if (existing?.processed_at) return res.status(200).json({ received: true, duplicate: true })
        // Seen before but never finished (e.g. Paystack was unreachable): process it now.
      }

      // Re-verify with Paystack and confirm. confirm_payment is idempotent, so
      // even two webhooks arriving at the same instant cannot double-confirm.
      const result = await reconcilePayment(data.reference)

      await supabase.from('payment_events')
        .update({ processed_at: new Date().toISOString(), result: result.outcome })
        .eq('event_key', eventKey)

      res.status(200).json({ received: true })
    } catch (err) {
      // A 500 tells Paystack to retry later, which is what we want.
      next(err)
    }
  }
)
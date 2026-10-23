import { supabase } from '../db/supabase.js'
import { env } from '../config/env.js'
import { AppError } from '../utils/errors.js'
import { newDeliveryReference, deriveDeliveryToken, hashToken, tokenMatches } from '../utils/ids.js'
import { formatLagosDate, formatLagosTime } from '../utils/format.js'

export async function createDeliveryOrder(input) {
  const newReference = newDeliveryReference()
  const hash = hashToken(deriveDeliveryToken(newReference, env.ACCESS_TOKEN_SECRET))

  const { data, error } = await supabase.rpc('create_delivery_order', {
    p_reference: newReference,
    p_sender_name: input.senderName,
    p_sender_phone: input.senderPhone,
    p_sender_email: input.senderEmail,
    p_recipient_name: input.recipientName,
    p_recipient_phone: input.recipientPhone,
    p_pickup_address: input.pickupAddress,
    p_delivery_address: input.deliveryAddress,
    p_package_description: input.packageDescription,
    p_instructions: input.instructions ?? null,
    p_idempotency_key: input.idempotencyKey,
    p_access_token_hash: hash,
  })
  if (error) throw error

  // On a repeated request the database returns the ORIGINAL reference,
  // so the token is derived from that one.
  return {
    reference: data.reference,
    token: deriveDeliveryToken(data.reference, env.ACCESS_TOKEN_SECRET),
  }
}
// Loads an order for the email outbox. Server-side only, never exposed by a route.
export async function getDeliveryOrderById(id) {
  const { data, error } = await supabase
    .from('delivery_orders')
    .select(`
      reference, status, sender_name, sender_phone, sender_email, recipient_name, recipient_phone,
      pickup_address, delivery_address, package_description, instructions
    `)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}
// [PLACEHOLDER] Wording until the company confirms its delivery workflow
const STATUS_LABELS = {
  pending_review: 'Waiting for review',
  confirmed: 'Confirmed',
  picked_up: 'Picked up',
  in_transit: 'In transit',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
}

// Returns an order only when the caller holds its private token.
export async function getDeliveryOrder(reference, token) {
  const { data: o, error } = await supabase
    .from('delivery_orders')
    .select(`
      reference, status, sender_name, sender_phone, recipient_name, recipient_phone,
      pickup_address, delivery_address, package_description, instructions,
      access_token_hash, created_at
    `)
    .eq('reference', reference)
    .maybeSingle()
  if (error) throw error

  // Same answer for "no such order" and "wrong token"
  if (!o || !token || !tokenMatches(token, o.access_token_hash)) {
    throw new AppError(404, 'Delivery order not found.')
  }

  return {
    reference: o.reference,
    status: STATUS_LABELS[o.status] ?? o.status,
    submittedOn: `${formatLagosDate(o.created_at)}, ${formatLagosTime(o.created_at)}`,
    senderName: o.sender_name,
    senderPhone: o.sender_phone,
    recipientName: o.recipient_name,
    recipientPhone: o.recipient_phone,
    pickupAddress: o.pickup_address,
    deliveryAddress: o.delivery_address,
    packageDescription: o.package_description,
    instructions: o.instructions,
  }
}
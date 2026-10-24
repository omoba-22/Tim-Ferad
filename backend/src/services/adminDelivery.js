import { supabase } from '../db/supabase.js'
import { AppError } from '../utils/errors.js'

export async function listDeliveryOrders({ q, status }) {
  let query = supabase
    .from('delivery_orders')
    .select(`
      id, reference, status, sender_name, sender_phone, sender_email, recipient_name,
      recipient_phone, pickup_address, delivery_address, package_description,
      instructions, created_at
    `)
    .order('created_at', { ascending: false })
    .limit(100)

  if (status) query = query.eq('status', status)

  // Keep letters (including accented ones), digits, spaces and @ . + - only.
  // This also keeps commas and brackets out of the filter text.
  const term = (q ?? '').replace(/[^\p{L}\p{N}@.+\- ]/gu, '').replace(/\s+/g, ' ').trim()
  if (term) {
    query = query.or(
      [
        `reference.ilike.%${term}%`,
        `sender_name.ilike.%${term}%`,
        `sender_phone.ilike.%${term}%`,
        `sender_email.ilike.%${term}%`,
        `recipient_name.ilike.%${term}%`,
        `recipient_phone.ilike.%${term}%`,
      ].join(','),
    )
  }

  const { data, error } = await query
  if (error) throw error

  return data.map((o) => ({
    id: o.id,
    reference: o.reference,
    status: o.status,
    senderName: o.sender_name,
    senderPhone: o.sender_phone,
    senderEmail: o.sender_email,
    recipientName: o.recipient_name,
    recipientPhone: o.recipient_phone,
    pickupAddress: o.pickup_address,
    deliveryAddress: o.delivery_address,
    packageDescription: o.package_description,
    instructions: o.instructions,
    createdAt: o.created_at,
  }))
}

const MESSAGES = {
  order_not_found: [404, 'Delivery order not found.'],
  order_closed: [409, 'This order is delivered or cancelled, so its status can no longer be changed.'],
  no_change: [409, 'The order already has that status.'],
}

export async function updateDeliveryStatus(staffId, orderId, status) {
  const { error } = await supabase.rpc('update_delivery_status', {
    p_order_id: orderId,
    p_status: status,
    p_actor_id: staffId,
  })
  if (error) {
    const known = MESSAGES[error.message]
    throw known ? new AppError(known[0], known[1]) : error
  }
}
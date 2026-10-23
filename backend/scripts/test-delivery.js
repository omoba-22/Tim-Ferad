import { randomBytes } from 'node:crypto'
import { supabase } from '../src/db/supabase.js'
import { env } from '../src/config/env.js'
import { deriveAccessToken } from '../src/utils/ids.js'

const base = `http://localhost:${env.PORT}/api`
let failed = 0
const check = (name, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) failed++
}

const post = (body) =>
  fetch(`${base}/delivery-orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

const validOrder = {
  senderName: 'Test Sender',
  senderPhone: '+2340000000000',
  senderEmail: 'test-sender@example.com',
  recipientName: 'Test Recipient',
  recipientPhone: '+2340000000001',
  pickupAddress: 'TEST pickup address',
  deliveryAddress: 'TEST delivery address',
  packageDescription: 'TEST package',
  idempotencyKey: `test-${randomBytes(12).toString('hex')}`,
}

let reference = null

try {
  // 1. A valid order is created
  const r1 = await post(validOrder)
  const j1 = await r1.json()
  reference = j1.reference
  check('valid order is created (201)', r1.status === 201)
  check('reference starts with DL-', /^DL-[A-Z0-9]{10}$/.test(j1.reference ?? ''))
  check('a private token is returned', typeof j1.token === 'string' && j1.token.length > 20)

  // 2. Sending the same request again does not create a second order
  const r2 = await post(validOrder)
  const j2 = await r2.json()
  check('repeat request returns the same reference', j2.reference === j1.reference)
  check('repeat request returns the same token', j2.token === j1.token)
  const { count: orderCount } = await supabase
    .from('delivery_orders')
    .select('id', { count: 'exact', head: true })
    .eq('idempotency_key', validOrder.idempotencyKey)
  check('only one order exists for that key', orderCount === 1)

  // 3. Bad input is rejected
  const { recipientName, ...missing } = { ...validOrder, idempotencyKey: `test-${randomBytes(12).toString('hex')}` }
  check('missing recipient name is rejected (400)', (await post(missing)).status === 400)

  const { senderEmail, ...noEmail } = { ...validOrder, idempotencyKey: `test-${randomBytes(12).toString('hex')}` }
  check('missing sender email is rejected (400)', (await post(noEmail)).status === 400)

  const sneaky = { ...validOrder, idempotencyKey: `test-${randomBytes(12).toString('hex')}`, chargeKobo: 1, status: 'delivered' }
  check('extra fields (price, status) are rejected (400)', (await post(sneaky)).status === 400)

  // 4. Access needs the right token
  const url = `${base}/delivery-orders/${reference}`
  const ok = await fetch(`${url}?t=${encodeURIComponent(j1.token)}`)
  const okJson = await ok.json()
  check('correct token shows the order (200)', ok.status === 200 && okJson.order?.reference === reference)
  check('order starts as waiting for review', okJson.order?.status === 'Waiting for review')
  check('response is not cached', ok.headers.get('cache-control') === 'no-store')

  const wrong = await fetch(`${url}?t=${encodeURIComponent(j1.token.slice(0, -1) + 'x')}`)
  check('wrong token is rejected (404)', wrong.status === 404)
  check('no token is rejected (404)', (await fetch(url)).status === 404)

  const bookingStyleToken = deriveAccessToken(reference, env.ACCESS_TOKEN_SECRET)
  const crossed = await fetch(`${url}?t=${encodeURIComponent(bookingStyleToken)}`)
  check('a booking-style token cannot open a delivery order (404)', crossed.status === 404)

  // 5. PDF
  const pdf = await fetch(`${url}/pdf?t=${encodeURIComponent(j1.token)}`)
  const bytes = Buffer.from(await pdf.arrayBuffer())
  check('PDF is served with the right token', pdf.status === 200 && pdf.headers.get('content-type') === 'application/pdf')
  check('PDF file is really a PDF', bytes.subarray(0, 4).toString() === '%PDF')
  const pdfWrong = await fetch(`${url}/pdf?t=wrong-token`)
  check('PDF is refused with a wrong token (404)', pdfWrong.status === 404)

  // 6. Notifications were queued with the order
  const { data: order } = await supabase.from('delivery_orders').select('id').eq('reference', reference).single()
  const { data: notes } = await supabase
    .from('notifications')
    .select('type, recipient_email')
    .eq('delivery_order_id', order.id)
  check(
    'customer notification is queued for the sender email',
    notes.some((n) => n.type === 'delivery_customer' && n.recipient_email === validOrder.senderEmail),
  )
  check('customer notification is queued only once', notes.filter((n) => n.type === 'delivery_customer').length === 1)
} catch (err) {
  console.error('Test crashed:', err.message)
  failed++
} finally {
  // Clean up the test order and its notifications
  if (reference) {
    const { data: order } = await supabase.from('delivery_orders').select('id').eq('reference', reference).maybeSingle()
    if (order) {
      await supabase.from('notifications').delete().eq('delivery_order_id', order.id)
      await supabase.from('delivery_orders').delete().eq('id', order.id)
    }
  }
}

console.log(failed ? `\n${failed} check(s) FAILED.` : '\nAll checks passed.')
process.exit(failed ? 1 : 0)
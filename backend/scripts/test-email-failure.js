import { supabase } from '../src/db/supabase.js'
import { env } from '../src/config/env.js'
import { processOutbox } from '../src/services/outbox.js'

let failed = 0
const check = (name, ok) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`)
  if (!ok) failed++
}

// 1. Find a confirmed booking to send a test email about
const { data: booking, error: bErr } = await supabase
  .from('bookings')
  .select('id, contact_email')
  .eq('status', 'confirmed')
  .order('created_at', { ascending: false })
  .limit(1)
  .maybeSingle()
if (bErr) throw bErr
if (!booking) {
  console.error('No confirmed booking found. Make one paid test booking first.')
  process.exit(1)
}

// 2. Queue a test notification
const { data: n, error: nErr } = await supabase
  .from('notifications')
  .insert({
    type: 'ticket',
    recipient_email: booking.contact_email,
    booking_id: booking.id,
    dedupe_key: `test-email-failure-${Date.now()}`,
    next_attempt_at: new Date(Date.now() - 60_000).toISOString(),
  })
  .select()
  .single()
if (nErr) throw nErr

const getRow = async () =>
  (await supabase.from('notifications').select('*').eq('id', n.id).single()).data

// 3. Break email on purpose (key removed from memory only, .env is untouched)
const realKey = env.RESEND_API_KEY
env.RESEND_API_KEY = undefined
await processOutbox()

let row = await getRow()
check('notification is still queued (not lost)', row.status === 'queued')
check('attempt was counted', row.attempts === 1)
check('error was recorded', Boolean(row.last_error))
check('retry is scheduled in the future', new Date(row.next_attempt_at) > new Date())

const { data: b } = await supabase.from('bookings').select('status').eq('id', booking.id).single()
check('booking is still confirmed', b.status === 'confirmed')

// 4. Fix email, make the retry due now, run again
env.RESEND_API_KEY = realKey
await supabase.from('notifications').update({ next_attempt_at: new Date(Date.now() - 60_000).toISOString() }).eq('id', n.id)
await processOutbox()

row = await getRow()
check('email is sent after email is fixed', row.status === 'sent')
check('error cleared after success', row.last_error === null)

console.log(failed ? `\n${failed} check(s) FAILED.` : '\nAll checks passed.')
process.exit(failed ? 1 : 0)
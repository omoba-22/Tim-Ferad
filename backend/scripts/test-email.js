import { sendEmail } from '../src/services/email.js'

const to = process.argv[2]
if (!to) {
  console.error('Usage: node --env-file=.env scripts/test-email.js you@example.com')
  process.exit(1)
}

try {
  const id = await sendEmail({
    to,
    subject: 'Tim-Ferad test email',
    text: 'This is a test email from the Tim-Ferad backend.',
    html: '<p>This is a test email from the Tim-Ferad backend.</p>',
    idempotencyKey: `test-email-${Date.now()}`,
  })
  console.log('Sent. Resend id:', id)
} catch (err) {
  console.error('Failed:', err.message, '| retryable:', err.retryable)
  process.exit(1)
}
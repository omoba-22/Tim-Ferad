import { z } from 'zod'

const optionalString = (s) => z.preprocess((v) => (v === '' ? undefined : v), s.optional())

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(3000),
    FRONTEND_ORIGIN: z.string().url(),
    SUPABASE_URL: z.string().url(),
    SUPABASE_SECRET_KEY: z.string().min(20),
    PAYSTACK_SECRET_KEY: z.string().startsWith('sk_'),
    ACCESS_TOKEN_SECRET: z.string().min(32),
    CRON_SECRET: z.string().min(32),
    RESEND_API_KEY: optionalString(z.string().startsWith('re_')),
    EMAIL_FROM: z.string().min(5).default('Tim-Ferad <onboarding@resend.dev>'),
  })
  // Outside production, only Paystack TEST keys are allowed.
  .refine((v) => v.NODE_ENV === 'production' || v.PAYSTACK_SECRET_KEY.startsWith('sk_test_'), {
    message: 'Use a Paystack TEST key (sk_test_...) when not in production',
    path: ['PAYSTACK_SECRET_KEY'],
  })
  // In production, emails must be configured and must not use the test sender.
  .refine((v) => v.NODE_ENV !== 'production' || Boolean(v.RESEND_API_KEY), {
    message: 'RESEND_API_KEY is required in production',
    path: ['RESEND_API_KEY'],
  })
  .refine((v) => v.NODE_ENV !== 'production' || !v.EMAIL_FROM.includes('resend.dev'), {
    message: 'Set EMAIL_FROM to an address on the client domain in production',
    path: ['EMAIL_FROM'],
  })

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  console.error('Invalid or missing environment variables:')
  for (const issue of parsed.error.issues) {
    console.error(` - ${issue.path.join('.')}: ${issue.message}`)
  }
  process.exit(1)
}

export const env = parsed.data
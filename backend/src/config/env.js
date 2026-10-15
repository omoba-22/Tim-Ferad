import { z } from 'zod'

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().default(3000),
    FRONTEND_ORIGIN: z.string().url(),
    SUPABASE_URL: z.string().url(),
    SUPABASE_SECRET_KEY: z.string().min(20),
    PAYSTACK_SECRET_KEY: z.string().startsWith('sk_'),
    ACCESS_TOKEN_SECRET: z.string().min(32),
  })
  // Outside production, only Paystack TEST keys are allowed.
  .refine((v) => v.NODE_ENV === 'production' || v.PAYSTACK_SECRET_KEY.startsWith('sk_test_'), {
    message: 'Use a Paystack TEST key (sk_test_...) when not in production',
    path: ['PAYSTACK_SECRET_KEY'],
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
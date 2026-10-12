import { createClient } from '@supabase/supabase-js'
import { env } from '../config/env.js'

// Uses the secret key, so this file must only ever run on the server.
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
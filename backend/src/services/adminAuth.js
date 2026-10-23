import { createClient } from '@supabase/supabase-js'
import { env } from '../config/env.js'
import { supabase } from '../db/supabase.js'
import { AppError } from '../utils/errors.js'

// One message for every failure, so nobody can use this form to find out
// which email addresses belong to staff.
const BAD_LOGIN = 'Incorrect email or password.'

export async function staffLogin(email, password) {
  // A throwaway client for each sign-in. Signing in on the shared "supabase"
  // client would change who that client acts as, and break our database access.
  const loginClient = createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })

  const { data, error } = await loginClient.auth.signInWithPassword({ email, password })
  if (error) {
    if (error.status === 400 || error.status === 401 || error.code === 'invalid_credentials') {
      throw new AppError(401, BAD_LOGIN)
    }
    throw error // Supabase down or rate limited: logged as a server problem
  }
  if (!data.session) throw new AppError(401, BAD_LOGIN)

  // A valid login is not enough: the person must be active staff
  const { data: profile, error: profileError } = await supabase
    .from('staff_profiles')
    .select('full_name, role, is_active')
    .eq('user_id', data.user.id)
    .maybeSingle()
  if (profileError) throw profileError
  if (!profile || !profile.is_active) throw new AppError(401, BAD_LOGIN)

  // The refresh token is deliberately not sent to the browser
  return {
    accessToken: data.session.access_token,
    expiresAt: data.session.expires_at,
    staff: { fullName: profile.full_name, role: profile.role, email: data.user.email },
  }
}
import { supabase } from '../db/supabase.js'

// Lets a request through only if it carries a valid login AND that person
// is an active staff member. Roles are read from the database, never from
// anything the browser sends.
export async function requireStaff(req, res, next) {
  try {
    const header = req.headers.authorization || ''
    const token = header.startsWith('Bearer ') ? header.slice(7) : null
    if (!token) return res.status(401).json({ error: 'Authentication required' })

    const { data, error } = await supabase.auth.getUser(token)
    if (error || !data?.user) {
      return res.status(401).json({ error: 'Invalid or expired session' })
    }

    const { data: profile, error: profileError } = await supabase
      .from('staff_profiles')
      .select('full_name, role, is_active')
      .eq('user_id', data.user.id)
      .maybeSingle()
    if (profileError) throw profileError

    if (!profile || !profile.is_active) {
      return res.status(403).json({ error: 'Not authorized' })
    }

    req.staff = {
      id: data.user.id,
      email: data.user.email,
      fullName: profile.full_name,
      role: profile.role,
    }
    next()
  } catch (err) {
    next(err)
  }
}

// Use after requireStaff on routes only some roles may use, e.g. requireRole('admin')
export const requireRole = (...roles) => (req, res, next) => {
  if (!roles.includes(req.staff.role)) {
    return res.status(403).json({ error: 'Not authorized' })
  }
  next()
}
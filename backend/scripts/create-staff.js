// Creates a staff account. Usage (from the backend folder):
//   node --env-file=.env scripts/create-staff.js you@example.com "Full Name" admin
// The last word is the role: admin or operator.
import readline from 'node:readline/promises'
import { createClient } from '@supabase/supabase-js'

const [email, fullName, role = 'operator'] = process.argv.slice(2)

if (!email || !fullName || !['admin', 'operator'].includes(role)) {
  console.error('Usage: node --env-file=.env scripts/create-staff.js <email> "<Full Name>" <admin|operator>')
  process.exit(1)
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const password = await rl.question('Choose a password (at least 12 characters): ')
rl.close()

if (password.length < 12) {
  console.error('Password is too short.')
  process.exit(1)
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
})
if (error) {
  console.error('Could not create user:', error.message)
  process.exit(1)
}

const { error: profileError } = await supabase
  .from('staff_profiles')
  .insert({ user_id: data.user.id, full_name: fullName, role })

if (profileError) {
  // Don't leave a login with no staff profile behind
  await supabase.auth.admin.deleteUser(data.user.id)
  console.error('Could not create staff profile:', profileError.message)
  process.exit(1)
}

console.log(`Created ${role} account for ${email}`)
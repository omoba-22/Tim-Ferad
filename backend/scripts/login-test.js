// Checks the admin endpoint with no login, a fake login and a real login.
// Usage: node --env-file=.env scripts/login-test.js you@example.com
import readline from 'node:readline/promises'
import { createClient } from '@supabase/supabase-js'

const [email] = process.argv.slice(2)
const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const password = await rl.question('Password: ')
rl.close()

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY)
const { data, error } = await supabase.auth.signInWithPassword({ email, password })
if (error) {
  console.error('Login failed:', error.message)
  process.exit(1)
}

const url = 'http://localhost:3000/api/admin/me'

const none = await fetch(url)
console.log('No token    ->', none.status, '(expected 401)')

const fake = await fetch(url, { headers: { Authorization: 'Bearer not-a-real-token' } })
console.log('Fake token  ->', fake.status, '(expected 401)')

const real = await fetch(url, { headers: { Authorization: `Bearer ${data.session.access_token}` } })
console.log('Real login  ->', real.status, '(expected 200)', await real.json())
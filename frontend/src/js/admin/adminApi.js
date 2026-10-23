import { API_URL } from '../config.js'

const KEY = 'tf_admin_session'
const LOGIN = '/admin/login.html'

export class AdminApiError extends Error {
  constructor(message, status) {
    super(message)
    this.name = 'AdminApiError'
    this.status = status
  }
}

export function getSession() {
  try {
    return JSON.parse(sessionStorage.getItem(KEY))
  } catch {
    return null
  }
}

export function saveSession(session) {
  sessionStorage.setItem(KEY, JSON.stringify(session))
}

export function clearSession() {
  try {
    sessionStorage.removeItem(KEY)
  } catch { /* storage blocked: nothing to clear */ }
}

// path is relative to /api/admin, for example '/me'
export async function adminApi(path, { method = 'GET', body } = {}) {
  const session = getSession()
  const headers = {}
  if (body) headers['Content-Type'] = 'application/json'
  if (session?.accessToken) headers.Authorization = `Bearer ${session.accessToken}`

  let res
  try {
    res = await fetch(`${API_URL}/admin${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new AdminApiError('Could not reach the server. Check your connection and try again.', 0)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new AdminApiError(data.error ?? 'Something went wrong.', res.status)
  return data
}

// Call at the top of every staff page. Returns the staff member, or sends
// the visitor to the login page. The server re-checks every request anyway.
export async function requireSignIn() {
  if (!getSession()) {
    location.replace(LOGIN)
    return null
  }
  try {
    const { staff } = await adminApi('/me')
    return staff
  } catch (err) {
    if (err.status === 401 || err.status === 403) {
      clearSession()
      location.replace(LOGIN)
      return null
    }
    throw err
  }
}
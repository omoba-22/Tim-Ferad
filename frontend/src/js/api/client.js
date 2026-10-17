import { API_URL } from '../config.js'

export class ApiError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status // 0 means the server could not be reached
  }
}

// Talks to the backend. `token` is a booking's private access token.
export async function api(path, { method = 'GET', body, token } = {}) {
  if (!API_URL) throw new ApiError(0, 'The website is not configured correctly (missing API address).')

  const headers = {}
  if (body) headers['Content-Type'] = 'application/json'
  if (token) headers['x-booking-token'] = token

  let res
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError(0, 'Could not reach the server. Check your connection and try again.')
  }

  const data = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, data?.error ?? 'Something went wrong. Please try again.')
  return data
}

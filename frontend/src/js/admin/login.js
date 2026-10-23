import { adminApi, saveSession, AdminApiError } from './adminApi.js'

const form = document.querySelector('#login-form')
const errorBox = document.querySelector('#form-error')
const submitBtn = document.querySelector('#submit')

function showError(text) {
  errorBox.textContent = text
  errorBox.hidden = false
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  errorBox.hidden = true

  const email = form.elements.email.value.trim()
  const password = form.elements.password.value
  if (!email || !password) return showError('Enter your email and password.')

  submitBtn.disabled = true
  submitBtn.textContent = 'Signing in...'

  try {
    const result = await adminApi('/login', { method: 'POST', body: { email, password } })
    saveSession({ accessToken: result.accessToken, expiresAt: result.expiresAt })
    location.assign('/admin/index.html')
  } catch (err) {
    form.elements.password.value = ''
    showError(err instanceof AdminApiError ? err.message : 'Something went wrong. Please try again.')
    submitBtn.disabled = false
    submitBtn.textContent = 'Sign in'
  }
})

// Coming back with the browser's Back button
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    submitBtn.disabled = false
    submitBtn.textContent = 'Sign in'
  }
})
import { api, ApiError } from '../api/client.js'

const form = document.querySelector('#delivery-form')
const errorBox = document.querySelector('#form-error')
const submitBtn = document.querySelector('#submit')

// Same rule as the server
const PHONE = /^\+?[0-9 ()-]{7,20}$/

// Sent with the order so a double click or retry cannot create two orders.
const newKey = () => crypto.randomUUID().replaceAll('-', '')
let idempotencyKey = newKey()

// A changed form is a different order, so it needs a fresh key.
form.addEventListener('input', () => {
  idempotencyKey = newKey()
})

function showError(text, field) {
  errorBox.textContent = text
  errorBox.hidden = false
  errorBox.scrollIntoView?.({ block: 'nearest' })
  field?.focus()
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  errorBox.hidden = true

  const value = (name) => form.elements[name].value.trim()

  // Friendly checks first. The server checks everything again.
  const required = [
    ['senderName', 'Please enter the sender name.'],
    ['senderPhone', 'Please enter the sender phone number.'],
    ['senderEmail', 'Please enter the sender email address.'],
    ['pickupAddress', 'Please enter the pickup address.'],
    ['recipientName', 'Please enter the recipient name.'],
    ['recipientPhone', 'Please enter the recipient phone number.'],
    ['deliveryAddress', 'Please enter the delivery address.'],
    ['packageDescription', 'Please describe the package.'],
  ]
  for (const [name, message] of required) {
    if (!value(name)) return showError(message, form.elements[name])
  }
  for (const name of ['senderPhone', 'recipientPhone']) {
    if (!PHONE.test(value(name))) {
      return showError('Phone numbers can only use digits, spaces, brackets, hyphens and a leading +.', form.elements[name])
    }
  }
  if (!form.elements.senderEmail.validity.valid) {
    return showError('Please enter a valid email address.', form.elements.senderEmail)
  }

  const body = {
    senderName: value('senderName'),
    senderPhone: value('senderPhone'),
    senderEmail: value('senderEmail'),
    recipientName: value('recipientName'),
    recipientPhone: value('recipientPhone'),
    pickupAddress: value('pickupAddress'),
    deliveryAddress: value('deliveryAddress'),
    packageDescription: value('packageDescription'),
    idempotencyKey,
  }
  if (value('instructions')) body.instructions = value('instructions')

  submitBtn.disabled = true
  submitBtn.textContent = 'Submitting...'

  try {
    const result = await api('/delivery-orders', { method: 'POST', body })
    // [5.3b] This page is built next
    window.location.assign(
      `/delivery-confirmation.html?ref=${encodeURIComponent(result.reference)}&t=${encodeURIComponent(result.token)}`,
    )
  } catch (err) {
    // If the server answered (even with an error) use a fresh key next time.
    // If it never answered, keep the key so a retry cannot create two orders.
    if (err instanceof ApiError && err.status > 0) idempotencyKey = newKey()
    showError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')
    submitBtn.disabled = false
    submitBtn.textContent = 'Submit delivery request'
  }
})

// Coming back with the browser's Back button
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    submitBtn.disabled = false
    submitBtn.textContent = 'Submit delivery request'
  }
})
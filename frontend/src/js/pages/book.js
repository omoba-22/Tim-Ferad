import { api, ApiError } from '../api/client.js'
import { el, clear } from '../dom.js'
import { formatMoney, formatDate, formatTime, placesLeft } from '../format.js'
import { refreshIcons } from '../icons.js'

const statusBox = document.querySelector('#status')
const summary = document.querySelector('#trip-summary')
const form = document.querySelector('#booking-form')
const countSelect = document.querySelector('#count')
const passengerBox = document.querySelector('#passenger-fields')
const totalEl = document.querySelector('#total')
const errorBox = document.querySelector('#form-error')
const submitBtn = document.querySelector('#submit')

// Same sanity limit as the backend. The REAL limit is the trip's free places.
const MAX_PER_BOOKING = 20

const tripId = new URLSearchParams(location.search).get('trip')
let trip = null

// Sent with the booking so a double click or retry cannot create two bookings.
const newKey = () => crypto.randomUUID().replaceAll('-', '')
let idempotencyKey = newKey()

function showStatus(text, { isError = false, backLink = false } = {}) {
  clear(statusBox)
  statusBox.hidden = false
  statusBox.setAttribute('role', isError ? 'alert' : 'status')
  statusBox.append(el('p', {}, text))
  if (backLink) {
    statusBox.append(el('a', { class: 'btn-primary mt-4', href: '/travel.html' }, 'Back to trips'))
  }
}

function showFormError(text) {
  errorBox.textContent = text
  errorBox.hidden = false
  errorBox.scrollIntoView?.({ block: 'nearest' })
}

function renderSummary() {
  const row = (label, value) =>
    el('div', { class: 'flex justify-between gap-4 py-2' },
      el('dt', { class: 'text-ash-600' }, label),
      el('dd', { class: 'text-right font-semibold' }, value))
  clear(summary)
  summary.append(
    row('Route', `${trip.from} to ${trip.to}`),
    row('Date', formatDate(trip.departureAt)),
    row('Departure time', formatTime(trip.departureAt)),
    row('Departure point', trip.departurePoint ?? 'To be confirmed'),
    row('Fare per passenger', formatMoney(trip.fareKobo)),
    row('Availability', placesLeft(trip.remainingPlaces)),
  )
}

function renderPassengerFields() {
  const count = Number(countSelect.value)
  const oldValues = [...passengerBox.querySelectorAll('input')].map((i) => i.value)
  clear(passengerBox)
  for (let i = 0; i < count; i++) {
    const id = `passenger-${i + 1}`
    passengerBox.append(
      el('div', {},
        el('label', { for: id, class: 'block text-sm font-semibold' }, `Passenger ${i + 1} full name`),
        el('input', {
          id, name: id, type: 'text', required: true, maxlength: '100',
          autocomplete: i === 0 ? 'name' : 'off', class: 'field', value: oldValues[i] ?? '',
        }),
      ),
    )
  }
  // For display only. The server works out the real total from its own fare.
  totalEl.textContent = formatMoney(trip.fareKobo * count)
}

function setupCount() {
  const max = Math.min(trip.remainingPlaces, MAX_PER_BOOKING)
  const keep = Number(countSelect.value) || 1
  clear(countSelect)
  for (let n = 1; n <= max; n++) countSelect.append(el('option', { value: String(n) }, String(n)))
  countSelect.value = String(Math.min(keep, max) || 1)
  renderPassengerFields()
}

countSelect.addEventListener('change', renderPassengerFields)

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  errorBox.hidden = true

  const body = {
    tripId: trip.id,
    passengers: [...passengerBox.querySelectorAll('input')].map((i) => ({ fullName: i.value.trim() })),
    email: form.elements.email.value.trim(),
    phone: form.elements.phone.value.trim(),
    idempotencyKey,
  }

  submitBtn.disabled = true
  submitBtn.textContent = 'Starting payment...'

  try {
    const result = await api('/bookings', { method: 'POST', body })

    // Only ever send the customer to Paystack's own checkout
    const url = new URL(result.authorizationUrl)
    if (url.protocol !== 'https:' || !url.hostname.endsWith('paystack.com')) {
      throw new Error('Unexpected payment address')
    }

    // So the result page can check the payment when Paystack sends them back
    try {
      localStorage.setItem('tf_pending_booking', JSON.stringify({
        reference: result.reference, token: result.accessToken,
      }))
    } catch { /* storage blocked: the confirmation email is the fallback */ }

    window.location.assign(url.href)
  } catch (err) {
    // If the server answered (even with an error) use a fresh key next time.
    // If it never answered, keep the key so a retry cannot double-book.
    if (err instanceof ApiError && err.status > 0) idempotencyKey = newKey()

    showFormError(err instanceof ApiError ? err.message : 'Something went wrong. Please try again.')

    if (err instanceof ApiError && err.status === 409) {
      // Places may have changed: refresh the availability
      try {
        trip = (await api(`/trips/${encodeURIComponent(tripId)}`)).trip
        renderSummary()
        if (trip.remainingPlaces < 1) {
          form.hidden = true
          showStatus('This trip is now fully booked.', { backLink: true })
          return
        }
        setupCount()
      } catch { /* leave the page as it is */ }
    }
    submitBtn.disabled = false
    submitBtn.textContent = 'Continue to payment'
  }
})

// Coming back with the browser's Back button from Paystack
window.addEventListener('pageshow', (event) => {
  if (event.persisted) {
    submitBtn.disabled = false
    submitBtn.textContent = 'Continue to payment'
  }
})

async function init() {
  if (!tripId) {
    showStatus('No trip was selected.', { isError: true, backLink: true })
    return
  }
  try {
    trip = (await api(`/trips/${encodeURIComponent(tripId)}`)).trip
  } catch (err) {
    showStatus(
      err.status === 404 ? 'This trip is no longer available.' : err.message,
      { isError: true, backLink: true },
    )
    return
  }
  renderSummary()
  statusBox.hidden = true
  if (trip.remainingPlaces < 1) {
    showStatus('This trip is fully booked.', { backLink: true })
    return
  }
  form.hidden = false
  setupCount()
  refreshIcons()
}

init()

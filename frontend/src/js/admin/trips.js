import { startPage } from './shell.js'
import { adminApi, clearSession } from './adminApi.js'
import { el, clear } from '../dom.js'
import { formatMoney, formatDate, formatTime } from '../format.js'
import { refreshIcons } from '../icons.js'

const box = document.querySelector('#trips')
const form = document.querySelector('#trip-form')
const formError = document.querySelector('#form-error')
const formOk = document.querySelector('#form-ok')
const listError = document.querySelector('#list-error')
const submitBtn = document.querySelector('#submit')
const routeSelect = form.elements.routeId
const vehicleSelect = form.elements.vehicleId
const routeHint = document.querySelector('#route-hint')

const FARE = /^\d{1,7}(\.\d{1,2})?$/
const CANCELLABLE = ['draft', 'published', 'closed']
let routes = []

const label = (status) => status.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase())

// A 401 means the sign-in has expired: go back to the login page
function sessionEnded(err) {
  if (err.status !== 401) return false
  clearSession()
  location.replace('/admin/login.html')
  return true
}

function cancelButton(t) {
  if (!CANCELLABLE.includes(t.status)) return ''
  const button = el('button', { type: 'button', class: 'btn-outline !px-3 !py-1.5 text-sm' },
    el('i', { 'data-lucide': 'ban', class: 'h-4 w-4' }), 'Cancel trip')
  button.addEventListener('click', async () => {
    const when = `${formatDate(t.departureAt)} at ${formatTime(t.departureAt)}`
    if (!window.confirm(`Cancel the ${when} trip from ${t.from} to ${t.to}? This cannot be undone.`)) return
    button.disabled = true
    listError.hidden = true
    try {
      await adminApi(`/trips/${encodeURIComponent(t.id)}/cancel`, { method: 'POST' })
      await loadTrips()
    } catch (err) {
      if (sessionEnded(err)) return
      listError.textContent = err.message
      listError.hidden = false
      button.disabled = false
    }
  })
  return button
}

function render(trips) {
  clear(box)
  if (trips.length === 0) {
    box.append(el('div', { class: 'card' }, el('p', { class: 'text-ash-600' }, 'No trips yet.')))
    return
  }

  const th = (text) => el('th', { scope: 'col', class: 'whitespace-nowrap py-2 pr-4 font-semibold text-ash-600' }, text)
  const td = (...children) => el('td', { class: 'whitespace-nowrap py-3 pr-4' }, ...children)

  box.append(
    // The wrapper scrolls sideways on small screens so the page itself never does
    el('div', { class: 'card overflow-x-auto' },
      el('table', { class: 'w-full text-left text-sm' },
        el('thead', {}, el('tr', { class: 'border-b border-ash-200' },
          th('Date'), th('Time'), th('Route'), th('Vehicle'), th('Fare'), th('Confirmed places'), th('Status'), th('Action'))),
        el('tbody', {}, ...trips.map((t) =>
          el('tr', { class: 'border-b border-ash-100' },
            td(formatDate(t.departureAt)),
            td(formatTime(t.departureAt)),
            td(`${t.from} to ${t.to}`),
            td(t.vehicle),
            td(formatMoney(t.fareKobo)),
            td(`${t.confirmedPlaces} of ${t.capacity}`),
            td(label(t.status)),
            td(cancelButton(t)),
          ))),
      ),
    ),
  )
  refreshIcons()
}

async function loadTrips() {
  const { trips } = await adminApi('/trips')
  render(trips)
}

function showHint() {
  const route = routes.find((r) => r.id === routeSelect.value)
  routeHint.textContent = route?.defaultDeparturePoint
    ? `Leave empty to use: ${route.defaultDeparturePoint}`
    : 'Leave empty and tickets will say "To be confirmed" until the company confirms a departure point.'
}

async function setupForm() {
  const options = await adminApi('/trip-options')
  routes = options.routes
  for (const r of routes) routeSelect.append(el('option', { value: r.id }, r.name))
  for (const v of options.vehicles) {
    vehicleSelect.append(el('option', { value: v.id }, `${v.label} (${v.capacity} places)`))
  }
  // Earliest date: today in Lagos
  form.elements.date.min = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Lagos' })
  routeSelect.addEventListener('change', showHint)
  showHint()
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  formError.hidden = true
  formOk.hidden = true

  const body = {
    routeId: routeSelect.value,
    vehicleId: vehicleSelect.value,
    date: form.elements.date.value,
    time: form.elements.time.value,
    fareNaira: form.elements.fareNaira.value.trim(),
    departurePoint: form.elements.departurePoint.value.trim(),
  }
  const showError = (text) => {
    formError.textContent = text
    formError.hidden = false
  }
  if (!body.routeId || !body.vehicleId || !body.date || !body.time || !body.fareNaira) {
    return showError('Please fill in the route, vehicle, date, time and fare.')
  }
  if (!FARE.test(body.fareNaira)) {
    return showError('Enter the fare in naira using digits only, for example 5000 or 5000.50.')
  }

  submitBtn.disabled = true
  submitBtn.textContent = 'Adding...'
  try {
    await adminApi('/trips', { method: 'POST', body })
    form.reset()
    showHint()
    formOk.textContent = 'Trip added. It is now open for booking.'
    formOk.hidden = false
    await loadTrips()
  } catch (err) {
    if (!sessionEnded(err)) showError(err.message)
  } finally {
    submitBtn.disabled = false
    submitBtn.textContent = 'Add trip'
  }
})

async function init() {
  try {
    const staff = await startPage()
    if (!staff) return
    await setupForm()
    await loadTrips()
  } catch (err) {
    if (sessionEnded(err)) return
    clear(box)
    box.append(el('p', { role: 'alert' }, err.message || 'We could not load the trips. Please refresh the page.'))
  }
}

init()
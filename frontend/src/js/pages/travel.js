import { api } from '../api/client.js'
import { el, clear } from '../dom.js'
import { formatMoney, formatDate, formatTime, todayInLagos, placesLeft } from '../format.js'
import { refreshIcons } from '../icons.js'

const form = document.querySelector('#search-form')
const routeSelect = document.querySelector('#route')
const dateInput = document.querySelector('#date')
const results = document.querySelector('#results')

dateInput.min = todayInLagos()
dateInput.value = todayInLagos()

function showMessage(text, isError = false) {
  clear(results)
  results.append(el('p', { class: 'notice', role: isError ? 'alert' : 'status' }, text))
}

async function loadRoutes() {
  try {
    const { routes } = await api('/routes')
    if (routes.length === 0) {
      showMessage('No routes are available yet. Please check back soon.')
      return
    }
    for (const r of routes) {
      routeSelect.append(el('option', { value: r.id }, `${r.origin_city} to ${r.destination_city}`))
    }
  } catch (err) {
    showMessage(err.message, true)
  }
}

function tripCard(trip) {
  const full = trip.remaining_places < 1
  return el('article', { class: 'card flex flex-wrap items-center justify-between gap-4' },
    el('div', {},
      el('p', { class: 'text-2xl font-bold text-brand-700' }, formatTime(trip.departure_at)),
      el('p', { class: 'mt-1 text-ash-600' }, `${trip.origin_city} to ${trip.destination_city}`),
      el('p', { class: 'text-sm text-ash-600' }, `Departure point: ${trip.departure_point ?? 'To be confirmed'}`),
    ),
    el('div', { class: 'text-right' },
      el('p', { class: 'text-xl font-semibold' }, formatMoney(trip.fare_kobo)),
      el('p', { class: 'text-sm text-ash-600' }, 'per passenger'),
      el('p', { class: 'mt-1 text-sm font-semibold' }, full ? 'Fully booked' : placesLeft(trip.remaining_places)),
    ),
    full
      ? null
      : el('a', { class: 'btn-primary', href: `/book.html?trip=${encodeURIComponent(trip.trip_id)}` }, 'Book this trip'),
  )
}

form.addEventListener('submit', async (event) => {
  event.preventDefault()
  if (!routeSelect.value || !dateInput.value) {
    showMessage('Please choose a route and a date.', true)
    return
  }
  showMessage('Searching for trips...')
  try {
    const query = new URLSearchParams({ routeId: routeSelect.value, date: dateInput.value })
    const { trips } = await api(`/trips?${query}`)
    if (trips.length === 0) {
      showMessage(`No trips found for ${formatDate(`${dateInput.value}T12:00:00+01:00`)}. Try another date.`)
      return
    }
    clear(results)
    results.append(el('h2', { class: 'text-xl font-bold' }, formatDate(trips[0].departure_at)))
    const list = el('div', { class: 'mt-4 space-y-4' }, ...trips.map(tripCard))
    results.append(list)
    refreshIcons()
  } catch (err) {
    showMessage(err.message, true)
  }
})

loadRoutes()

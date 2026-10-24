import { startPage } from './shell.js'
import { adminApi, clearSession } from './adminApi.js'
import { el, clear } from '../dom.js'
import { formatMoney, formatDate, formatTime } from '../format.js'
import { refreshIcons } from '../icons.js'

const form = document.querySelector('#search-form')
const list = document.querySelector('#bookings')
const count = document.querySelector('#count')
let latest = 0 // numbers each search, so an older slow answer cannot replace a newer one
const label = (text) => String(text).replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase())
const when = (iso) => (iso ? `${formatDate(iso)}, ${formatTime(iso)}` : 'Not recorded')

// A 401 means the sign-in has expired: go back to the login page
function sessionEnded(err) {
  if (err.status !== 401) return false
  clearSession()
  location.replace('/admin/login.html')
  return true
}

function detail(labelText, value) {
  return el('div', {},
    el('dt', { class: 'text-sm text-ash-600' }, labelText),
    el('dd', { class: 'font-semibold break-words' }, value))
}

function card(b) {
  const trip = b.departureAt
    ? `${b.from} to ${b.to}, ${formatDate(b.departureAt)} at ${formatTime(b.departureAt)}`
    : 'Trip details missing'

  const paymentRows = b.payments.length === 0
    ? [el('p', { class: 'text-ash-600' }, 'No payment recorded.')]
    : b.payments.map((p) =>
        el('div', { class: 'rounded border border-ash-200 p-3' },
          el('p', { class: 'font-semibold' }, `${label(p.status)}, ${formatMoney(p.amountKobo)}`),
          el('p', { class: 'text-sm text-ash-600 break-all' }, `Paystack reference: ${p.reference}`),
          el('p', { class: 'text-sm text-ash-600' }, `Paid: ${when(p.paidAt)}`),
          p.exceptionReason ? el('p', { class: 'text-sm font-semibold' }, `Needs attention: ${label(p.exceptionReason)}`) : '',
        ))

  return el('details', { class: 'card' },
    el('summary', { class: 'cursor-pointer' },
      el('span', { class: 'flex flex-wrap items-center justify-between gap-x-4 gap-y-1' },
        el('span', { class: 'font-bold' }, b.reference),
        el('span', { class: 'text-sm font-semibold' }, label(b.status))),
      el('span', { class: 'mt-1 block text-sm text-ash-600' }, trip),
      el('span', { class: 'block text-sm text-ash-600' },
        `${b.passengerCount} passenger${b.passengerCount === 1 ? '' : 's'}, ${formatMoney(b.totalKobo)}`)),
    el('dl', { class: 'mt-4 grid gap-3 sm:grid-cols-2' },
      detail('Email', b.email),
      detail('Phone', b.phone),
      detail('Booked', when(b.createdAt)),
      detail('Confirmed', when(b.confirmedAt)),
      detail('Departure point', b.departurePoint ?? 'Route default'),
      detail('Passengers', b.passengers.join(', ')),
    ),
    el('h2', { class: 'mt-4 font-bold' }, 'Payments'),
    el('div', { class: 'mt-2 space-y-2' }, ...paymentRows),
  )
}

async function load(mine) {
    const params = new URLSearchParams()
  const q = form.elements.q.value.trim()
  if (q) params.set('q', q)
  if (form.elements.status.value) params.set('status', form.elements.status.value)

  const { bookings } = await adminApi(`/bookings${params.size ? `?${params}` : ''}`)
    if (mine !== latest) return

  clear(list)
  count.textContent = bookings.length === 100
    ? 'Showing the 100 newest matches. Use the search to narrow them down.'
    : `${bookings.length} booking${bookings.length === 1 ? '' : 's'} found.`
  if (bookings.length === 0) {
    list.append(el('div', { class: 'card' }, el('p', { class: 'text-ash-600' }, 'No bookings match.')))
  } else {
    list.append(...bookings.map(card))
  }
  refreshIcons()
}

async function run() {
  const mine = ++latest
  try {
    await load(mine)
  } catch (err) {
    if (mine !== latest || sessionEnded(err)) return
    clear(list)
    list.append(el('p', { role: 'alert' }, err.message || 'We could not load the bookings. Please try again.'))
  }
}

form.addEventListener('submit', (event) => {
  event.preventDefault()
  run()
})

// Emptying the box (or pressing the x in it) shows everything again
form.elements.q.addEventListener('input', () => {
  if (form.elements.q.value.trim() === '') run()
})
form.elements.q.addEventListener('search', () => {
  if (form.elements.q.value.trim() === '') run()
})

// Changing the status filter applies it straight away
form.elements.status.addEventListener('change', run)

async function init() {
  try {
    const staff = await startPage()
    if (!staff) return
    await run()
  } catch (err) {
    if (sessionEnded(err)) return
    clear(list)
    list.append(el('p', { role: 'alert' }, 'We could not check your sign-in. Please refresh the page.'))
  }
}

init()
import { api } from '../api/client.js'
import { API_URL } from '../config.js'
import { el, clear } from '../dom.js'
import { refreshIcons } from '../icons.js'

const box = document.querySelector('#ticket')

const params = new URLSearchParams(location.search)
const reference = params.get('ref') ?? ''
const token = params.get('t') ?? ''

function showProblem(title, text) {
  clear(box)
  box.append(
    el('div', { class: 'card' },
      el('i', { 'data-lucide': 'circle-alert', class: 'h-8 w-8 text-brand-700' }),
      el('h2', { class: 'mt-3 text-xl font-bold' }, title),
      el('p', { class: 'mt-2 text-ash-600' }, text),
      el('a', { class: 'btn-primary mt-4', href: '/travel.html' }, 'Back to trips'),
    ),
  )
  refreshIcons()
}

function row(label, value) {
  return el('div', { class: 'flex justify-between gap-4 border-b border-ash-100 py-3' },
    el('dt', { class: 'text-ash-600' }, label),
    el('dd', { class: 'text-right font-semibold' }, value))
}

function render(t) {
  const pdfUrl = `${API_URL}/tickets/${encodeURIComponent(t.reference)}/pdf?t=${encodeURIComponent(token)}`
  const printButton = el('button', { type: 'button', class: 'btn-outline' },
    el('i', { 'data-lucide': 'printer', class: 'h-5 w-5' }), 'Print')
  printButton.addEventListener('click', () => window.print())

  clear(box)
  box.append(
    el('div', { class: 'card overflow-hidden !p-0' },
      el('div', { class: 'bg-brand-700 p-6 text-white' },
        el('p', { class: 'flex items-center gap-2 font-semibold' },
          el('i', { 'data-lucide': 'circle-check', class: 'h-5 w-5' }), 'Booking confirmed'),
        el('p', { class: 'mt-3 text-sm text-brand-100' }, 'Booking reference'),
        el('p', { class: 'text-2xl font-bold' }, t.reference),
      ),
      el('div', { class: 'p-6' },
        el('dl', {},
          row('Route', `${t.from} to ${t.to}`),
          row('Date', t.date),
          row('Departure time', t.time),
          row('Departure point', t.departurePoint),
          row('Passengers', String(t.passengerCount)),
          row('Fare per passenger', t.farePerPassenger),
          row('Total paid', t.total),
          row('Payment status', t.paymentStatus),
        ),
        el('h2', { class: 'mt-6 font-bold' }, 'Passengers'),
        el('ol', { class: 'mt-2 list-decimal space-y-1 pl-6' }, ...t.passengers.map((name) => el('li', {}, name))),
      ),
    ),
    el('div', { class: 'mt-6 flex flex-wrap gap-3 print:hidden' },
      el('a', { class: 'btn-primary', href: pdfUrl, target: '_blank', rel: 'noopener' },
        el('i', { 'data-lucide': 'download', class: 'h-5 w-5' }), 'Download PDF'),
      printButton,
    ),
    el('p', { class: 'mt-4 text-sm text-ash-600 print:hidden' },
      'Keep this page or the PDF. Anyone with this link can see the ticket, so do not share it publicly.'),
  )
  refreshIcons()
}

async function init() {
  if (!reference || !token) {
    showProblem('Ticket not found', 'This ticket link is incomplete. Please use the link from your confirmation.')
    return
  }
  try {
    const { ticket } = await api(`/tickets/${encodeURIComponent(reference)}`, { token })
    render(ticket)
  } catch (err) {
    if (err.status === 404) showProblem('Ticket not found', 'Please check the link you were given.')
    else if (err.status === 409) showProblem('Ticket not available', 'This booking has not been confirmed, so there is no ticket yet.')
    else showProblem('We could not load your ticket', err.message)
  }
}

init()

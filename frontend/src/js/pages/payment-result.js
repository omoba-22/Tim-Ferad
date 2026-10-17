import { api } from '../api/client.js'
import { el, clear } from '../dom.js'
import { refreshIcons } from '../icons.js'

const box = document.querySelector('#result')
const contact = document.querySelector('#contact-block')
const KEY = 'tf_pending_booking'

const POLL_EVERY_MS = 5000
const MAX_ATTEMPTS = 12 // about one minute
let attempts = 0

function readPending() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY))
    if (v && typeof v.reference === 'string' && typeof v.token === 'string') return v
  } catch { /* nothing stored */ }
  return null
}

const link = (href, label, cls = 'btn-primary') => el('a', { class: cls, href }, label)
const button = (label, onClick) => {
  const b = el('button', { type: 'button', class: 'btn-primary' }, label)
  b.addEventListener('click', onClick)
  return b
}

function render({ icon, title, text, actions = [], showContact = false, busy = false }) {
  clear(box)
  box.setAttribute('aria-busy', String(busy))
  box.append(
    el('i', { 'data-lucide': icon, class: 'h-10 w-10 text-brand-700' }),
    el('h2', { class: 'mt-4 text-2xl font-bold' }, title),
    el('p', { class: 'mt-2 text-ash-600' }, text),
    el('div', { class: 'mt-6 flex flex-wrap gap-3' }, ...actions),
  )
  contact.hidden = !showContact
  refreshIcons()
}

function handle(pending, s) {
  // The server (not this page) decided this, after asking Paystack.
  if (s.bookingStatus === 'confirmed') {
    try { localStorage.removeItem(KEY) } catch { /* ignore */ }
    const t = encodeURIComponent(pending.token)
    window.location.replace(`/ticket.html?ref=${encodeURIComponent(pending.reference)}&t=${t}`)
    return
  }

  if (s.paymentStatus === 'refund_required') {
    render({
      icon: 'circle-alert',
      title: 'We received your payment but could not complete the booking',
      text: `This can happen if the trip filled up while you were paying. Please contact us and quote reference ${s.reference}. Do not pay again.`,
      actions: [link('/travel.html', 'Back to trips', 'btn-outline')],
      showContact: true,
    })
    return
  }

  if (s.paymentStatus === 'failed') {
    render({
      icon: 'circle-alert',
      title: 'Your payment did not go through',
      text: 'No money was taken for this booking. You can try again.',
      actions: [link('/travel.html', 'Back to trips')],
      showContact: true,
    })
    return
  }

  if (s.bookingStatus === 'expired' || s.bookingStatus === 'cancelled') {
    render({
      icon: 'clock',
      title: 'This booking has expired',
      text: 'The time to complete payment ran out and the places were released. If you were charged, please contact us and quote your reference. Otherwise you can book again.',
      actions: [link('/travel.html', 'Back to trips')],
      showContact: true,
    })
    return
  }

  // Not paid yet (or Paystack is still processing). Check a few more times.
  attempts += 1
  if (attempts < MAX_ATTEMPTS) {
    render({
      icon: 'clock',
      title: 'Waiting for your payment',
      text: 'We have not received confirmation yet. This page checks automatically, so please keep it open.',
      busy: true,
    })
    setTimeout(check, POLL_EVERY_MS)
    return
  }
  render({
    icon: 'clock',
    title: 'We are still waiting for confirmation',
    text: `If you have paid, it can take a few minutes. Your booking reference is ${s.reference}. If you have not paid, you can go back and try again.`,
    actions: [button('Check again', () => { attempts = 0; check() }), link('/travel.html', 'Back to trips', 'btn-outline')],
    showContact: true,
  })
}

async function check() {
  const pending = readPending()
  if (!pending) {
    render({
      icon: 'circle-alert',
      title: 'We could not find your booking in this browser',
      text: 'If you have paid, please contact us with the details of your trip and we will help you.',
      actions: [link('/travel.html', 'Back to trips')],
      showContact: true,
    })
    return
  }

  render({
    icon: 'clock',
    title: 'Checking your payment',
    text: 'Please wait while we confirm your payment. Do not close this page.',
    busy: true,
  })

  try {
    const status = await api(`/bookings/${encodeURIComponent(pending.reference)}/verify`, {
      method: 'POST',
      token: pending.token,
    })
    handle(pending, status)
  } catch (err) {
    render({
      icon: 'circle-alert',
      title: err.status === 404 ? 'Booking not found' : 'We could not check your payment',
      text: err.status === 404
        ? 'We could not find this booking.'
        : `${err.message} If you have already paid, please do not pay again.`,
      actions: err.status === 404
        ? [link('/travel.html', 'Back to trips')]
        : [button('Try again', () => { attempts = 0; check() })],
      showContact: true,
    })
  }
}

check()

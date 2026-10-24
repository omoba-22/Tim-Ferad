import { startPage } from './shell.js'
import { adminApi } from './adminApi.js'
import { el, clear } from '../dom.js'
import { refreshIcons } from '../icons.js'

const content = document.querySelector('#content')

// If the count fails, the rest of the dashboard still works
async function deliveryCard() {
  try {
    const { pendingDeliveryOrders: n } = await adminApi('/summary')
    return el('div', { class: 'card' },
      el('h2', { class: 'font-bold' }, 'Delivery orders'),
      el('p', { class: 'mt-2 text-3xl font-bold text-brand-700' }, String(n)),
      el('p', { class: 'text-ash-600' }, n === 1 ? 'order waiting for review' : 'orders waiting for review'),
      el('a', {
        class: 'btn-primary mt-4',
        href: n > 0 ? '/admin/delivery.html?status=pending_review' : '/admin/delivery.html',
      }, n > 0 ? 'Review orders' : 'View delivery orders'),
    )
  } catch {
    return el('div', { class: 'card' },
      el('h2', { class: 'font-bold' }, 'Delivery orders'),
      el('p', { class: 'mt-2 text-ash-600' }, 'We could not load the summary. Open the Delivery page instead.'),
      el('a', { class: 'btn-outline mt-4', href: '/admin/delivery.html' }, 'View delivery orders'),
    )
  }
}

function linksCard() {
  return el('div', { class: 'card' },
    el('h2', { class: 'font-bold' }, 'Quick links'),
    el('div', { class: 'mt-4 flex flex-wrap gap-3' },
      el('a', { class: 'btn-outline', href: '/admin/trips.html' }, 'Trips'),
      el('a', { class: 'btn-outline', href: '/admin/bookings.html' }, 'Bookings'),
    ),
  )
}

async function init() {
  let staff
  try {
    staff = await startPage()
  } catch {
    clear(content)
    content.append(el('p', { role: 'alert' }, 'We could not check your sign-in. Please refresh the page.'))
    return
  }
  if (!staff) return

  const delivery = await deliveryCard()
  clear(content)
  content.append(
    el('h1', { class: 'text-2xl font-bold' }, `Welcome, ${staff.fullName}`),
    el('div', { class: 'mt-6 grid gap-6 sm:grid-cols-2' }, delivery, linksCard()),
  )
  refreshIcons()
}

init()
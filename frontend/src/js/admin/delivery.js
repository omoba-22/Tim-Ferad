import { startPage } from './shell.js'
import { adminApi, clearSession } from './adminApi.js'
import { el, clear } from '../dom.js'
import { formatDate, formatTime } from '../format.js'
import { refreshIcons } from '../icons.js'

const form = document.querySelector('#search-form')
const list = document.querySelector('#orders')
const count = document.querySelector('#count')
const actionError = document.querySelector('#action-error')

const STATUSES = ['pending_review', 'confirmed', 'picked_up', 'in_transit', 'delivered', 'cancelled']
const CLOSED = ['delivered', 'cancelled']
let latest = 0 // numbers each search, so an older slow answer cannot replace a newer one

const label = (text) => String(text).replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase())
const when = (iso) => `${formatDate(iso)}, ${formatTime(iso)}`

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
    el('dd', { class: 'whitespace-pre-line break-words font-semibold' }, value))
}

function statusControl(o) {
  if (CLOSED.includes(o.status)) {
    return el('p', { class: 'text-sm text-ash-600' }, 'This order is closed, so its status cannot be changed.')
  }
  const selectId = `status-${o.id}`
  const select = el('select', { id: selectId, class: 'field' },
    ...STATUSES.map((s) => el('option', { value: s, ...(s === o.status ? { selected: true } : {}) }, label(s))))
  const button = el('button', { type: 'button', class: 'btn-primary' }, 'Update status')

  button.addEventListener('click', async () => {
    if (select.value === o.status) return
    if (CLOSED.includes(select.value) &&
        !window.confirm(`Mark ${o.reference} as ${label(select.value).toLowerCase()}? This cannot be undone.`)) return
    button.disabled = true
    actionError.hidden = true
    try {
      await adminApi(`/delivery-orders/${encodeURIComponent(o.id)}/status`, {
        method: 'POST',
        body: { status: select.value },
      })
      await run()
    } catch (err) {
      if (sessionEnded(err)) return
      actionError.textContent = err.message
      actionError.hidden = false
      button.disabled = false
    }
  })

  return el('div', { class: 'flex flex-wrap items-end gap-3' },
    el('div', { class: 'min-w-48' },
      el('label', { for: selectId, class: 'block text-sm font-semibold' }, 'Change status'), select),
    button)
}

function card(o) {
  return el('details', { class: 'card' },
    el('summary', { class: 'cursor-pointer' },
      el('span', { class: 'flex flex-wrap items-center justify-between gap-x-4 gap-y-1' },
        el('span', { class: 'font-bold' }, o.reference),
        el('span', { class: 'text-sm font-semibold' }, label(o.status))),
      el('span', { class: 'mt-1 block text-sm text-ash-600' }, `${o.senderName} to ${o.recipientName}`),
      el('span', { class: 'block text-sm text-ash-600' }, `Submitted ${when(o.createdAt)}`)),
    el('dl', { class: 'mt-4 grid gap-3 sm:grid-cols-2' },
      detail('Sender', `${o.senderName}, ${o.senderPhone}`),
      detail('Sender email', o.senderEmail),
      detail('Recipient', `${o.recipientName}, ${o.recipientPhone}`),
      detail('Pickup address', o.pickupAddress),
      detail('Delivery address', o.deliveryAddress),
      detail('Package', o.packageDescription),
      ...(o.instructions ? [detail('Instructions', o.instructions)] : []),
    ),
    el('div', { class: 'mt-4 border-t border-ash-100 pt-4' }, statusControl(o)),
  )
}

async function load(mine) {
  const params = new URLSearchParams()
  const q = form.elements.q.value.trim()
  if (q) params.set('q', q)
  if (form.elements.status.value) params.set('status', form.elements.status.value)

  const { orders } = await adminApi(`/delivery-orders${params.size ? `?${params}` : ''}`)
  if (mine !== latest) return

  clear(list)
  count.textContent = orders.length === 100
    ? 'Showing the 100 newest matches. Use the search to narrow them down.'
    : `${orders.length} order${orders.length === 1 ? '' : 's'} found.`
  if (orders.length === 0) {
    list.append(el('div', { class: 'card' }, el('p', { class: 'text-ash-600' }, 'No delivery orders match.')))
  } else {
    list.append(...orders.map(card))
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
    list.append(el('p', { role: 'alert' }, err.message || 'We could not load the delivery orders. Please try again.'))
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
form.elements.status.addEventListener('change', run)

async function init() {
  try {
    const staff = await startPage()
    if (!staff) return
        const wanted = new URLSearchParams(location.search).get('status')
    if (wanted && STATUSES.includes(wanted)) form.elements.status.value = wanted
    await run()
  } catch (err) {
    if (sessionEnded(err)) return
    clear(list)
    list.append(el('p', { role: 'alert' }, 'We could not check your sign-in. Please refresh the page.'))
  }
}

init()
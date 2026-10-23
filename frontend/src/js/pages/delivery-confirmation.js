import { api } from '../api/client.js'
import { API_URL } from '../config.js'
import { el, clear } from '../dom.js'
import { refreshIcons } from '../icons.js'

const box = document.querySelector('#order')
const contactBox = document.querySelector('#contact')

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
      el('a', { class: 'btn-primary mt-4', href: '/delivery.html' }, 'Back to delivery'),
    ),
  )
  refreshIcons()
}

function row(label, value) {
  return el('div', { class: 'border-b border-ash-100 py-3' },
    el('dt', { class: 'text-sm text-ash-600' }, label),
    el('dd', { class: 'mt-1 whitespace-pre-line font-semibold' }, value))
}

// Adds the order reference to the WhatsApp message and shows it by the call button
function setupContact(orderReference) {
  const wa = contactBox.querySelector('a[href^="https://wa.me/"]')
  if (wa) {
    const url = new URL(wa.href)
    const message = url.searchParams.get('text') ?? ''
    url.searchParams.set('text', `${message} Order reference: ${orderReference}`.trim())
    wa.href = url.href
  }
  document.querySelector('#contact-reference').textContent =
    `Please quote your order reference: ${orderReference}`
  contactBox.hidden = false
}

function render(o) {
  const pdfUrl = `${API_URL}/delivery-orders/${encodeURIComponent(o.reference)}/pdf?t=${encodeURIComponent(token)}`
  const printButton = el('button', { type: 'button', class: 'btn-outline' },
    el('i', { 'data-lucide': 'printer', class: 'h-5 w-5' }), 'Print')
  printButton.addEventListener('click', () => window.print())

  clear(box)
  box.append(
    el('div', { class: 'card overflow-hidden !p-0' },
      el('div', { class: 'bg-brand-700 p-6 text-white' },
        el('p', { class: 'flex items-center gap-2 font-semibold' },
          el('i', { 'data-lucide': 'circle-check', class: 'h-5 w-5' }), 'Delivery request received'),
        el('p', { class: 'mt-3 text-sm text-brand-100' }, 'Order reference'),
        el('p', { class: 'text-2xl font-bold' }, o.reference),
      ),
      el('div', { class: 'p-6' },
        el('dl', {},
          row('Status', o.status),
          row('Submitted', o.submittedOn),
          row('Sender', `${o.senderName}, ${o.senderPhone}`),
          row('Recipient', `${o.recipientName}, ${o.recipientPhone}`),
          row('Pickup address', o.pickupAddress),
          row('Delivery address', o.deliveryAddress),
          row('Package', o.packageDescription),
          ...(o.instructions ? [row('Instructions', o.instructions)] : []),
        ),
      ),
    ),
    el('div', { class: 'notice mt-6' },
      el('i', { 'data-lucide': 'info', class: 'mt-0.5 h-5 w-5 shrink-0 text-brand-700' }),
      el('p', {}, 'This is an order summary, not a receipt. No charge or delivery time has been confirmed yet. Our team will review your order and contact you. We are also emailing you a copy, so please check your spam folder if it does not arrive.'),
    ),
    el('div', { class: 'mt-6 flex flex-wrap gap-3 print:hidden' },
      el('a', { class: 'btn-primary', href: pdfUrl, target: '_blank', rel: 'noopener' },
        el('i', { 'data-lucide': 'download', class: 'h-5 w-5' }), 'Download PDF'),
      printButton,
    ),
    el('p', { class: 'mt-4 text-sm text-ash-600 print:hidden' },
      'Anyone with this link can see your order, so do not share it publicly.'),
  )
  setupContact(o.reference)
  refreshIcons()
}

async function init() {
  if (!reference || !token) {
    showProblem('Order not found', 'This link is incomplete. Please use the link from your confirmation.')
    return
  }
  try {
    const { order } = await api(`/delivery-orders/${encodeURIComponent(reference)}?t=${encodeURIComponent(token)}`)
    render(order)
  } catch (err) {
    if (err.status === 404) showProblem('Order not found', 'Please check the link you were given.')
    else showProblem('We could not load your order', err.message)
  }
}

init()
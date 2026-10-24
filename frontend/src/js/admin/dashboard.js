import { startPage } from './shell.js'
import { el, clear } from '../dom.js'
import { refreshIcons } from '../icons.js'

const content = document.querySelector('#content')

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

  clear(content)
  content.append(
    el('div', { class: 'card' },
      el('h1', { class: 'text-2xl font-bold' }, `Welcome, ${staff.fullName}`),
      el('p', { class: 'mt-2 text-ash-600' }, 'Bookings and delivery orders will appear here as we build them.'),
      el('a', { class: 'btn-primary mt-4', href: '/admin/trips.html' }, 'View trips'),
    ),
  )
  refreshIcons()
}

init()
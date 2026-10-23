import { requireSignIn, clearSession, getSession } from './adminApi.js'
import { el, clear } from '../dom.js'
import { refreshIcons } from '../icons.js'

const LOGIN = '/admin/login.html'
const content = document.querySelector('#content')

function signOut() {
  clearSession()
  location.replace(LOGIN)
}
document.querySelector('#sign-out').addEventListener('click', signOut)

// After signing out, the Back button can show a saved copy of this page
window.addEventListener('pageshow', (event) => {
  if (event.persisted && !getSession()) location.replace(LOGIN)
})

async function init() {
  let staff
  try {
    staff = await requireSignIn()
  } catch {
    clear(content)
    content.append(el('p', { role: 'alert' }, 'We could not check your sign-in. Please refresh the page.'))
    return
  }
  if (!staff) return

  document.querySelector('#staff-name').textContent = `${staff.fullName} (${staff.role})`
  clear(content)
  content.append(
    el('div', { class: 'card' },
      el('h1', { class: 'text-2xl font-bold' }, `Welcome, ${staff.fullName}`),
      el('p', { class: 'mt-2 text-ash-600' },
        'You are signed in. Trips, bookings and delivery orders will appear here as we build them.'),
    ),
  )
  refreshIcons()
}

init()
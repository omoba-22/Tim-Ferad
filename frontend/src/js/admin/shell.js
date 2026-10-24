import { requireSignIn, clearSession, getSession } from './adminApi.js'

const LOGIN = '/admin/login.html'

// Call first on every staff page. Returns the staff member, or null when the
// visitor is being sent to the login page.
export async function startPage() {
  document.querySelector('#sign-out').addEventListener('click', () => {
    clearSession()
    location.replace(LOGIN)
  })

  // After signing out, the Back button can show a saved copy of the page
  window.addEventListener('pageshow', (event) => {
    if (event.persisted && !getSession()) location.replace(LOGIN)
  })

  const staff = await requireSignIn()
  if (staff) document.querySelector('#staff-name').textContent = `${staff.fullName} (${staff.role})`
  return staff
}
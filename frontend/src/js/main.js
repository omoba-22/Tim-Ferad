import { refreshIcons } from './icons.js'

refreshIcons()

// --- Highlight the nav link for the page you are on ---------------------
// Booking, payment and ticket pages belong to the Travel section.
const SECTION_OF = {
  '/book.html': '/travel.html',
  '/payment-result.html': '/travel.html',
  '/ticket.html': '/travel.html',
}
const path = location.pathname.replace(/\/index\.html$/, '/')
const current = SECTION_OF[path] ?? path

document.querySelectorAll('[data-nav-link]').forEach((link) => {
  if (new URL(link.href).pathname === current) link.setAttribute('aria-current', 'page')
})

// --- Mobile menu ----------------------------------------------------------
const button = document.querySelector('[data-menu-button]')
const menu = document.querySelector('[data-menu]')

if (button && menu) {
  const openIcon = button.querySelector('[data-menu-open]')
  const closeIcon = button.querySelector('[data-menu-close]')

  const setOpen = (open) => {
    button.setAttribute('aria-expanded', String(open))
    menu.classList.toggle('hidden', !open)
    openIcon?.classList.toggle('hidden', open)
    closeIcon?.classList.toggle('hidden', !open)
  }

  button.addEventListener('click', () => {
    setOpen(button.getAttribute('aria-expanded') !== 'true')
  })

  // Escape closes the menu and puts focus back on the button
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') {
      setOpen(false)
      button.focus()
    }
  })
}

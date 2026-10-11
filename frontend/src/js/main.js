import '../css/main.css'

// Mobile menu toggle
const button = document.querySelector('[data-menu-button]')
const menu = document.querySelector('[data-menu]')

if (button && menu) {
  button.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') === 'true'
    button.setAttribute('aria-expanded', String(!open))
    menu.classList.toggle('hidden', open)
  })
}
import '../css/main.css'
import {
  createIcons, Bus, Package, Ticket, CreditCard, Search, Info,
  Phone, MessageCircle, Mail, MapPin, ArrowRight, Clock,
} from 'lucide'

// Turns <i data-lucide="phone"></i> into an inline SVG icon.
createIcons({
  icons: { Bus, Package, Ticket, CreditCard, Search, Info, Phone, MessageCircle, Mail, MapPin, ArrowRight, Clock },
  attrs: { 'aria-hidden': 'true' },
})

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
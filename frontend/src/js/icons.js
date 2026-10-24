import {
  createIcons, Bus, Package, Ticket, CreditCard, Search, Info, Phone, MessageCircle,
  Mail, MapPin, ArrowRight, Clock, CircleAlert, CircleCheck, Download, Printer, Users,
  Menu, X, LogOut, Ban,
} from 'lucide'

const icons = {
  Bus, Package, Ticket, CreditCard, Search, Info, Phone, MessageCircle,
  Mail, MapPin, ArrowRight, Clock, CircleAlert, CircleCheck, Download, Printer, Users,
  Menu, X, LogOut, Ban,
}

// Turns <i data-lucide="phone"></i> into an inline SVG icon. Call it again
// after adding new icons to the page with JavaScript.
export function refreshIcons() {
  createIcons({ icons, attrs: { 'aria-hidden': 'true' } })
}
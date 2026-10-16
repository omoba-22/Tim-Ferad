import { Router } from 'express'
import { checkBookingLimiter } from '../middleware/rateLimit.js'
import { getTicket } from '../services/tickets.js'
import { streamTicketPdf } from '../services/ticketPdf.js'

export const ticketsRouter = Router()

const REFERENCE = /^TF-[A-Z0-9]{10}$/

// The token comes in the ticket link (?t=...) or a header.
const tokenOf = (req) => {
  const header = req.get('x-booking-token')
  if (header) return header
  return typeof req.query.t === 'string' ? req.query.t : ''
}

ticketsRouter.get('/tickets/:reference', checkBookingLimiter, async (req, res, next) => {
  try {
    if (!REFERENCE.test(req.params.reference)) return res.status(404).json({ error: 'Ticket not found.' })
    const ticket = await getTicket(req.params.reference, tokenOf(req))
    res.set('Cache-Control', 'no-store')
    res.json({ ticket })
  } catch (err) {
    next(err)
  }
})

ticketsRouter.get('/tickets/:reference/pdf', checkBookingLimiter, async (req, res, next) => {
  try {
    if (!REFERENCE.test(req.params.reference)) return res.status(404).json({ error: 'Ticket not found.' })
    // Fetch (and authorize) BEFORE sending any headers, so errors stay clean JSON
    const ticket = await getTicket(req.params.reference, tokenOf(req))
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="ticket-${ticket.reference}.pdf"`,
      'Cache-Control': 'no-store',
    })
    streamTicketPdf(ticket, res)
  } catch (err) {
    next(err)
  }
})
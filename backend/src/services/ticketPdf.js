import PDFDocument from 'pdfkit'
import { fileURLToPath } from 'node:url'
import { company } from '../config/company.js'

// DejaVu Sans is embedded because PDF's built-in fonts cannot print the naira
// sign or Nigerian name characters such as ọ, ẹ and ṣ.
const fontPath = (file) =>
  fileURLToPath(new URL(`../../node_modules/dejavu-fonts-ttf/ttf/${file}`, import.meta.url))

const GREEN = '#1d5a37'
const INK = '#1c2222'
const MUTED = '#5b6464'

export function streamTicketPdf(ticket, res) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 50,
    info: { Title: `Ticket ${ticket.reference}`, Author: company.name },
  })
  doc.registerFont('Regular', fontPath('DejaVuSans.ttf'))
  doc.registerFont('Bold', fontPath('DejaVuSans-Bold.ttf'))
  doc.pipe(res)

  // Header band
  doc.rect(0, 0, doc.page.width, 90).fill(GREEN)
  doc.fillColor('#ffffff').font('Bold').fontSize(24).text(company.name, 50, 26)
  doc.font('Regular').fontSize(12).text('Travel ticket', 50, 58)

  // Reference
  doc.fillColor(MUTED).font('Regular').fontSize(9).text('BOOKING REFERENCE', 50, 118)
  doc.fillColor(INK).font('Bold').fontSize(22).text(ticket.reference, 50, 132)

  // Details
  let y = 185
  const row = (label, value) => {
    doc.fillColor(MUTED).font('Regular').fontSize(10).text(label, 50, y, { width: 150 })
    doc.fillColor(INK).font('Bold').fontSize(12).text(value, 210, y - 1, { width: 335 })
    y = Math.max(doc.y, y + 18) + 8
  }
  row('Route', `${ticket.from} to ${ticket.to}`)
  row('Date', ticket.date)
  row('Departure time', ticket.time)
  row('Departure point', ticket.departurePoint)
  row('Passengers', String(ticket.passengerCount))
  row('Fare per passenger', ticket.farePerPassenger)
  row('Total paid', ticket.total)
  row('Payment status', ticket.paymentStatus)

  // Passenger names
  doc.fillColor(MUTED).font('Regular').fontSize(10).text('PASSENGERS', 50, y + 12)
  doc.fillColor(INK).font('Regular').fontSize(12)
  ticket.passengers.forEach((name, i) => doc.text(`${i + 1}. ${name}`))

  // Notes (placeholders until the company supplies real text)
  doc.moveDown(2)
  doc.fillColor(MUTED).font('Regular').fontSize(10).text('TRAVEL NOTES')
  doc.fillColor(INK).fontSize(11).text(company.travelNotes)
  doc.moveDown()
  doc.fillColor(MUTED).fontSize(10).text(`Questions: ${company.supportPhone} / ${company.supportEmail}`)

  doc.end()
}
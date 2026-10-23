import PDFDocument from 'pdfkit'
import { fileURLToPath } from 'node:url'
import { company } from '../config/company.js'

const fontPath = (file) =>
  fileURLToPath(new URL(`../../node_modules/dejavu-fonts-ttf/ttf/${file}`, import.meta.url))

const GREEN = '#1d5a37'
const INK = '#1c2222'
const MUTED = '#5b6464'

export function streamDeliveryPdf(order, res) {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 50,
    info: { Title: `Delivery order ${order.reference}`, Author: company.name },
  })
  doc.registerFont('Regular', fontPath('DejaVuSans.ttf'))
  doc.registerFont('Bold', fontPath('DejaVuSans-Bold.ttf'))
  doc.pipe(res)

  // Header band
  doc.rect(0, 0, doc.page.width, 90).fill(GREEN)
  doc.fillColor('#ffffff').font('Bold').fontSize(24).text(company.name, 50, 26)
  doc.font('Regular').fontSize(12).text('Delivery order summary', 50, 58)

  // Reference
  doc.fillColor(MUTED).font('Regular').fontSize(9).text('ORDER REFERENCE', 50, 118)
  doc.fillColor(INK).font('Bold').fontSize(22).text(order.reference, 50, 132)

  // Fields flow down the page, so long text can continue onto a second page
  doc.x = 50
  doc.y = 175
  const field = (label, value) => {
    doc.moveDown(0.8)
    doc.fillColor(MUTED).font('Regular').fontSize(9).text(label.toUpperCase())
    doc.fillColor(INK).font('Regular').fontSize(12).text(value)
  }
  field('Status', order.status)
  field('Submitted', order.submittedOn)
  field('Sender', `${order.senderName}, ${order.senderPhone}`)
  field('Recipient', `${order.recipientName}, ${order.recipientPhone}`)
  field('Pickup address', order.pickupAddress)
  field('Delivery address', order.deliveryAddress)
  field('Package', order.packageDescription)
  if (order.instructions) field('Instructions', order.instructions)

  // Clear statement so this is never mistaken for a receipt
  doc.moveDown(2)
  doc.fillColor(INK).font('Bold').fontSize(11).text('This is an order summary, not a receipt.')
  doc.font('Regular').text(
    'No charge or delivery time has been confirmed yet. Our team will review your order.',
  )
  doc.moveDown()
  doc.fillColor(MUTED).fontSize(10).text(
    `Questions: ${company.supportPhone} / ${company.supportEmail}. Please quote ${order.reference}.`,
  )

  doc.end()
}
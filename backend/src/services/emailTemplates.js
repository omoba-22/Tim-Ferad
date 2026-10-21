import { env } from '../config/env.js'
import { deriveAccessToken } from '../utils/ids.js'

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function ticketLink(reference) {
  const token = deriveAccessToken(reference, env.ACCESS_TOKEN_SECRET)
  const origin = env.FRONTEND_ORIGIN.replace(/\/+$/, '')
  return `${origin}/ticket.html?ref=${encodeURIComponent(reference)}&t=${encodeURIComponent(token)}`
}

function detailLines(t) {
  return [
    ['Booking reference', t.reference],
    ['Route', `${t.from} to ${t.to}`],
    ['Date', t.date],
    ['Departure time', t.time],
    ['Departure point', t.departurePoint],
    ['Passengers', t.passengers.join(', ')],
    ['Total paid', t.total],
  ]
}

function htmlTable(rows) {
  const cells = rows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px 6px 0;color:#555">${escapeHtml(label)}</td>` +
        `<td style="padding:6px 0;font-weight:bold">${escapeHtml(value)}</td></tr>`,
    )
    .join('')
  return `<table role="presentation" style="border-collapse:collapse">${cells}</table>`
}

// Email to the customer
export function ticketEmail(t) {
  const link = ticketLink(t.reference)
  const rows = detailLines(t)

  const text = [
    'Your booking with Tim-Ferad is confirmed.',
    '',
    ...rows.map(([label, value]) => `${label}: ${value}`),
    '',
    `View or download your ticket: ${link}`,
    '',
    'Anyone with this link can see your ticket, so please do not share it publicly.',
  ].join('\n')

  const html =
    `<div style="font-family:Arial,sans-serif;font-size:16px;color:#222;max-width:560px">` +
    `<h1 style="font-size:20px;color:#166534">Your booking is confirmed</h1>` +
    htmlTable(rows) +
    `<p style="margin:24px 0"><a href="${escapeHtml(link)}" ` +
    `style="background:#166534;color:#fff;padding:12px 20px;text-decoration:none;border-radius:6px">` +
    `View your ticket</a></p>` +
    `<p style="font-size:14px;color:#555">If the button does not work, copy this link into your browser:<br>` +
    `${escapeHtml(link)}</p>` +
    `<p style="font-size:14px;color:#555">Anyone with this link can see your ticket, so please do not share it publicly.</p>` +
    `</div>`

  return { subject: `Your Tim-Ferad ticket ${t.reference}`, text, html }
}

// Email to the company (only queued when company_notification_email is set)
export function companyBookingEmail(t) {
  const rows = detailLines(t)
  const text = ['A new booking has been paid.', '', ...rows.map(([l, v]) => `${l}: ${v}`)].join('\n')
  const html =
    `<div style="font-family:Arial,sans-serif;font-size:16px;color:#222">` +
    `<h1 style="font-size:20px">New paid booking</h1>${htmlTable(rows)}</div>`
  return { subject: `New paid booking ${t.reference}`, text, html }
}
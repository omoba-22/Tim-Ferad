import { Router } from 'express'
import { z } from 'zod'
import { MAX_PASSENGERS_PER_BOOKING } from '../config/constants.js'
import { createBookingLimiter, checkBookingLimiter } from '../middleware/rateLimit.js'
import { createBooking, verifyBookingPayment, getBookingStatus } from '../services/bookings.js'

export const bookingsRouter = Router()

// .strict() rejects any field we did not list, so a caller cannot sneak in
// extra data such as a price or a payment status.
const createSchema = z.object({
  tripId: z.string().uuid(),
  passengers: z.array(z.object({ fullName: z.string().trim().min(1).max(100).transform((s) => s.normalize('NFC')) }).strict())
    .min(1).max(MAX_PASSENGERS_PER_BOOKING),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,100}$/),
}).strict()

const referenceSchema = z.string().regex(/^TF-[A-Z0-9]{10}$/)
const tokenOf = (req) => req.get('x-booking-token') ?? ''

bookingsRouter.post('/bookings', createBookingLimiter, async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'Please check the booking details and try again.' })
    }
    const result = await createBooking(parsed.data)
    res.status(201).json(result)
  } catch (err) {
    next(err)
  }
})

// The payment-result page calls this after Paystack sends the customer back.
bookingsRouter.post('/bookings/:reference/verify', checkBookingLimiter, async (req, res, next) => {
  try {
    const ref = referenceSchema.safeParse(req.params.reference)
    if (!ref.success) return res.status(404).json({ error: 'Booking not found.' })
    res.json(await verifyBookingPayment(ref.data, tokenOf(req)))
  } catch (err) {
    next(err)
  }
})

bookingsRouter.get('/bookings/:reference/status', checkBookingLimiter, async (req, res, next) => {
  try {
    const ref = referenceSchema.safeParse(req.params.reference)
    if (!ref.success) return res.status(404).json({ error: 'Booking not found.' })
    res.json(await getBookingStatus(ref.data, tokenOf(req)))
  } catch (err) {
    next(err)
  }
})
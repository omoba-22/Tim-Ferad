import { Router } from 'express'
import { z } from 'zod'
import { requireStaff } from '../middleware/auth.js'
import { listTrips, getTripOptions, createTrip, cancelTrip } from '../services/adminTrips.js'
import { listBookings } from '../services/adminBookings.js'

export const adminRouter = Router()

// Everything in this file requires a staff login.
adminRouter.use(requireStaff)

adminRouter.get('/me', (req, res) => {
  res.json({ staff: req.staff })
})

adminRouter.get('/trips', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store')
    res.json({ trips: await listTrips() })
  } catch (err) {
    next(err)
  }
})

adminRouter.get('/trip-options', async (req, res, next) => {
  try {
    res.set('Cache-Control', 'no-store')
    res.json(await getTripOptions())
  } catch (err) {
    next(err)
  }
})

// .strict() rejects any field we did not list (capacity and status are never taken from the browser)
const createTripSchema = z.object({
  routeId: z.string().uuid(),
  vehicleId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  fareNaira: z.string().trim().regex(/^\d{1,7}(\.\d{1,2})?$/),
  departurePoint: z.string().trim().max(200).transform((s) => s.normalize('NFC') || undefined).optional(),
}).strict()

adminRouter.post('/trips', async (req, res, next) => {
  try {
    const parsed = createTripSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'Please check the trip details and try again.' })
    }
    res.status(201).json(await createTrip(req.staff.id, parsed.data))
  } catch (err) {
    next(err)
  }
})

adminRouter.post('/trips/:id/cancel', async (req, res, next) => {
  try {
    const id = z.string().uuid().safeParse(req.params.id)
    if (!id.success) return res.status(404).json({ error: 'Trip not found.' })
    await cancelTrip(req.staff.id, id.data)
    res.json({ ok: true })
  } catch (err) {
    next(err)
  }
})

const bookingsQuery = z.object({
  q: z.string().trim().max(60).optional(),
  status: z.enum(['pending_payment', 'confirmed', 'expired']).optional(),
})

adminRouter.get('/bookings', async (req, res, next) => {
  try {
    const parsed = bookingsQuery.safeParse(req.query)
    if (!parsed.success) return res.status(400).json({ error: 'Please check the search and try again.' })
    res.set('Cache-Control', 'no-store')
    res.json({ bookings: await listBookings(parsed.data) })
  } catch (err) {
    next(err)
  }
})
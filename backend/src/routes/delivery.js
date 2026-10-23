import { Router } from 'express'
import { z } from 'zod'
import { createDeliveryLimiter } from '../middleware/rateLimit.js'
import { createDeliveryOrder } from '../services/deliveryOrders.js'

export const deliveryRouter = Router()

const text = (max) => z.string().trim().min(1).max(max).transform((s) => s.normalize('NFC'))
const phone = z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/)

// .strict() rejects any field we did not list (no price, status or reference from the browser)
const createSchema = z.object({
  senderName: text(100),
  senderPhone: phone,
  senderEmail: z.string().trim().toLowerCase().email().max(254),
  recipientName: text(100),
  recipientPhone: phone,
  pickupAddress: text(300),
  deliveryAddress: text(300),
  packageDescription: text(1000),
  instructions: z.string().trim().max(500).transform((s) => s.normalize('NFC') || undefined).optional(),
  idempotencyKey: z.string().regex(/^[A-Za-z0-9_-]{16,100}$/),
}).strict()

deliveryRouter.post('/delivery-orders', createDeliveryLimiter, async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body)
    if (!parsed.success) {
      return res.status(400).json({ error: 'Please check the delivery details and try again.' })
    }
    res.status(201).json(await createDeliveryOrder(parsed.data))
  } catch (err) {
    next(err)
  }
})
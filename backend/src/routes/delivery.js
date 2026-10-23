    import { Router } from 'express'
    import { z } from 'zod'
    import { createDeliveryLimiter, checkDeliveryLimiter } from '../middleware/rateLimit.js'
    import { createDeliveryOrder, getDeliveryOrder } from '../services/deliveryOrders.js'
    import { streamDeliveryPdf } from '../services/deliveryPdf.js'
    import { processOutbox } from '../services/outbox.js'

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

    const referenceSchema = z.string().regex(/^DL-[A-Z0-9]{10}$/)
    const tokenOf = (req) =>
    typeof req.query.t === 'string' ? req.query.t : (req.get('x-delivery-token') ?? '')

    deliveryRouter.post('/delivery-orders', createDeliveryLimiter, async (req, res, next) => {
    try {
        const parsed = createSchema.safeParse(req.body)
        if (!parsed.success) {
        return res.status(400).json({ error: 'Please check the delivery details and try again.' })
        }
            const result = await createDeliveryOrder(parsed.data)
        // Send the emails now, without making the customer wait. The tick retries if this fails.
        processOutbox().catch((err) => console.error('Outbox after delivery order failed:', err.message))
        res.status(201).json(result)
    } catch (err) {
        next(err)
    }
    })

    deliveryRouter.get('/delivery-orders/:reference', checkDeliveryLimiter, async (req, res, next) => {
    try {
        const ref = referenceSchema.safeParse(req.params.reference)
        if (!ref.success) return res.status(404).json({ error: 'Delivery order not found.' })
        const order = await getDeliveryOrder(ref.data, tokenOf(req))
        res.set('Cache-Control', 'no-store')
        res.json({ order })
    } catch (err) {
        next(err)
    }
    })

    deliveryRouter.get('/delivery-orders/:reference/pdf', checkDeliveryLimiter, async (req, res, next) => {
    try {
        const ref = referenceSchema.safeParse(req.params.reference)
        if (!ref.success) return res.status(404).json({ error: 'Delivery order not found.' })
        // Authorize BEFORE sending any headers, so errors stay clean JSON
        const order = await getDeliveryOrder(ref.data, tokenOf(req))
        res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="${order.reference}.pdf"`,
        'Cache-Control': 'no-store',
        })
        streamDeliveryPdf(order, res)
    } catch (err) {
        next(err)
    }
    })
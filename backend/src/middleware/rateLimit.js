import rateLimit from 'express-rate-limit'

const make = (limit, windowMinutes, options = {}) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests. Please wait a few minutes and try again.' },
    ...options,
  })

export const createBookingLimiter = make(10, 15)
export const checkBookingLimiter = make(60, 15)
export const createDeliveryLimiter = make(10, 15)
export const checkDeliveryLimiter = make(60, 15)
// Only failed sign-ins count, so staff behind one office connection are not locked out by each other
export const adminLoginLimiter = make(10, 15, { skipSuccessfulRequests: true })
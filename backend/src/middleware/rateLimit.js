import rateLimit from 'express-rate-limit'

const make = (limit, windowMinutes) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many requests. Please wait a few minutes and try again.' },
  })

export const createBookingLimiter = make(10, 15)
export const checkBookingLimiter = make(60, 15)
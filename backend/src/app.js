import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import { env } from './config/env.js'
import { supabase } from './db/supabase.js'
import { AppError } from './utils/errors.js'
import { publicRouter } from './routes/public.js'
import { bookingsRouter } from './routes/bookings.js'
import { adminRouter } from './routes/admin.js'
import { webhooksRouter } from './routes/webhooks.js'
import { internalRouter } from './routes/internal.js'

export const app = express()

app.disable('x-powered-by')
// Behind Render's proxy, so rate limits see the real visitor address
if (env.NODE_ENV === 'production') app.set('trust proxy', 1)
app.use(helmet())
app.use(cors({ origin: env.FRONTEND_ORIGIN }))

app.use('/api', webhooksRouter)
// NOTE: the Paystack webhook route (step 4.3) needs the raw request body,
// so it will be mounted BEFORE this line.
app.use(express.json({ limit: '100kb' }))

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

app.get('/api/health/db', async (req, res, next) => {
  try {
    const { error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 })
    if (error) throw error
    res.json({ status: 'ok', database: 'reachable' })
  } catch (err) {
    next(err)
  }
})

app.use('/api', publicRouter)
app.use('/api', bookingsRouter)
app.use('/api/admin', adminRouter)
app.use('/api/internal', internalRouter)

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// One place for errors. Details go to the server log, never to the visitor.
app.use((err, req, res, next) => {
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message })
  }
  // Bad JSON, oversized body and similar client mistakes
  if (err.status && err.status >= 400 && err.status < 500) {
    return res.status(err.status).json({ error: 'Invalid request' })
  }
  console.error('Unhandled error:', err.message)
  res.status(500).json({ error: 'Something went wrong' })
})
// Development-only: print one line per request (never the body or any token)
if (env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    res.on('close', () => {
      console.log(req.method, req.path, res.statusCode, res.writableFinished ? '' : '(connection closed early)')
    })
    next()
  })
}
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import { env } from './config/env.js'
import { supabase } from './db/supabase.js'
import { publicRouter } from './routes/public.js'
import { adminRouter } from './routes/admin.js'

export const app = express()

app.disable('x-powered-by')
app.use(helmet())
app.use(cors({ origin: env.FRONTEND_ORIGIN }))

// NOTE: the Paystack webhook route (Stage 4) needs the raw request body,
// so it will be mounted BEFORE this line.
app.use(express.json({ limit: '100kb' }))

// Is the server running?
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' })
})

// Can the server reach the database?
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
app.use('/api/admin', adminRouter)
// Unknown routes
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' })
})

// One place for errors. Details go to the server log, never to the visitor.
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message)
  res.status(500).json({ error: 'Something went wrong' })
})
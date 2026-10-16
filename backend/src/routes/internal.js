import { Router } from 'express'
import { timingSafeEqual } from 'node:crypto'
import { env } from '../config/env.js'
import { runTick } from '../jobs/tick.js'

export const internalRouter = Router()

function secretMatches(provided) {
  const a = Buffer.from(provided)
  const b = Buffer.from(env.CRON_SECRET)
  return a.length === b.length && timingSafeEqual(a, b)
}

// Called by the scheduler. Protected by a shared secret.
internalRouter.post('/tick', async (req, res, next) => {
  try {
    if (!secretMatches(req.get('x-cron-secret') ?? '')) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    res.json(await runTick())
  } catch (err) {
    next(err)
  }
})
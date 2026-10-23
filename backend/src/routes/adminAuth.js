import { Router } from 'express'
import { z } from 'zod'
import { adminLoginLimiter } from '../middleware/rateLimit.js'
import { staffLogin } from '../services/adminAuth.js'

export const adminAuthRouter = Router()

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(200),
}).strict()

adminAuthRouter.post('/login', adminLoginLimiter, async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: 'Enter your email and password.' })
    const result = await staffLogin(parsed.data.email, parsed.data.password)
    res.set('Cache-Control', 'no-store')
    res.json(result)
  } catch (err) {
    next(err)
  }
})
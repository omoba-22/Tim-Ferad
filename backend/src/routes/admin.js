import { Router } from 'express'
import { requireStaff } from '../middleware/auth.js'

export const adminRouter = Router()

// Everything in this file requires a staff login.
adminRouter.use(requireStaff)

adminRouter.get('/me', (req, res) => {
  res.json({ staff: req.staff })
})
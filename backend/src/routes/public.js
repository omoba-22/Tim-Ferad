import { Router } from 'express'
import { supabase } from '../db/supabase.js'
import { z } from 'zod'

export const publicRouter = Router()

// Active routes for the Travel page
publicRouter.get('/routes', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('routes')
      .select('id, origin_city, destination_city, default_departure_point')
      .eq('is_active', true)
      .order('origin_city')
    if (error) throw error
    res.json({ routes: data })
  } catch (err) {
    next(err)
  }
})

function isRealDate(value) {
  try {
    return new Date(`${value}T00:00:00Z`).toISOString().startsWith(value)
  } catch {
    return false
  }
}

const tripsQuery = z.object({
  routeId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(isRealDate),
})

// Bookable trips for a route and date, with places remaining
publicRouter.get('/trips', async (req, res, next) => {
  try {
    const parsed = tripsQuery.safeParse(req.query)
    if (!parsed.success) return res.status(400).json({ error: 'Invalid search' })

    const { data, error } = await supabase.rpc('list_available_trips', {
      p_route_id: parsed.data.routeId,
      p_date: parsed.data.date,
    })
    if (error) throw error
    res.json({ trips: data })
  } catch (err) {
    next(err)
  }
})
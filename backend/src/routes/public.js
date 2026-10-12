import { Router } from 'express'
import { supabase } from '../db/supabase.js'

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
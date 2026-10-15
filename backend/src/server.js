import { app } from './app.js'
import { env } from './config/env.js'

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason)
})
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err)
  process.exit(1)
})

app.listen(env.PORT, () => {
  console.log(`API running on http://localhost:${env.PORT}`)
})
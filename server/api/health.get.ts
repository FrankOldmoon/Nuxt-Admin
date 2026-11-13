// GET /api/health
// Lightweight liveness/readiness probe for load balancers, Docker and PM2.
// Returns 503 when the database is unreachable; realtime driver is reported
// for operational visibility.
import { pool } from '../database'

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const startedAt = Date.now()
  let database: 'ok' | 'error' = 'ok'
  try {
    await pool.query('SELECT 1')
  } catch {
    database = 'error'
    setResponseStatus(event, 503)
  }

  const driver = (process.env.REALTIME_DRIVER ?? 'memory').toLowerCase()

  return {
    status: database === 'ok' ? 'ok' : 'degraded',
    time: new Date().toISOString(),
    uptimeSeconds: Math.round(process.uptime()),
    checks: { database },
    realtime: { driver: driver === 'postgres' ? 'postgres' : 'memory' },
    latencyMs: Date.now() - startedAt
  }
})

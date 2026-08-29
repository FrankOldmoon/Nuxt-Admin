import { Pool } from 'pg'

interface DbConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
}

export function parseDbUrl(url: string): DbConfig {
  const u = new URL(url)
  return {
    host: u.hostname,
    port: Number(u.port) || 5432,
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, '')
  }
}

// Connect to the 'postgres' maintenance DB and create the target DB if missing.
export async function ensureDatabase(connectionString: string): Promise<boolean> {
  const cfg = parseDbUrl(connectionString)

  const adminPool = new Pool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: 'postgres',
    connectionTimeoutMillis: 5000
  })

  try {
    const { rows } = await adminPool.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [cfg.database]
    )

    if (rows.length > 0) {
      console.log(`[database] Database "${cfg.database}" already exists`)
      return false
    }

    // CREATE DATABASE does not support parameters; quote the identifier safely.
    const identifier = cfg.database.replace(/"/g, '""')
    await adminPool.query(`CREATE DATABASE "${identifier}"`)
    console.log(`[database] Created database "${cfg.database}"`)
    return true
  } finally {
    await adminPool.end()
  }
}

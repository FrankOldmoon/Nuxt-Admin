import 'dotenv/config'

// Ensure the test environment has a usable database connection string.
// Pure-function tests mock db, but some modules (database/index.ts) read DATABASE_URL at import time.
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'postgres://postgres:postgres@localhost:5432/nuxt_ai'
}
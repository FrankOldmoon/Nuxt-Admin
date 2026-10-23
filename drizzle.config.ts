import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './server/database/schema.ts',
  out: './server/database/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/nuxt_ai'
  },
  // Keep this in sync with the runtime migrate() config in server/plugins/database.ts,
  // so the CLI and the runtime do not use different migration record tables.
  migrations: {
    schema: 'public',
    table: '__drizzle_migrations'
  },
  verbose: true,
  strict: true
})

import 'dotenv/config'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './server/database/schema.ts',
  out: './server/database/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/nuxt_ai'
  },
  // 与 server/plugins/database.ts 运行时 migrate() 的配置保持一致，
  // 避免 CLI 与运行时各自使用不同的迁移记录表。
  migrations: {
    schema: 'public',
    table: '__drizzle_migrations'
  },
  verbose: true,
  strict: true
})

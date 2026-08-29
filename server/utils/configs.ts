import { sql } from 'drizzle-orm'
import { db } from './db'
import { configs } from '../database/schema'

export type ConfigRow = typeof configs.$inferSelect

// --- In-memory cache (single-node). Bounded by TTL; invalidated on writes. ---
const CONFIG_CACHE_TTL_MS = 30_000
let cache: { rows: ConfigRow[], ts: number } | null = null

function invalidateConfigCache(): void {
  cache = null
}

async function getAllConfigsCached(): Promise<ConfigRow[]> {
  const now = Date.now()
  if (cache && now - cache.ts < CONFIG_CACHE_TTL_MS) {
    return cache.rows
  }
  const rows = await db.select().from(configs).orderBy(configs.key)
  cache = { rows, ts: now }
  return rows
}

export async function getAllConfigs(): Promise<ConfigRow[]> {
  return getAllConfigsCached()
}

export async function getConfig(key: string): Promise<ConfigRow | null> {
  const rows = await getAllConfigsCached()
  return rows.find(r => r.key === key) ?? null
}

export async function upsertConfig(input: {
  key: string
  value: string
  type?: string
  description?: string
}): Promise<ConfigRow> {
  const [row] = await db.insert(configs)
    .values({
      key: input.key,
      value: input.value,
      type: input.type ?? 'string',
      description: input.description ?? null
    })
    .onConflictDoUpdate({
      target: configs.key,
      set: {
        value: input.value,
        type: input.type ?? undefined,
        description: input.description ?? undefined,
        updatedAt: sql`now()`
      }
    })
    .returning()
  if (!row) throw new Error('Failed to upsert config')
  // Refresh cache so subsequent reads see the new value immediately.
  invalidateConfigCache()
  return row
}

export async function getConfigValue<T = string>(key: string, fallback: T): Promise<T> {
  const row = await getConfig(key)
  if (!row) return fallback
  switch (row.type) {
    case 'boolean': return (row.value === 'true') as unknown as T
    case 'number': return Number(row.value) as unknown as T
    default: return row.value as unknown as T
  }
}

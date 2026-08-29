/**
 * Blog module — database migrations.
 *
 * Kept intentionally simple and self-contained:  instead of depending on the
 * host's folder-based drizzle migrator (which tracks a shared migration table),
 * this module applies its own idempotent DDL against the shared connection.
 * Every statement is `IF NOT EXISTS`, so the module is safe to start on an
 * existing database and to re-run on every boot as an upgrade path.
 *
 * The `pool` comes from the host project (imported via a path into the host's
 * server/ directory) — the module reuses the host connection, it never opens
 * its own.
 */
import { pool } from '../../../../server/database'

const DDL = `
CREATE TABLE IF NOT EXISTS categories (
  id          serial PRIMARY KEY,
  name        varchar(120)  NOT NULL,
  slug        varchar(160)  NOT NULL UNIQUE,
  description text,
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS categories_slug_idx ON categories (slug);

CREATE TABLE IF NOT EXISTS posts (
  id               serial PRIMARY KEY,
  title            varchar(255) NOT NULL,
  slug             varchar(255) NOT NULL UNIQUE,
  excerpt          text,
  content_markdown text,
  cover_url        text,
  status           varchar(32)  NOT NULL DEFAULT 'draft',
  category_id      integer REFERENCES categories(id) ON DELETE SET NULL,
  -- author_id intentionally keeps NO database-level FK to the host
  -- users table: the module owns its tables, so it must not depend on the
  -- host migration having run first (host/layer boot order is not guaranteed).
  -- The relation is still declared in schema.ts so the host CRUD resolves it
  -- as a relation field (value/label), without a DB constraint.
  author_id        integer,
  published_at     timestamptz,
  created_at       timestamptz  NOT NULL DEFAULT now(),
  updated_at       timestamptz  NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);
CREATE INDEX IF NOT EXISTS posts_slug_idx    ON posts (slug);
CREATE INDEX IF NOT EXISTS posts_status_idx  ON posts (status);
CREATE INDEX IF NOT EXISTS posts_category_idx ON posts (category_id);
CREATE INDEX IF NOT EXISTS posts_author_idx  ON posts (author_id);
`

/**
 * Apply the blog schema (idempotent). Safe to call on every server boot.
 */
export async function runBlogMigrations(): Promise<void> {
  await pool.query(DDL)
}
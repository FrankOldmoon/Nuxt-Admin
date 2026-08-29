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
  url         varchar(160)  NOT NULL UNIQUE,
  description text,
  created_at  timestamptz   NOT NULL DEFAULT now(),
  updated_at  timestamptz   NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS categories_url_idx ON categories (url);

CREATE TABLE IF NOT EXISTS posts (
  id               serial PRIMARY KEY,
  title            varchar(255) NOT NULL,
  url              varchar(255) NOT NULL UNIQUE,
  excerpt          text,
  content_markdown text,
  cover_url        text,
  tags             jsonb        NOT NULL DEFAULT '[]',
  status           varchar(32)  NOT NULL DEFAULT 'draft',
  view_count       integer      NOT NULL DEFAULT 0,
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
CREATE INDEX IF NOT EXISTS posts_url_idx    ON posts (url);
CREATE INDEX IF NOT EXISTS posts_status_idx  ON posts (status);
CREATE INDEX IF NOT EXISTS posts_category_idx ON posts (category_id);
CREATE INDEX IF NOT EXISTS posts_author_idx  ON posts (author_id);

-- Upgrade path for databases where the posts table already exists (created
-- before the tags column was introduced): ALTER is idempotent.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]';

-- Upgrade path: view_count column (for views-based sorting).
ALTER TABLE posts ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;

-- Upgrade path: the slug column was renamed to url. On a database that predates
-- the rename, the slug column still exists and carries the data, so move it.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='posts' AND column_name='slug') THEN
    ALTER TABLE posts RENAME COLUMN slug TO url;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='categories' AND column_name='slug') THEN
    ALTER TABLE categories RENAME COLUMN slug TO url;
  END IF;
END $$;
`

/**
 * Apply the blog schema (idempotent). Safe to call on every server boot.
 */
export async function runBlogMigrations(): Promise<void> {
  await pool.query(DDL)
}
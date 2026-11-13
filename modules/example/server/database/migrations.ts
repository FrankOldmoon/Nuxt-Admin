import type { ModuleMigration } from '../../../../server/sdk'

/** Minimal executor shape for raw SQL migrations (pg client or pool). */
interface SqlExecutor {
  query: (text: string) => Promise<unknown>
}

/**
 * The example module owns its table: it is created by this module migration,
 * not by the host Drizzle history. `IF NOT EXISTS` keeps re-runs idempotent.
 */
export const exampleMigrations: ModuleMigration[] = [
  {
    id: 'example:001-create-notes',
    checksum: '1',
    async up(executor) {
      const client = executor as SqlExecutor
      await client.query(`
        CREATE TABLE IF NOT EXISTS example_notes (
          id              serial PRIMARY KEY,
          organization_id integer NOT NULL,
          title           varchar(160) NOT NULL,
          body            text,
          created_by      integer,
          created_at      timestamptz NOT NULL DEFAULT now(),
          updated_at      timestamptz NOT NULL DEFAULT now(),
          deleted_at      timestamptz
        );
        CREATE INDEX IF NOT EXISTS example_notes_organization_idx ON example_notes (organization_id);
      `)
    }
  }
]

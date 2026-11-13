import type { ModuleMigration } from '../../../../server/core/moduleSdk'

interface SqlExecutor {
  query: (text: string) => Promise<unknown>
}

/** SIS demo owns its tables; `IF NOT EXISTS` keeps re-runs idempotent. */
export const sisMigrations: ModuleMigration[] = [
  {
    id: 'sis-demo:001-create-tables',
    async up(executor) {
      const client = executor as SqlExecutor
      await client.query(`
        CREATE TABLE IF NOT EXISTS sis_classes (
          id              serial PRIMARY KEY,
          organization_id integer NOT NULL,
          name            varchar(120) NOT NULL,
          grade           varchar(40),
          created_at      timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS sis_classes_organization_idx ON sis_classes (organization_id);

        CREATE TABLE IF NOT EXISTS sis_students (
          id              serial PRIMARY KEY,
          organization_id integer NOT NULL,
          class_id        integer,
          name            varchar(120) NOT NULL,
          student_no      varchar(40) NOT NULL,
          created_at      timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS sis_students_organization_idx ON sis_students (organization_id);
        CREATE INDEX IF NOT EXISTS sis_students_class_idx ON sis_students (class_id);

        CREATE TABLE IF NOT EXISTS sis_teacher_assignments (
          id               serial PRIMARY KEY,
          organization_id  integer NOT NULL,
          teacher_user_id  integer NOT NULL,
          class_id         integer NOT NULL,
          created_at       timestamptz NOT NULL DEFAULT now()
        );
        CREATE UNIQUE INDEX IF NOT EXISTS sis_teacher_assignments_teacher_class_idx
          ON sis_teacher_assignments (teacher_user_id, class_id);
        CREATE INDEX IF NOT EXISTS sis_teacher_assignments_organization_idx
          ON sis_teacher_assignments (organization_id);
      `)
    }
  }
]

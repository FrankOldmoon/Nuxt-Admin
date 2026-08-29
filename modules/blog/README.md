# Blog module — reference for building decoupled modules

This folder is an **independent Nuxt layer** that mounts onto the host admin
project. It owns everything blog-related — pages, API, database schema +
migrations and i18n — and contains **zero** blog references inside the host
codebase. Use it as a template when adding a new module (e.g. `modules/forum`,
`modules/ecommerce`).

## How it is mounted

The host project only adds one line in its root `nuxt.config.ts`:

```ts
extends: ['./modules/blog']
```

Nothing else in the host knows about `blog`. Every future module follows the
same pattern.

## Directory anatomy

```
modules/blog/
├── nuxt.config.ts              # Declares this layer's own i18n locale files
├── i18n/locales/{en,zh}.json   # Module i18n (dashboard tables/fields + UI keys)
├── app/
│   ├── pages/blog/             # Public front pages (fully independent routes)
│   ├── composables/useBlog.ts  # SSR-friendly data fetching + formatting
├── server/
│   ├── database/
│   │   ├── schema.ts           # Drizzle table definitions (module-owned)
│   │   └── migrate.ts          # Idempotent DDL migrations (module-owned)
│   ├── api/blog/*              # Module's own endpoints
│   ├── utils/fields.ts         # TableMeta for the host generic dashboard CRUD
│   └── plugins/blog.ts         # Startup: register schema+tables, seed, merge menu
```

## The blog→host seams

A module is allowed to reference the host, but **only via explicit paths into
the host's `server/`** — and it must never redefine a host domain. This module
does exactly three things against the host:

| Purpose | Host import |
| --- | --- |
| Reuse the shared DB connection | `import { db, pool } from '../../../../server/database'` |
| Reference a host table (e.g. `users` for `authorId`) | `import { users } from '../../../../server/database/schema'` |
| Plug into the generic dashboard | `import { registerDrizzleSchema, registerDashboardTable } from '../../../../server/utils/dashboard/tables'` |

The `server/plugins/blog.ts` is the key integration point. It registers the
module's schema and tables at startup so the host's generic CRUD and sidebar
menu serve them without any host changes:

```ts
registerDrizzleSchema(blogSchema)                      // auto-discover tables
registerDashboardTable({ meta: postMeta, getTable: () => blogSchema.posts }, { menuOrder: 70 })
registerDashboardTable({ meta: categoryMeta, getTable: () => blogSchema.categories }, { menuOrder: 80 })
// + merge the two entries into configs.dashboard.menu, + idempotent seed
```

## Own your schema, reuse the host's machinery

- **Schema + migrations live here.** `migrate.ts` runs idempotent
  `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`
  against the host connection `pool`. This avoids colliding with the host's
  folder-based migrator and is safe to re-run every boot.
- **`author_id` has no DB-level FK** to the host `users` table on purpose:
  it cannot depend on the host migration having run first. The ORM relation is
  still declared in `schema.ts`, so the generic CRUD resolves it as a relation
  field without a DB constraint.
- **Zone-free dashboard CRUD.** Returning `custom: false` in `fields.ts`
  gives you the host's generic list/form/detail, advanced filters, soft-delete
  (auto-detected from `deletedAt`) and per-field labels resolved from your own
  i18n (`dashboard.tables.<table>` / `dashboard.fields.<table>.<field>`).
- **Public front pages** (`app/pages/blog/*`) run their own routes and reuse
  host UI (`UContainer`, `UCard`) and `BaseMarkdownViewer`; their i18n comes
  from this module's locale files.

## Adding a new column (e.g. the `tags` example)

1. `schema.ts` — add the column, e.g. `tags: jsonb('tags').$type<string[]>().notNull().default([])`.
2. `migrate.ts` — add it to the `CREATE TABLE` block **and** an idempotent
   `ALTER TABLE posts ADD COLUMN IF NOT EXISTS tags jsonb NOT NULL DEFAULT '[]';`
   for databases that already have the table.
3. `utils/fields.ts` — add a `FieldMeta` entry (type `tags`, `text`, `select`, …).
4. `i18n/locales/{en,zh}.json` — add `dashboard.fields.posts.tags`.

## Copying for a new module

1. Copy this folder to `modules/<name>`, rename package-scoped identifiers.
2. Update the host: replace `extends: ['./modules/blog']` (or add another line).
3. Edit `server/plugins/<name>.ts` to register your schema/tables/menu/seed.
4. Keep every host import relative and commented; never add `<name>` text into
   `app/`, `server/`, or `i18n/` of the host.
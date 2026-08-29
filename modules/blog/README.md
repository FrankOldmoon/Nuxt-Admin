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

## Creating a new table (end to end)

A table becomes fully editable in the host's generic dashboard (list, filters,
sorting, add/edit form, detail, soft-delete, seed, import/export, RBAC) with
**no host code changes** — you only declare metadata. Four files are involved:

```
schema.ts   →  migrate.ts   →  utils/fields.ts  →  i18n/locales/*.json
（列定义）      （建表语句）        （FieldMeta 元数据）        （列标签文案）
```

1. **`database/schema.ts`** — export a `pgTable`. Columns use Drizzle types:
   `serial`, `integer`, `varchar`, `text`, `boolean`, `date`, `time`, `timestamp`,
   `jsonb`, `doublePrecision`. Add `deletedAt: timestamp(...)` for soft-delete
   (the generic CRUD auto-enables it).
2. **`database/migrate.ts`** — add a `CREATE TABLE IF NOT EXISTS ...;` block and
   (for existing DBs) matching `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...;`
   statements, then call it from `server/plugins/<name>.ts` during startup.
3. **`server/utils/fields.ts`** — export a `TableMeta` and pass it to
   `registerDashboardTable({ meta, getTable: () => schema.theTable }, { menuOrder })`.
4. **`i18n/locales/*.json`** — add `dashboard.tables.<table>` (list/menu label)
   and `dashboard.fields.<table>.<key>` (field labels).

## Writing column metadata so the CRUD auto-recognises it

Every column gets a **`FieldMeta`** entry whose `type` drives the entire UI
rendering automatically — form input, table cell, detail label, filter
operators and the type-driven seeder. Choose the type that matches the column:

| `type` | Database column | Form control | Notes |
| --- | --- | --- | --- |
| `text` | `varchar/text` | text input | truncated cell |
| `textarea` | `text` | multiline textarea | multi-line cell |
| `markdown` | `text` | tall monospace textarea | **detail auto-renders** via `BaseMarkdownViewer` |
| `number` | `int/float` | number input | |
| `boolean` | `boolean` | switch | |
| `date` | `date` | date picker | |
| `datetime` | `timestamp` | datetime-local | stores ISO string |
| `time` | `time` | time input | |
| `select` | `varchar/number` | dropdown of `options` | must supply `options` |
| `relation` | `integer FK` | dropdown from related table | needs `relation: { table, labelKey, valueKey }` |
| `image` | `varchar path` | uploader + preview | served via `/api/files/serve/` |
| `file` / `files` | `varchar path` / `jsonb[]` | uploader (+ multi) | |
| `hyperlink` | `varchar` | URL input | clickable link cell/URL form |
| `tags` | `jsonb string[]` | tag input | badge cell, `@>` filters |
| `json` | `jsonb` | JSON textarea | code cell |
| `many-to-many` | pivot table | multi-select | needs `userIds`-style virtual field (see below) |
| `password` | `varchar hash` | password input | only set on create |

Per-field flags: `nullable`, `showInForm`, `showInTable`, `showInDetail`,
`editable`, `validation` (`required`, `maxLength`, `min`, `max`, `pattern`),
`helpText`, `placeholder`, `widthClass`, plus a per-field `#form-<key>` /
`#table-<key>` / `#detail-<key>` slot if you need a bespoke widget.

**Custom getter/setter transforms** — if a column's stored value differs from
what should be displayed/edited, set `getter` / `setter` (a *string key*) on the
`FieldMeta`, then register the actual functions via `registerFieldTransform(key,
{ getter, setter })` (see `app/composables/useFieldTransform.ts`). Cells &
detail render through the getter automatically; saving the form runs the setter
before persistence. Example (main project `templates.price`):
```ts
{ key: 'price', type: 'number', ..., getter: 'currency', setter: 'currency' }
// app/app.vue
registerFieldTransform('currency', {
  getter: (v) => (typeof v === 'number' ? `¥${v.toFixed(2)}` : v),
  setter: (v) => (typeof v === 'string' ? Number(v.replace(/[^\d.-]/g, '')) : v),
})
```
This works for module tables too — register the transform in your module's
frontend (`app/plugins/*` or a component `setup`).

`features` on the `TableMeta` configures list behaviour:
- `softDelete: true` — restore/trash UI (also auto-detected from `deletedAt`).
- `search: ['title', 'url']` — which columns the top search box matches.
- `defaultSort`.
- `detail: false` — hide the view-detail action.
- `dataScope: { ownerColumn: 'authorId' }` — together with a role whose
  `dataScope: 'self'`, non-admins only see/edit their own rows.

> **many-to-many:** define a pivot `pgTable` with two `*_id` FKs (e.g.
> `post_users` with `post_id`, `user_id`). The host auto-discovers it and adds
> a virtual `type: 'many-to-many'` field; add a matching `FieldMeta` entry
> (e.g. `{ key: 'users', type: 'many-to-many', relation: {...} }`) to make it
> editable in the form.

## Writing a seed file (type-driven by default)

Every generic table gets a **Seed button** (top-right of the dashboard, next to
Export) for free. It posts `{ count }` to `/api/dashboard/data/<table>/seed`;
by default that endpoint generates rows from the **column metadata** — each
field type produces a believable value:

- `text`/`textarea`/`markdown` — generated words / markdown doc
- `number` — random int; `boolean` — coin flip
- `date`/`datetime` — recent past date
- `select` — random option; `relation` — random existing related row
- `tags`/`json` — generated array / object
- `image`/`file`/`files` — null (nothing to upload for fake data)

Because seeding is **driven purely by `FieldMeta.type`**, a new table becomes
seedable with **zero extra seed code** — you only need to declare good column
types. For richer, table-specific content you can override the seeder: add a
`seed(event)` hook to a `TableCrudHandler` in
`server/utils/dashboard/tableOverrides/<table>.ts` (register it in
`tableOverrides.ts`), which receives the raw h3 `event` and returns the same
`{ inserted, ids }` shape. The generic behaviour runs whenever no override
exists. (See the seed implementation in `server/utils/dashboard/crudService.ts`:
`makeSeedRow` + `seedTable`.)

## Copying for a new module

1. Copy this folder to `modules/<name>`, rename package-scoped identifiers.
2. Update the host: replace `extends: ['./modules/blog']` (or add another line).
3. Edit `server/plugins/<name>.ts` to register your schema/tables/menu/seed.
4. Keep every host import relative and commented; never add `<name>` text into
   `app/`, `server/`, or `i18n/` of the host.
# Nuxt Admin

A general-purpose admin framework built on **Nuxt 4 + Nuxt UI**. The core highlight is the **metadata-driven generic CRUD**: define a single Drizzle table and automatically get a complete back-office experience — list, form, detail, filters, sorting, import/export, soft delete — without writing any pages or API endpoints for that table. Clear **modular extension points** are also provided, so business sub-modules (e.g. question banks, teaching) can plug in easily.

> This repository is the **admin base**; other business modules (teaching, question banks, etc.) plug in through the interfaces described in the "Modular Extensions" section (`registerDrizzleSchema` / `registerDashboardTable`).

---

## Tech Stack

| Category | Technology |
| --- | --- |
| Frontend framework | Nuxt 4, Vue 3, TypeScript, Tailwind CSS 4 |
| UI components | Nuxt UI v4, Iconify (lucide / simple-icons) |
| SSR / server | Nitro (including OpenAPI, WebSocket) |
| Database | PostgreSQL, Drizzle ORM (`@nuxtjs/i18n` v10 internationalization) |
| Rich text / Markdown | markdown-it, KaTeX, highlight.js |
| Files / images | sharp, browser-image-compression, vue-advanced-cropper |
| Email | nodemailer |
| Testing | Vitest, @nuxt/test-utils, happy-dom, @vitest/coverage-v8 |
| Tooling | pnpm, ESLint v10, Drizzle Kit, PM2 (production deployment) |

---

## Core Features

### Authentication & User Center
- Register / login / logout / forgot password / reset password / email verification, with a public-registration switch (`configs`).
- **OAuth2 third-party login (SSO)**: built-in **GitHub, Google and Microsoft** providers with a "bind existing account → email match → auto-provision account (optional)" login policy; each provider has its own enable switch + clientId/clientSecret in System Config (OAuth / SSO tab). Uses HMAC-signed `state` for CSRF protection; each OAuth identity maps one-to-one to a local user and multiple providers can be bound.
- **Persistent, revocable session tokens** (`tokens` table) with `httpOnly` cookie sessions.
- RBAC based on a **shared role table** (`admin` / `user`), with `requireUser` / `requireAdmin` server guards plus `auth` / `admin` frontend route middleware.
- Profile center: edit profile, avatar upload (compress + crop), change password; the admin side can view each user's **last login time and IP**.

### Metadata-Driven Generic CRUD (core)
- **Schema auto-discovery**: after registering a Drizzle schema, any table exposed as `pgTable` becomes accessible through the generic API; field types, validation, relations and column widths are inferred automatically from naming conventions and column metadata (`inferFieldType` / `applyFieldNamingHints`).
- **Generic API**: `/api/dashboard/data/:table/*` (list / detail / create / update / batch / import / export).
- **Generic page** `DashboardCrudPage`: data table, create/edit form modal, detail modal, row actions, batch operations.
- **Advanced filters**: dynamically add filter conditions, each with a logic connector (AND/OR), column, an operator that switches by field type, and a value input.
- **Column sorting + show/hide**: column visibility preferences are persisted to `localStorage`.
- **Relations & many-to-many**: `*_id` foreign keys automatically render as relation dropdowns; dual-FK (pivot) tables are detected as many-to-many virtual fields (e.g. `userIds`), with reads and writes synced through the pivot automatically.
- **Import/export**: Excel import/export, JSON import/export (respecting current filters).
- **Soft delete / restore / permanent delete** with a trash view.
- **Search performance**: `pg_trgm` GIN trigram indexes cover common search columns (`ilike '%...%'`), with automatic fallback to sequential scans when an index is missing.
- **Plenty of custom slots / hooks**: `#toolbar`, `#form-override`, `#detail-override`, `#table-{field}`, `transformPayload`, `apiBase` (other modules can reuse the generic CRUD rendering).
- **Field-level getter/setter transforms**: `FieldMeta` can declare `getter` / `setter` (string keys) mapped via `registerFieldTransform()`; tables/details automatically apply the getter for display (e.g. `price` → `¥100.00`) and forms apply the setter before save (`¥100.00` → `100`) — no hand-written slots needed. See `app/composables/useFieldTransform.ts` and the `templates.price` demo.
- **Customization ladder**: progressively customizable from "zero code" to "full page takeover" — L0 generic CRUD → L1 `tableOverrides` registry to customize the list / full CRUD API → L2 cell/detail/form slot overrides → L3 custom toolbar & filters → L4 standalone page file with full takeover. The `templates` table demonstrates this; switches live in `configs` and can be toggled one level at a time.

### System Config (`/dashboard/configs`, custom page)
Manages the `configs` table (key-value + type) in tabs:
- **General**: site title/description, registration switch, security TTL, upload limits, analytics IDs (GA4 / Google Ads / Baidu Tongji).
- **OAuth / SSO**: per-provider switches + credentials for GitHub, Google and Microsoft.
- **Payments**: WeChat Pay and Stripe switches and credentials.
- **Email**: SMTP parameters.
- **LLM**: OpenAI-compatible parameters (`apiKey` / `baseUrl` / `model` / `temperature` / `maxTokens` / `systemPrompt`).
- **Menu editing**: card-based editor for the default left sidebar menu — add/remove, reorder, rename labels, pick icons, bind tables, hide.

### Menu Editor
Reuses `/api/dashboard/meta`, allowing admins to add, remove, edit and reorder the left sidebar navigation directly in the UI; the global menu cache refreshes on save.

### Notification System
- Admins can create notifications: **broadcast to everyone** or **target a specific list of user IDs**.
- User-side inbox + unread count + read status (`notification_reads` + real-time WebSocket push).

### Direct Messaging
- Real-time user-to-user messaging, conversation list, unread counts, read receipts, online presence (WebSocket).

### LLM Integration
- A unified frontend composable `useLlmChat`: prefers **WebSocket streaming** (`/api/llm/ws`) and automatically falls back to **HTTP** (`/api/llm/chat`) on failure, with human-readable error messages.
- Server side: LLM upstream calls, streaming incremental push; all parameters are driven by "System Config → LLM".
- "System Config → LLM" provides a **Test Connection** button that validates upstream connectivity and authentication in real time based on the current config (no generation quota consumed).

### WebSocket Real-time Capabilities
A single same-origin connection at `/api/ws` supports: notification push, direct messaging with read receipts, online presence, and LLM streaming output; automatic reconnection with exponential backoff, connect on login / disconnect on logout.

### File Management
Upload (configurable size / MIME whitelist), local storage, download/serve, per-user records, soft delete.

### Payments
- **WeChat Pay v3 (JSAPI)** for the mini-program side: unified order, signed `wx.requestPayment` params, platform-certificate callback verification + AES-GCM resource decryption, order-query reconciliation (`wx_pay_orders` table).
- **Stripe Checkout** for the web: hosted checkout session, webhook signature verification (`checkout.session.completed`) with amount validation, session-retrieve reconciliation (`stripe_orders` table).
- Both are gated by dashboard switches (`wx.pay.enabled` / `stripe.enabled`) with credentials in System Config → Payments.
- API: `POST /api/wx/pay/order` + `POST /api/wx/pay/notify`; `POST /api/stripe/pay/order` + `GET /api/stripe/pay/order` + `POST /api/stripe/pay/notify`.

### Membership / Subscription
- **Time-based paid membership**: admin-defined plans (`membership_plans`: name, duration in days, price in the smallest currency unit, featured flag), purchasable from the public `/membership` pricing page.
- **Two payment channels**, each rendered only when enabled in System Config:
  - **Stripe Checkout** (web, any currency) — `POST /api/membership/subscribe` returns the hosted-page URL.
  - **WeChat Pay Native** (web, CNY plans only) — `POST /api/membership/wechat/order` returns a `code_url` rendered as a QR code; the page polls `GET /api/membership/wechat/order` until it settles.
  - **WeChat Pay JSAPI** (mini-program) — `POST /api/wx/membership/order` returns `wx.requestPayment` params; poll `GET /api/wx/membership/order` for the result.
- Membership periods are stored in `membership_subscriptions` (start / expiry / source / order no. / amount) and activated **server-side only** on payment success — by the WeChat/Stripe callback or by order-query reconciliation when the callback is lost; the browser never grants membership.
- Subscribers can be website accounts (`user_id`) or mini-program users (`wx_user_id`); both share the same fulfilment logic.
- **Renewals stack**: a new purchase starts where the current period ends instead of overwriting it, so paying twice simply extends the expiry date.
- Admin CRUD for plans and subscriptions is registered in the sidebar, plus manual **grant / revoke** API (`/api/membership/admin/grant|revoke`) for offline payments.
- Gated by `membership.enabled` (System Config → General); redirect paths are configurable (`membership.successUrl` / `membership.cancelUrl`).

### Analytics / Tracking
- Config-driven integrations for **Google Analytics 4**, **Google Ads** and **Baidu Tongji (百度统计)** — set the IDs in System Config → General (`analytics.*`), empty = off.
- Scripts are injected automatically from the public config; IDs are sanitized so the inline snippet stays injection-safe.
- A client plugin syncs SPA route changes to both networks (`page_view` / `_trackPageview`), so single-page navigation is tracked correctly.
- `useAnalytics()` composable for business events: `trackEvent()`, `trackGoogleAdsConversion('AW-.../label')`, `trackBaiduPageview()`.

### Internationalization
`i18n/locales/en.json` and `zh.json`, with **en** as the default language (`no_prefix` + browser language detection + cookie persistence); menu, field and button labels are resolved via `t('dashboard.tables.…')` / `t('dashboard.fields.…')`, and the backend provides fallback labels so new tables/fields need no hardcoded text.

---

## Directory Structure

```
├── app/                    # Frontend
│   ├── components/
│   │   ├── base/           # markdown/textarea, viewer, iconPicker, imagePreview, avatarUploader, fileUploader …
│   │   ├── auth/           # form, modal
│   │   └── dashboard/
│   │       ├── crud/       # Generic CRUD atomic components (page/table/tableBase/form/detail/formModal/detailModal/
│   │       │               #   filters/header/rowActions/excelImportModal/fieldRenderer/cellRenderer)
│   │       ├── shell.vue / sidebar.vue / menuEditor.vue / configsPage.vue / notificationsPage.vue …
│   │   └── app/            # header / footer / logo
│   ├── composables/        # useAuth, useDashboardMeta, usePagedResource, useExcelExport, useFilterOperators,
│   │                       # useWebSocket, useLlmChat, useUniverSheet, usePublicConfig …
│   ├── layouts/            # dashboard, default
│   ├── middleware/         # auth, guest, admin
│   ├── pages/              # login/register/forgot|reset-password/profile/messages/notifications;
│   │                       # dashboard/index, dashboard/[table], users, files, templates
│   ├── types/  utils/  app.config.ts  app.vue
│
├── server/                 # Server (Nitro + Drizzle)
│   ├── api/
│   │   ├── auth/           # login/register/logout/me/change password/change profile/email verify/reset password/oauth (providers·login·callback)
│   │   ├── config/         # System config (index/public/put)
│   │   ├── dashboard/
│   │   │   ├── meta/       # Table metadata (list / single table, incl. custom flags, menu)
│   │   │   ├── data/       # Generic CRUD dispatcher + per-table custom logic dispatched via tableOverrides
│   │   │   └── templates/  # Feature-switch read/write for the templates demo (customization ladder)
│   │   ├── files/          # upload / download / serve
│   │   ├── llm/            # chat (POST), ws (streaming)
│   │   ├── notifications/  # inbox, unread count, mark read, create
│   │   ├── messages/       # contacts, history, unread count, search
│   │   └── ws.ts           # WebSocket gateway (notifications/messages/presence/LLM)
│   ├── database/           # schema / migrate / seed / ensure (auto database creation)
│   ├── utils/              # auth, session, tokens, users, files, mail, notifications, messages, llm, oauth,
│   │                       # rateLimit, password(Reset), email-verification, fileStorage, configs, pagination;
│   │                       # dashboard/: crudService, tables (auto-discovery + registry), tableOverrides (customization registry)
│   └── plugins/  database.ts
│
├── extends/<your-layer>/      # (optional) Business modules, plugged in as Nuxt layers via registerDashboardTable / registerDrizzleSchema
├── modules/<name>/            # (optional) Independently hosted decoupled modules; clone here and mount with <NAME>_ENABLED=true in .env
│                               #   nav (navigation site) / doc (multi-doc site) are built-in examples
├── i18n/locales/           # en.json / zh.json
├── test/                   # e2e (API), unit (app/server), nuxt (component/composable/page), helpers
├── drizzle.config.ts  nuxt.config.ts  vitest.config.ts  ecosystem.config.cjs  .env.example
```

---

## Quick Start

Prerequisites: Node.js 18+, pnpm, PostgreSQL.

```bash
# 1. Install dependencies
pnpm install

# 2. Prepare environment variables
cp .env.example .env
#    Edit .env, set at least DATABASE_URL and SESSION_SECRET
#    SESSION_SECRET suggestion: openssl rand -hex 32

# 3. Prepare the database
pnpm db:generate   # generate migrations from schema (skippable if migrations already exist)
pnpm db:migrate    # apply migrations, create tables automatically

# 4. (optional) Seed data: admin/admin@example.com user, roles, default configs, test users
node -e "import('./server/database/index.ts')"  # or let the app auto ensure+seed on first startup
#    Simpler: in dev mode the app automatically ensures the database exists and tries to migrate/seed
pnpm dev

# 5. Build / preview
pnpm build
pnpm preview
```

> Note: `server/database/ensure.ts` can create the target database automatically; whether migrations run automatically at startup is controlled by `AUTO_MIGRATE=true`. In production, running `pnpm db:migrate` explicitly in the release pipeline is recommended.

**Default admin account** (created by the seed script): username `admin`, password `Admin@123`, email `admin@example.com`.

---

## Common Commands

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the dev server (`--host`) |
| `pnpm build` / `preview` | Build / preview the production bundle |
| `pnpm lint` / `typecheck` | Lint / type check |
| `pnpm db:generate / migrate / push / studio` | Drizzle Kit migrations and database management |
| `pnpm test` / `test:watch` / `test:coverage` | Run the test suite |
| `pnpm server` | Run the built output (with `--env-file`) |
| `pnpm pm` | Start production with PM2 (see `ecosystem.config.cjs`) |

---

## Deployment

- A single instance can also run under PM2; see `ecosystem.config.cjs` (listens on 0.0.0.0:80 by default, adjustable via `nitro_port`).
- Whether to set `AUTO_MIGRATE` in production depends on your deployment strategy; always set a strong random `SESSION_SECRET`.
- The npm script `server` reads environment variables via `--env-file-if-exists=.env`, which makes PM2 injection convenient.

---

## Modular Extensions

Through the registration functions exposed by `server/utils/dashboard/tables.ts`, business modules can plug **their own tables and services** into the generic system at Nitro startup:

- `registerDrizzleSchema(schema)`: registers the module's Drizzle schema into the auto-discovery pool; any `pgTable` becomes immediately available.
- `registerDashboardTable(reg, { menuOrder })`: explicitly registers a table's `TableMeta` (field order / labels / types / validation / relations can be overridden); passing `menuOrder` also adds it to the default sidebar menu, while omitting it keeps module-internal tables out of the main menu.
- `registerDrizzleSchema` + the Drizzle pivot convention: many-to-many relations are detected automatically and virtual fields injected.
- Full custom page logic: mark `custom: true` and map a component in `CUSTOM_PAGE_MAP` inside `[table].vue` (e.g. `configs` → `configsPage.vue`).
- When reusing the generic page (`custom: false`), light customization is available via the `#toolbar` / `#form-override` / `#detail-override` slots and the `transformPayload` hook, or point `apiBase` at the module's own generic CRUD namespace. Field-level display/storage transforms work the same way: declare a `getter` / `setter` key on `FieldMeta` and register the transform functions in the module's frontend.

Module APIs only need `requireUser` / `requireAdmin` to reuse the host project's session, RBAC, notifications/direct-messaging/WebSocket and other infrastructure.

---

## Built-in Extension Modules (`modules/`)

Besides the hardcoded `extends/blog` example, this repository mounts **independently hosted** decoupled modules on demand via **`.env` switches**. Each module is its own standalone Git repository — clone it into `modules/<name>/` and flip the corresponding switch in `.env` to hook it in with one line (`nuxt.config.ts` automatically scans `modules/` and mounts any directory with `<NAME>_ENABLED=true`), no host source changes needed. Two are currently built in:

| Module | Description | Home route | Switch (host `.env`) |
| --- | --- | --- | --- |
| `modules/nav` | Navigation site (image-based links + catalog management, `layout:false` full-screen landing page) | `/` (replaces the original home page) | `NAV_ENABLED=true` |
| `modules/doc` | Multi-doc site (categories → documents → three-level sections, drag-and-drop editing + global header nav sync) | `/doc` | `DOC_ENABLED=true` |

**They are not standalone apps — none has its own `package.json`; they only run on top of the host project.** All integration steps happen inside the host project:

```bash
# 1. (one-time) Clone the module repo into the host project
git clone <your-module-repo> modules/<name>

# 2. Enable it in the host project's .env (the module auto-mounts at nitro startup)
echo "<NAME>_ENABLED=true" >> .env

# 3. Start with the host project (the module auto-migrates tables, registers CRUD, merges its menu)
pnpm dev
```

> Also supported: pass a space/comma-separated list of layer paths via the `EXTENDS_MODULES` environment variable; results are deduplicated and merged with the `modules/` auto-discovery.

Module boot flow: `registerDrizzleSchema` makes tables discoverable → idempotent migrations create tables → `registerDashboardTable` registers them into the generic CRUD and sidebar menu → empty tables are auto-seeded → the `dashboard.menu` whitelist is merged (doc also rebuilds the global header navigation). See each module's own README (bilingual) for details.

---

## Testing

```bash
pnpm test            # full test run
pnpm test:coverage   # coverage
```

Test coverage: server (auth, session, tokens, users, files, notifications, messages, mail, rateLimit, pagination, password & reset, WS & WS registry, dashboard auto-discovery & generic CRUD, file storage, LLM WS), frontend (composables, utils, components, pages), and API end-to-end.

---

## Environment Variables (`.env.example`)

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string (e.g. `postgres://user:pass@host:5432/db`) |
| `AUTO_MIGRATE` | Whether to run migrations automatically at startup (off by default) |
| `SESSION_SECRET` | Session signing secret, required; use a long random string |
| `NUXT_PUBLIC_SITE_URL` | Public site URL |
| `DB_POOL_MAX` / `DB_POOL_IDLE_TIMEOUT` / `DB_POOL_CONNECT_TIMEOUT` | Connection pool tuning (optional) |

> Site title, email SMTP, upload limits, security TTL and LLM parameters are all managed in the dashboard's "System Config" — no code changes needed.

---

## Project Status & Suggested Extensions

The current base is feature-complete and well tested. Already built in: OAuth2 third-party login (GitHub / Google / Microsoft), WeChat Pay & Stripe payments, time-based membership subscriptions, analytics integrations (GA4 / Google Ads / Baidu Tongji), LLM connectivity testing, dynamic overview stats, pg_trgm full-text indexes, last-login info display. Future directions: field/role-level permissions, dashboard stat charts, dark mode, data backup & restore, and more.

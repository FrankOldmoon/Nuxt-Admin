# Nuxt Admin

A general-purpose admin framework built on **Nuxt 4 + Nuxt UI**. The core highlight is the **metadata-driven generic CRUD**: define a single Drizzle table and automatically get a complete back-office experience — list, form, detail, filters, sorting, import/export, soft delete — without writing any pages or API endpoints for that table. Business modules plug in through a versioned **Module SDK** (`server/sdk`), a single static catalog (`modules.catalog.ts`), persisted lifecycle states and module-owned migrations.

> This repository is the **admin base**. Business modules live under `modules/<id>/` (or in their own repositories) and connect only through the public SDK contract. See [docs/architecture/SYSTEM_ARCHITECTURE.md](docs/architecture/SYSTEM_ARCHITECTURE.md).

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

### Platform Architecture (vNext)
- **Server-side authorization context**: `AuthContext` is built from the session, active organization membership and effective role; clients never supply tenant/organization/role as authorization evidence.
- **Multi-tenancy**: `tenants → organizations → departments → organization_memberships`; generic CRUD injects `organization_id` / `tenant_id`, rejects cross-organization relations and uses scoped unique indexes.
- **Module SDK**: `server/sdk` is the only contract modules may import; `modules.catalog.ts` is the single catalog; manifests validate ID/version/API compatibility/permissions/navigation/migrations.
- **Module lifecycle**: `discovered → validated → installed → migrated → active ⇄ deactivated → uninstalling → uninstalled`, persisted in `module_states` with audit rows, dependency guards, module-owned migrations and a management UI at `/dashboard/modules`.
- **SIS/SMS module (external)**: the school information system lives in its own repository [`Nuxt-Extend-SMS`](https://github.com/FrankOldmoon/Nuxt-Extend-SMS); clone it into `modules/sms` and register `smsModule` in `modules.catalog.ts` to enable. The main repository no longer bundles SIS code.
- **Agent foundation**: Model Gateway (OpenAI-compatible adapter, timeout, retry, fallback, cost), hardened tool pipeline (permission re-check, rate limit, timeout, cancellation, output cap), persisted executions/tool calls/approvals/artifacts and hash-bound human approvals.
- **Realtime**: single `/api/ws` gateway with cross-instance messaging/presence via PostgreSQL `LISTEN/NOTIFY`; see [docs/architecture/PRODUCTION.md](docs/architecture/PRODUCTION.md).

### Authentication & User Center
- Register / login / logout / forgot password / reset password / email verification, with a public-registration switch (`configs`).
- **OAuth2 third-party login (SSO)**: built-in **GitHub, Google and Microsoft** providers with a "bind existing account → email match → auto-provision account (optional)" login policy; each provider has its own enable switch + clientId/clientSecret in System Config (OAuth / SSO tab). Uses HMAC-signed `state` for CSRF protection; each OAuth identity maps one-to-one to a local user and multiple providers can be bound.
- **Persistent, revocable session tokens** (`tokens` table) with `httpOnly` cookie sessions.
- RBAC based on a **shared role table** (`admin` / `user`), with `requireUser` / `requireAdmin` server guards plus `auth` / `admin` frontend route middleware.
- Profile center: edit profile, avatar upload (compress + crop), change password; the admin side can view each user's **last login time and IP**.

### OAuth 2.0 / OpenID Connect Provider
This system can also act as the **identity provider** for other applications ("Sign in with <this site>").
- **Discovery**: `GET /.well-known/openid-configuration`, keys at `GET /.well-known/jwks.json` (RS256, auto-generated and persisted in `configs.oauthServer.privateKey`).
- **Endpoints**:
  - `GET /oauth/authorize` — consent page (login required, scopes shown to the user).
  - `POST /api/oauth/token` — `authorization_code` (with PKCE `S256`/`plain`) and `refresh_token` (rotation on every use).
  - `GET /api/oauth/userinfo` — Bearer access token → claims for the granted scopes (`openid` `profile` `email` `roles`).
  - `POST /api/oauth/revoke` (RFC 7009) and `POST /api/oauth/introspect` (RFC 7662).
- **Client management** in the dashboard (`/dashboard/oauthClients`): name/description/logo, exact-match redirect URIs (one absolute URL per line), allowed scopes, public (PKCE-only) vs confidential clients, token TTLs and an enable switch.
- **Secrets are never stored in plaintext** — only their SHA-256 hash. The generated `clientId` / `clientSecret` are shown once after creation; a per-row action rotates the secret (`POST /api/oauth/clients/:id/rotate-secret`).
- Gate the whole provider with `oauthServer.enabled`; set `oauthServer.issuer` when running behind a proxy (otherwise the request origin is used).
- Access tokens are opaque (stored hashed, revocable); id_tokens are RS256 JWTs consumable by any standard OIDC client library.

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
- **OAuth / SSO**: per-provider switches + credentials for GitHub, Google and Microsoft, plus the OAuth provider switch / issuer (`oauthServer.*`).
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
- **WeChat Pay v3 (JSAPI/Native)**: unified order, signed `wx.requestPayment` params, callback verification using either the WeChat Pay public key (`wx.pay.publicKeyId` + `wx.pay.publicKey`, recommended for new merchants) or platform certificates (legacy), AES-GCM resource decryption, and order-query reconciliation (`wx_pay_orders` table).
- **Stripe Checkout** for the web: hosted checkout session, webhook signature verification (`checkout.session.completed`) with amount validation, session-retrieve reconciliation (`stripe_orders` table).
- Both are gated by dashboard switches (`wx.pay.enabled` / `stripe.enabled`) with credentials in System Config → Payments.
- API: `POST /api/wx/pay/order` + `POST /api/wx/pay/notify`; `POST /api/stripe/pay/order` + `GET /api/stripe/pay/order` + `POST /api/stripe/pay/notify`.

### Membership / Subscription
- **Time-based paid membership**: admin-defined plans (`membership_plans`: name, duration in days, price in the smallest currency unit, featured flag), purchasable from the public `/membership` pricing page.
- **Three payment channels**, each rendered only when enabled in System Config:
  - **Stripe Checkout** (web, any currency) — `POST /api/membership/subscribe` returns the hosted-page URL.
  - **WeChat Pay Native** (web, CNY plans only) — `POST /api/membership/wechat/order` returns a `code_url` rendered as a QR code; the page polls `GET /api/membership/wechat/order` until it settles.
  - **WeChat Pay JSAPI** (mini-program) — `POST /api/wx/membership/order` returns `wx.requestPayment` params; poll `GET /api/wx/membership/order` for the result.
  - **Alipay page pay** (web, CNY plans only) — `POST /api/membership/alipay/order` returns a signed cashier URL; RSA2 signing/verification is implemented with Node `crypto` (no SDK), the async notify lands on `POST /api/alipay/pay/notify`, and `GET /api/membership/alipay/order` reconciles lost callbacks.
- Payment return/notify URLs use the canonical `site.url` config when set, so checkout can be initiated from a legacy host without sending the payer or Alipay callback to that host.
- Membership periods are stored in `membership_subscriptions` (start / expiry / source / order no. / amount) and activated **server-side only** on payment success — by the provider callback or by order-query reconciliation when the callback is lost; the browser never grants membership.
- Subscribers can be website accounts (`user_id`) or mini-program users (`wx_user_id`); both share the same fulfilment logic.
- **Renewals stack**: a new purchase starts where the current period ends instead of overwriting it, so paying twice simply extends the expiry date.
- Admin CRUD for plans and subscriptions is registered in the sidebar, plus manual **grant / revoke** API (`/api/membership/admin/grant|revoke`) for offline payments.
- Gated by `membership.enabled` (System Config → General); redirect paths are configurable (`membership.successUrl` / `membership.cancelUrl`).

### Analytics / Tracking
- Config-driven integrations for **Google Analytics 4**, **Google Ads** and **Baidu Tongji** — set the IDs in System Config → General (`analytics.*`), empty = off.
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
│   │                       # dashboard/index, dashboard/[table], dashboard/modules, dashboard/users, dashboard/files
│   ├── types/  utils/  app.config.ts  app.vue
│
├── server/                 # Server (Nitro + Drizzle)
│   ├── api/
│   │   ├── auth/           # login/register/logout/me/change password/change profile/email verify/reset password/oauth
│   │   ├── config/         # System config (index/public/put)
│   │   ├── dashboard/
│   │   │   ├── meta/       # Table metadata (list / single table, incl. custom flags, menu)
│   │   │   ├── data/       # Generic CRUD dispatcher + per-table custom logic via tableOverrides
│   │   │   ├── modules/    # Module catalog + validate/enable/disable/uninstall
│   │   │   └── templates/  # Feature-switch read/write for the templates demo
│   │   ├── files/          # upload / download / serve (visibility + signed URLs)
│   │   ├── llm/            # chat (POST, tool loop), ws (streaming)
│   │   ├── modules/        # /api/modules/<id>/** dispatcher (lifecycle gate)
│   │   ├── notifications/  # inbox, unread count, mark read, create
│   │   ├── messages/       # contacts, history, unread count, search
│   │   ├── health.get.ts   # health check
│   │   └── ws.ts           # WebSocket gateway (notifications/messages/presence/LLM)
│   ├── core/               # Platform core: authContext, permissions, dataScope, fieldPolicy, audit,
│   │                       #   fileAccess, moduleSdk/catalog/manifest/state/guards, realtimeBus,
│   │                       #   modelGateway, agent, agentApproval
│   ├── sdk/                # Public Module SDK (the only entry modules may import)
│   ├── database/           # schema / migrations / migrate / seed / ensure; module migrations & states
│   ├── utils/              # auth, session, tokens, users, files, mail, notifications, messages, llm, oauth,
│   │                       # rateLimit, password(Reset), email-verification, fileStorage, configs, pagination,
│   │                       # realtime, agentStore, moduleRuntime;
│   │                       # dashboard/: crudService, tables (auto-discovery + registry), tableOverrides, tableValidators
│   └── plugins/            # database.ts, modules.ts
│
├── modules/                # Bundled business modules (external modules can be cloned here too)
│   └── example/            # Reference module (org-scoped notes, API/Tool/UI, module migration)
├── extends/blog/           # Official upstream Nuxt layer (blog)
├── modules.catalog.ts      # Single module catalog (the only file that knows module IDs)
├── docs/                   # architecture / development / ADRs
├── i18n/locales/           # en / zh-CN / zh-TW / ja / ko / fr / es / de / ar
├── test/                   # e2e (API), unit (app/server/modules), nuxt (component/composable/page), helpers
├── drizzle.config.ts  nuxt.config.ts  vitest.config.ts  ecosystem.config.cjs  .env.example
```

---

## Quick Start

Prerequisites: Node.js 20+, pnpm 11, PostgreSQL 14+.

```bash
# 1. Install dependencies
pnpm install

# 2. Prepare environment variables
cp .env.example .env
#    Edit .env, set at least DATABASE_URL and SESSION_SECRET
#    SESSION_SECRET suggestion: openssl rand -hex 32

# 3. Prepare the database (base + module + blog migrations)
pnpm db:generate        # only needed after changing server/database/schema.ts
pnpm db:migrate:release

# 4. Start development (auto-creates the DB, migrates, seeds on boot)
pnpm dev

# 5. Build / preview
pnpm build
pnpm preview
```

> Note: `server/database/ensure.ts` can create the target database automatically. In development (`NODE_ENV !== 'production'`) the app runs base migrations, module lifecycle, module migrations and seed on startup. Production instances never migrate on boot — run `pnpm db:migrate:release` once in the release pipeline. `AUTO_MIGRATE` is no longer used.

**Default admin account (development only)**: username `admin`, password `Admin@123`, email `admin@example.com`. Production seeding requires `SEED_ADMIN_PASSWORD` (and optionally `SEED_ADMIN_EMAIL` / `SEED_ADMIN_USERNAME`) before the first start; demo `test01…test30` accounts are never seeded in production.

---

## Common Commands

| Command | Description |
| --- | --- |
| `pnpm dev` | Start the dev server (`--host`) |
| `pnpm build` / `preview` | Build / preview the production bundle |
| `pnpm lint` / `typecheck` | Lint / type check |
| `pnpm db:generate / migrate / push / studio` | Drizzle Kit migrations and database management |
| `pnpm db:migrate:release` | Release entry: base + module + blog migrations (`server/database/migrate.ts`) |
| `pnpm db:rollback:module [id]` | List (`--list`) or roll back one module migration that declares `down` |
| `pnpm test` / `test:watch` / `test:coverage` | Run the test suite (integration tests use a real PostgreSQL) |
| `pnpm server` | Run the built output (with `--env-file`) |
| `pnpm pm` | Start production with PM2 (see `ecosystem.config.cjs`) |

---

## Deployment

- Run `pnpm db:migrate:release` once before starting new instances; production instances never migrate on boot.
- A single instance can run under PM2; see `ecosystem.config.cjs` (listens on 0.0.0.0:80 by default, adjustable via `nitro_port`).
- Multi-instance deployments must set `REALTIME_DRIVER=postgres`; see [docs/architecture/PRODUCTION.md](docs/architecture/PRODUCTION.md).
- Always set strong random `SESSION_SECRET` and `FILE_SIGNING_SECRET`; `GET /api/health` exposes readiness without secrets.
- Full guide: [docs/development/DEPLOYMENT.md](docs/development/DEPLOYMENT.md).

---

## Modular Extensions

Business modules live under `modules/<id>/` and connect only through the public SDK (`server/sdk`):

- `modules.catalog.ts` is the single catalog: `MODULE_DEFINITIONS`, `AVAILABLE_MODULE_IDS`, `DEFAULT_ENABLED_MODULE_IDS`.
- `ModuleDefinition` declares `id`, semver `version`, `apiVersion`, `compatibility.core`, permissions, navigation, database tables, API/Tool/UI registrations and migrations.
- `register(context)` registers module APIs (`/api/modules/<id>/**`), Agent tools, UI descriptors and generic CRUD metadata.
- Generic CRUD metadata can be registered through `registerDashboardTable` (moduleId/resource/permissions/contextColumns); business validation through `registerTableValidator`; custom data scopes through `registerDataScopeResolver`.
- Modules must not import `server/core/**` or `server/utils/**`; `test/unit/server/core/moduleDecoupling.test.ts` enforces the boundary.
- Build-time enablement uses `ENABLED_MODULES`; runtime state (`active`/`deactivated`/`uninstalled`) is managed at `/dashboard/modules`.
- The repository is a **pnpm workspace** (`pnpm-workspace.yaml` covers `modules/*`). A module with its own `package.json` is installed as a workspace package, so run `pnpm install` after cloning or updating it.

---

## Bundled Module (`modules/`)

| Module | Description | Enable |
| --- | --- | --- |
| `modules/example` | Reference module: org-scoped notes, API/Tool/UI registrations, module migration, lifecycle tests | default (`ENABLED_MODULES` includes `example`) |

### External school module

The SIS/SMS module is maintained in [`Nuxt-Extend-SMS`](https://github.com/FrankOldmoon/Nuxt-Extend-SMS). It is not bundled here:

```bash
git clone https://github.com/FrankOldmoon/Nuxt-Extend-SMS.git modules/sms
pnpm install        # link the cloned workspace package and install its dependencies
# register it as smsModule in modules.catalog.ts, then:
ENABLED_MODULES=example,sms pnpm build
pnpm db:migrate:release
```

Modules are not standalone apps: they run inside the host Nitro process as Nuxt layers plus server code. A module may have its own `package.json` (metadata and `peerDependencies`); the host workspace installs it, but it still needs the host Nuxt/Nitro runtime. Add a module in three steps:

```bash
# 1. Put the module in modules/<id>/ (clone / submodule / local folder)
# 2. Register it in modules.catalog.ts (one import + one entry)
# 3. Enable it at build time
ENABLED_MODULES=example,my-module pnpm build
```

Module boot flow: catalog validation → dependency ordering → lifecycle callbacks → module migrations (advisory lock + checksums) → API/Tool/UI/CRUD registration → `module_states = migrated` → admin activation. See [docs/architecture/MODULE_ARCHITECTURE.md](docs/architecture/MODULE_ARCHITECTURE.md), [MODULE_LIFECYCLE.md](docs/architecture/MODULE_LIFECYCLE.md) and [docs/development/CREATE_MODULE.md](docs/development/CREATE_MODULE.md).

---

## Testing

```bash
pnpm test            # full suite (unit + integration + e2e, real PostgreSQL)
pnpm test:watch      # watch mode
pnpm test:coverage   # coverage
```

Coverage includes server core (authorization, data scope, audit, modules, migrations, files, realtime, agent), the bundled example module, dashboard generic CRUD, frontend composables/components/pages and API e2e. Current baseline: **64 test files / 619 tests**. CI (`.github/workflows/ci.yml`) runs migration checks, the full suite against PostgreSQL 16 and a production build on every PR; lint/typecheck are visible but non-blocking legacy debt.

---

## Environment Variables (`.env.example`)

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string |
| `SESSION_SECRET` | Session signing secret, required |
| `FILE_SIGNING_SECRET` | HMAC secret for private-file signed URLs (falls back to `NUXT_SESSION_PASSWORD`) |
| `NUXT_PUBLIC_SITE_URL` | Public site URL |
| `ENABLED_MODULES` | Build-time enabled module IDs (space/comma separated) |
| `REALTIME_DRIVER` | `memory` (default) or `postgres` (required for multi-instance) |
| `REALTIME_CHANNEL` | PostgreSQL NOTIFY channel (default `app_realtime`) |
| `DB_POOL_MAX` / `DB_POOL_IDLE_TIMEOUT` / `DB_POOL_CONNECT_TIMEOUT` | Connection pool tuning (optional) |
| `BLOG_ENABLED` | Set `false` to skip the blog Nuxt layer |

> Site title, email SMTP, upload limits, security TTL and LLM parameters are managed in System Config — no code changes needed.

---

## Documentation

| Topic | Document |
| --- | --- |
| System architecture | [docs/architecture/SYSTEM_ARCHITECTURE.md](docs/architecture/SYSTEM_ARCHITECTURE.md) |
| Core services | [docs/architecture/CORE_SERVICES.md](docs/architecture/CORE_SERVICES.md) |
| Authorization | [docs/architecture/AUTHORIZATION.md](docs/architecture/AUTHORIZATION.md) |
| Multi-tenancy | [docs/architecture/MULTI_TENANCY.md](docs/architecture/MULTI_TENANCY.md) |
| Module architecture / lifecycle | [MODULE_ARCHITECTURE.md](docs/architecture/MODULE_ARCHITECTURE.md) / [MODULE_LIFECYCLE.md](docs/architecture/MODULE_LIFECYCLE.md) |
| Database migrations | [docs/architecture/DATABASE_MIGRATIONS.md](docs/architecture/DATABASE_MIGRATIONS.md) |
| Agent architecture | [docs/architecture/AGENT_ARCHITECTURE.md](docs/architecture/AGENT_ARCHITECTURE.md) |
| Development guides | [docs/development/](docs/development/) |
| Architecture decisions | [docs/decisions/ADRs/](docs/decisions/ADRs/README.md) |
| Implementation audit / progress | [IMPLEMENTATION_AUDIT.md](docs/architecture/IMPLEMENTATION_AUDIT.md) / [UPGRADE_PROGRESS.md](docs/architecture/UPGRADE_PROGRESS.md) |
| Production / realtime | [docs/architecture/PRODUCTION.md](docs/architecture/PRODUCTION.md) |

---

## Project Status

The admin base is feature-complete for the architecture upgrade (Phases 0–7). Implemented: server-side authorization and multi-tenancy, generic CRUD isolation, file visibility/signed URLs, Module SDK and lifecycle management, Agent gateway/tools/approvals/execution records, and multi-instance realtime via PostgreSQL. The SIS/SMS domain lives in the external [Nuxt-Extend-SMS](https://github.com/FrankOldmoon/Nuxt-Extend-SMS) module.

Known gaps (tracked in [UPGRADE_PROGRESS.md](docs/architecture/UPGRADE_PROGRESS.md)): Agent native Anthropic adapter and module extraction, record retention jobs, Redis/object-storage adapters, global rate limiting, and the pre-existing lint/type debt. SIS timetable/attendance/assessment/reporting gaps are tracked in the external module repository.

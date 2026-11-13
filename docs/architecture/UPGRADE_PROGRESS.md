# Architecture Upgrade Progress

Updated per phase. Only verified work is marked complete.

## Phase 0 — Baseline audit

- **Completed**: `docs/architecture/IMPLEMENTATION_AUDIT.md`.
- Evidence: code inspection of auth, CRUD, files, modules, SIS, tests.
- Remaining risks: documentation drift (README, MODULE_SDK_DESIGN path).

## Phase 1 — Core security and data integrity

| Task | Status | Files / evidence |
|---|---|---|
| Centralized authorization | Partial | `server/core/permissions.ts`, `server/utils/auth.ts`; routes use `requireDashboardAccess`/`authorize`, files use `fileAccess` |
| Unified permission naming | Partial | `TableMeta.permissions` + canonical `module.resource.action` checks; SIS registered |
| File visibility | Completed | migration `0011_wealthy_storm.sql`, `server/core/fileAccess.ts`, `server/utils/fileRequest.ts` |
| Private file access checks | Completed | owner/admin/org `files:read`; audit on denial |
| Signed URLs | Completed | `createSignedFileUrl` / `verifySignedFileUrl` (HMAC, expiry) |
| Directory traversal | Completed | DB lookup + `getAbsolutePath` guard; e2e 404 case |
| SIS org/tenant injection | Completed | `contextColumns`, `registerTableValidator`, `createStudent`, migration `sis-demo:002` |
| Cross-org class validation | Completed | `assertClassInContext`, teacher assignment check |
| Audit module attribution | Completed | `TableMeta.moduleId/resource`, `writeCrudAudit` |
| Authorization regression suite | Partial | `fileAccess.test.ts`, SIS integration, permission tests; export/protected-API cases still to consolidate |

Tests: file access unit 9, e2e file visibility/auth/traversal, SIS integration 7.

## Phase 2 — Independent module architecture

| Task | Status | Files / evidence |
|---|---|---|
| Manifest validation (4.1) | Completed | `server/core/moduleManifest.ts`: ID, semver, `apiVersion`, `compatibility.core`, permissions (no `*`, format, duplicates), navigation, capabilities, migration scope |
| Single discovery pipeline (4.3) | Completed | `resolveModuleCatalog` validates manifests + enabled IDs, then resolves dependencies; used by `server/plugins/database.ts`, `server/plugins/modules.ts`, `server/utils/moduleRuntime.ts`, `server/database/migrate.ts`; Nuxt layers derive from `modules.catalog.ts` |
| Manifest metadata in definitions | Completed | `modules/example/module.ts`, `modules/sis-demo/module.ts` declare `apiVersion`, `compatibility`, `migrationScope`, `capabilities` |
| Lifecycle enforcement (4.5) | Completed | `recordModuleState` reads the persisted state and calls `assertTransition`; same-state writes are idempotent, `failed` may be retried, `active` cannot regress |
| Transition history | Completed | Every persisted transition writes `audit_logs` (`module.<state>`, resource `module_states`) in the same transaction |
| Migration metadata (4.6) | Completed | `__module_migrations` tracks `module_id`, `module_version`, `checksum`, `status`, `duration_ms`, `last_error`; advisory lock; failed runs are recorded and retryable; modified historical migrations are rejected |
| Module Management API (4.7) | Completed | `GET /api/dashboard/modules`, `PUT /api/dashboard/modules/:id` (`validate`/`enable`/`disable`/`uninstall`), admin-only, all state changes through the lifecycle service |
| Module Management UI (4.7) | Completed | `app/pages/dashboard/modules.vue` + sidebar entry (`DEFAULT_MENU`, `dashboard.menu` default) |
| Runtime availability gate | Completed | `server/api/modules/[...path].ts` rejects `deactivated` / `uninstalling` / `uninstalled` modules (403) |
| Public SDK façade (4.2) | Completed | `server/sdk/index.ts` re-exports manifest/registry/permission/DataScope/audit/CRUD contracts; modules import only this entry (enforced by `moduleDecoupling.test.ts`) |
| Module package structure + docs (4.4) | Completed | `docs/architecture/MODULE_DEVELOPMENT.md`: package layout, create/develop/test/install/upgrade/remove, SDK contract rules |
| Removal/dependency guards (4.5) | Completed | `deactivated → uninstalling → uninstalled` states; uninstall requires `confirm`, refuses active dependents (`server/core/moduleGuards.ts`), preserves business data; runtime gate blocks all unavailable states |
| Module Management UI/API uninstall | Completed | `PUT /api/dashboard/modules/:id` (`uninstall`) + two-step confirm button in `app/pages/dashboard/modules.vue` |

Tests: `moduleManifest.test.ts` (11), `moduleStates.test.ts` (3, includes uninstall chain), `moduleMigrations.test.ts` (3), `modules.test.ts` (25, includes removal guards), `moduleDecoupling.test.ts` (3, includes SDK-only import guard), example integration (4), SIS integration (8), e2e module catalog API.

Known gaps:
- `pnpm typecheck` reports ~129 pre-existing errors in untouched app/legacy files; no errors originate from the Phase 1–6 files.
- Disabling a module records the lifecycle state and gates its runtime API, but does not unload build-time Nuxt layers (by design — layers are compile-time).

## Phase 3 — Generic CRUD and multi-tenant

| Task | Status | Files / evidence |
|---|---|---|
| Table metadata (5.1) | Completed | `TableMeta.moduleId/resource/permissions` + new `features.organizationScoped` / `features.tenantScoped`; `resolveContextColumns()` derives `organizationId`/`tenantId` defaults and explicit `contextColumns` still win |
| Unified authorization pipeline (5.2) | Completed | All generic routes run: auth → metadata → permissions → data scope → field policy → validator → query → audit. Export/import now reject `custom` tables (405) like list/detail/create/update/batch/seed; deletes/restores go through `/batch` (single-row calls use one ID) |
| Server-injected ownership (5.3) | Completed | Create injects org/tenant from `AuthContext`; update deletes browser-supplied ownership columns; SIS + files declare scope flags |
| Cross-org / cross-tenant relations (5.3) | Completed | `assertRelationScope()` validates `relation` and `many-to-many` targets against the actor's organization/tenant on create/update/import |
| Scoped unique constraints (5.3) | Completed | `sis-demo:003` adds unique `(organization_id, student_no)` and `(organization_id, name)`; schema declarations kept in sync |
| Scope classification review (5.3) | Completed | Global: `tenants`, `users`, `roles`, `configs`, `templates`, `categories`, auth/token tables. Tenant-scoped: `organizations`. Organization-scoped: `departments`, `organization_memberships`, `files`, `audit_logs`, SIS tables |
| Indexes for tenant/org (5.3/5.4) | Completed | migration `0012`: `audit_logs_tenant_created_idx`, `files_tenant_idx`; SIS tenant/org indexes from `sis-demo:002/003` |
| Performance (5.4) | Completed | page size cap 100, export cap 50k, relation-option cap 500, list count+rows in parallel, detail m2m fields loaded in parallel; no N+1 in list/detail |
| Query-count/perf tests | Partial | Pure + DB integration coverage for scope/pagination; no automated query-count assertion yet |

Tests: `dashboardCrudGeneric.test.ts` (context-column resolution), SIS integration (generic relation scope, org/tenant injection, cross-org rejects), e2e (custom-table import/export 405).

Known gaps:
- No dedicated `DELETE /data/:table/:id` route; all deletes use `/batch` (intentional, UI matches).
- Query-count regression tests are not automated.

## Phase 4 — SIS module (moved out)

> **Moved**: the SIS/SMS code and tests now live in
> [Nuxt-Extend-SMS](https://github.com/FrankOldmoon/Nuxt-Extend-SMS). The main
> repository no longer bundles `modules/sis-demo`; the table below records the
> implementation delivered before the extraction.

Implemented domain (migration `sis-demo:004` unless noted):

| Entity | Table | Notes |
|---|---|---|
| Academic Year | `sis_academic_years` | org-scoped, unique name, soft delete |
| Term | `sis_terms` | belongs to an academic year, unique per year |
| Grade | `sis_grades` | grade level entity, unique name per org |
| Subject | `sis_subjects` | unique code per org |
| Teacher | `sis_teachers` | links platform `user_id`, unique per org |
| Class | `sis_classes` | now owns `academic_year_id` + `grade_id`, soft delete |
| Student | `sis_students` | `user_id` link for self access, soft delete |
| Enrollment | `sis_enrollments` | history rows, one *active* per student/year, withdraw keeps history |
| Teacher Assignment | `sis_teacher_assignments` | teacher + class + subject/term/year, unique teacher/class |
| Guardian | `sis_guardians`, `sis_student_guardians` | explicit student links for guardian access |

Services (business logic lives in the module, not Core): `server/academics.ts`, `teachers.ts`, `enrollment.ts`, `guardians.ts`, `students.ts`; all validate organization ownership and write `module_id='sis'` audit rows.

Access control (enforced in backend queries):

- Admin / `*`: organization data.
- Teacher: only assigned classes (students, classes, enrollments).
- Student: only own student row (via `students.user_id`) and own enrollments.
- Guardian: only explicitly linked students and their enrollments.
- Generic CRUD metadata registers all SIS tables with canonical `sis.<resource>.<action>` permissions and scope flags.

Tests: `domain.test.ts` (5) covers relational structure, cross-organization academic references, enrollment state/history, audit attribution, role-aware scopes; existing `integration.test.ts` (8) covers CRUD/teacher scope.

Not implemented (outside the Phase 4 start list): Timetable, Attendance, Assessment, Report, and dedicated UI pages for the new entities.

## Phase 5 — Agent module foundation

| Task | Status | Files / evidence |
|---|---|---|
| Model Gateway (7.1) | Completed (OpenAI-compatible) | `server/core/modelGateway.ts`: provider adapters, normalization, timeout, retry, provider fallback, usage, cost estimation; `server/utils/llm.ts` runs tool turns through it. Anthropic-native adapter remains planned (any OpenAI-compatible gateway works today) |
| Credential handling | Completed | API key/base URL stay server-side (env or configs); never returned to clients |
| Tool execution pipeline (7.2) | Completed | `ToolRegistry.run`: schema validation → permission re-check → cancellation (`AbortSignal`) → rate limit → timeout → execute → output-size limit; agent loop adds risk assessment, approval check and audit |
| Tool risk metadata (7.2) | Completed | `riskLevel`, `requiresApproval`, `outputLimitBytes`, `rateLimit` on `ToolRegistration`; medium/high risk and commands require approval |
| Execution records (7.3) | Completed | Tables `agent_executions`, `agent_tool_calls` (migration `0013`); `server/utils/agentStore.ts`; `/api/llm/chat` records status, model/provider, token usage, cost, tool calls, duration and errors |
| Privacy / retention (7.3) | Partial | Message content is never persisted in execution records; configurable retention/purge job not implemented |
| Human approval (7.5) | Completed | `agent_approvals` with batch ID, ordered calls + SHA-256 argument binding, expiry, owner/organization checks, state machine (`server/core/agentApproval.ts`); chat confirmation now uses persisted batches instead of in-memory state |
| File artifacts (7.4) | Partial | `agent_artifacts` table + `attachAgentArtifact` / `listAgentArtifacts`; artifacts reference Core `files` rows (no server paths, no public links). No agent file-generation tool yet |
| Agent as independent module | Partial | Agent loop/gateway/records live in Core infrastructure; the HTTP entry remains `server/api/llm/chat.post.ts`. Extracting `modules/agent` is still planned |

Tests: `modelGateway.test.ts` (9), `agentApproval.test.ts` (3), `agentStore.test.ts` (4), `agent.test.ts` (14), `modules.test.ts` (27, includes tool limits).

## Phase 6 — Realtime and production architecture

| Task | Status | Files / evidence |
|---|---|---|
| Shared realtime bus (8.1) | Completed | `server/core/realtimeBus.ts`: `InMemoryRealtimeBus` (default) + `PostgresRealtimeBus` (LISTEN/NOTIFY, no extra service); `server/utils/realtime.ts` fanout wrapper |
| Cross-instance messaging/notifications (8.1) | Completed | `server/utils/messages.ts`, `server/utils/notifications.ts` publish through the bus; local peers always served first |
| Cross-instance presence (8.1) | Completed | `announcePresence` + remote presence bookkeeping (`wsRegistry.markRemotePresence`, `isUserOnlineAnywhere`); contacts receive `presence:update` from any instance |
| Connection cleanup / reconnect (8.1) | Completed | close/error unregister peers; 30s local `ping` keepalive; client-side reconnect unchanged |
| Redis adapter | Not implemented | `RealtimeBus` interface is ready; PostgreSQL was chosen to avoid a new infrastructure dependency |
| Health checks (8.2) | Completed | `GET /api/health` (200/503, DB check, realtime driver, latency, no secrets) |
| Production documentation (8.2) | Completed | `docs/architecture/PRODUCTION.md`: pooling, migrations, backups, env vars, logging/monitoring, rate limits, Docker, PM2, multi-instance checklist |
| Object storage / file retention | Not implemented | Local disk + signed URLs; retention cleanup and S3 adapter remain |
| Global rate limiting | Not implemented | Rate limits are per-instance (login, messaging, tools) |

Tests: `realtimeBus.test.ts` (4, includes real PostgreSQL NOTIFY round-trip), `wsRegistry.test.ts` (16, includes remote presence), `wsApi.test.ts` (30), e2e `/api/health`.

## Phase 7 — Tests / CI / docs

| Task | Status | Files / evidence |
|---|---|---|
| CI pipeline (9.2) | Completed | `.github/workflows/ci.yml`: pnpm install → lint（非阻塞）→ typecheck（非阻塞）→ `drizzle-kit check` → `db:migrate:release` → `pnpm test`（真实 PostgreSQL service）→ `pnpm build`；`push main` + 所有 PR 触发 |
| Release migration entry | Completed | 在全新临时库验证 `pnpm db:migrate:release`：38 张 public 表、1 条模块迁移（`example`）、`example` 状态为 `migrated`，重复执行与 `pnpm db:migrate` 均幂等。修复 `server/core/audit.ts` 的 `~~` 别名导入为相对路径；发布入口改用与 `drizzle.config.ts`/开发插件一致的 `public.__drizzle_migrations`，避免两份迁移历史 |
| Lint/typecheck honesty (9.2) | Completed | 历史债务保留为非阻塞步骤并在工作流注释与本文说明；不把非阻塞步骤描述为“已通过” |
| Test layers (9.1) | Completed | 既有 unit / nuxt / e2e；集成测试使用真实 PostgreSQL，不使用 mock 替代租户隔离/事务/迁移行为 |
| Architecture docs (9.3) | Completed | `SYSTEM_ARCHITECTURE.md`、`CORE_SERVICES.md`、`AUTHORIZATION.md`、`MULTI_TENANCY.md`、`MODULE_ARCHITECTURE.md`、`MODULE_LIFECYCLE.md`、`DATABASE_MIGRATIONS.md`、`AGENT_ARCHITECTURE.md`；`IMPLEMENTATION_AUDIT.md` 更新 |
| Development docs (9.3) | Completed | `docs/development/{CREATE_MODULE,LOCAL_MODULE_DEVELOPMENT,INDEPENDENT_MODULE_REPOSITORY,MODULE_TESTING,DEPLOYMENT}.md`；`MODULE_DEVELOPMENT.md` 改为索引 |
| ADRs (9.3) | Completed | `docs/decisions/ADRs/README.md` + 0001–0006 |
| Historical docs | Completed | `CURRENT_ARCHITECTURE.md` 标记 Deprecated；历史审计文档标注定位 |
| README / env accuracy | Completed | README 按真实模块目录、命令、测试与文档索引更新；`.env.example` 修正 `ENABLED_MODULES`、迁移开关、`FILE_SIGNING_SECRET`、`REALTIME_*` |

Known debt retained: `pnpm typecheck` 约 129 个历史错误、repo 级 `pnpm lint` 约 2546 个历史错误，均不在 Phase 1–7 新增文件中；CI 不阻塞这两项。

## Commands to revalidate

Last run (Phase 7 complete):

| Command | Result |
|---|---|
| `pnpm test` | 64 files / 619 tests passed (real PostgreSQL) |
| `pnpm build` | completed (`.output` generated) |
| `pnpm exec drizzle-kit check` | `Everything's fine` |
| `pnpm db:migrate:release` | passed on a fresh temporary database (38 tables, 1 module migration, `example` migrated) |
| `pnpm exec eslint nuxt.config.ts` | clean |
| `pnpm typecheck` | not re-run in Phase 7; Phase 6 baseline: ~129 pre-existing errors in untouched app/legacy files |
| `pnpm lint` | full repo not re-run in Phase 7; historical baseline (~2546 errors) remains and is non-blocking in CI |

GitHub Actions cannot be executed locally; the workflow file was syntax-checked and its underlying commands were run successfully above. CI itself is not claimed as passed until it runs on GitHub.

```bash
pnpm exec drizzle-kit check
pnpm db:migrate:release
pnpm test
pnpm build
```

# Host component and agent fixes

This change exposes compact CRUD pages, metadata permissions, typed form/detail slots and a business-table wrapper for independent modules. Business tables reuse host pagination and rendering while suppressing generic edit/delete actions. Filters reset pagination and stale responses cannot overwrite newer results. Spreadsheet export uses the installed xlsx dependency and preserves server-side filters and permissions.

OpenAI-compatible requests encode invalid tool names into stable legal aliases, then decode replies to the original registry identifiers. Resuming an approval answers all outstanding sibling tool calls before requesting another model response. Exhausting tool rounds allows one model-only summary turn. The chat runtime budget is 8 tool rounds / 24 calls; this can increase provider usage relative to the previous 3 / 6 limits.

The optional managed startup entry is described in `../本地启动说明.md`. The default `pnpm dev` command is retained. Machine paths and database credentials belong exclusively in the ignored `.env`.

## Focused verification

```sh
pnpm test:contributions
```

The standalone Vitest config runs host permission, pagination, business-table, readiness and model/agent tests without booting Nuxt or connecting to a database. It also discovers the SMS module's record-dialog and refund arithmetic tests when those files are installed under modules/sms. This avoids making host-only checks depend on a private fixture or the SMS checkout.

The paired SMS contribution includes explicit opt-in transaction tests and documents its host component dependencies in `modules/sms/docs/host-ui-reuse.md`. No API key is required by the focused model tests; provider calls are mocked.

Full-project type checking currently reports pre-existing editor, menu and blog errors. A passing focused suite does not mean full build/typecheck or all repository integration tests passed.

Changed-file ESLint still reports existing dynamic-delete, explicit-any and single-line statement violations in CRUD filters/page and usePagedResource. The SMS changed TypeScript/Vue files pass ESLint. The managed launcher passes its database check; a fresh Nuxt launch could not be verified in the restricted execution environment (spawn EPERM).

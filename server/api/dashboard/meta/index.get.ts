// GET /api/dashboard/meta
// Returns:
//   {
//     menu: DashboardMenuItem[],
//     tables: Array<{ table, label, icon, custom }>
//   }
// Admin-only endpoint.  Merges the default menu with an optional
// `dashboard.menu` JSON record in the configs table, so admins can
// reorder/hide sidebar items without changing code.

import { requireUser, isAdmin, roleCanAccessTable, ADMIN_ONLY_TABLES } from '~~/server/utils/auth'
import { getAllConfigs, getConfigValue } from '~~/server/utils/configs'
import { getRegisteredTables, DEFAULT_MENU } from '~~/server/utils/dashboard/tables'
import type { DashboardMeta, DashboardMenuItem } from '~/types/dashboard'

export default defineEventHandler(async (event): Promise<DashboardMeta> => {
  const ctx = await requireUser(event)
  const actorType = ctx as { role?: { name?: string, permissions?: string[] | null } | null }
  const perms = actorType.role?.permissions ?? []

  // Tables the role may access in the dashboard: admin ('*') or the
  // permissions include the table and it's not an admin-sensitive one.
  const allowed = (table: string) =>
    isAdmin(ctx) || (!ADMIN_ONLY_TABLES.has(table) && roleCanAccessTable(perms, table))

  const allConfigs = await getAllConfigs()
  const byKey = new Map(allConfigs.map(c => [c.key, c]))
  const rawMenu = (byKey.get('dashboard.menu')?.value as string | undefined) ??
    await getConfigValue<string>('dashboard.menu', '')

  const menuConfig: Array<Partial<DashboardMenuItem> & { table: string }> = (() => {
    if (!rawMenu) return []
    try {
      const parsed = JSON.parse(rawMenu)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  })()

  // Merge strategy:
  //   - If admin has saved a non-empty `dashboard.menu` config, treat it as
  //     the authoritative source: only rows present there (and not marked
  //     hidden) will appear in the sidebar, in the configured order.  Any
  //     missing label/icon is still back-filled from DEFAULT_MENU or the
  //     registry metadata.
  //   - Otherwise (no config saved yet, or empty list) fall back to
  //     DEFAULT_MENU and show every registered table by default, so the
  //     sidebar is populated out of the box.
  const registered = getRegisteredTables()
  const regMetaByTable = new Map(registered.map(r => [r.meta.table, r.meta]))
  const defaultMenuMap = new Map(DEFAULT_MENU.map(m => [m.table, m]))
  const merged: DashboardMenuItem[] = []

  if (menuConfig.length > 0) {
    // Explicit user config: strict whitelist mode
    for (const cfg of menuConfig) {
      if (cfg.hidden) continue
      const t = cfg.table
      if (!allowed(t)) continue
      const reg = regMetaByTable.get(t)
      const def = defaultMenuMap.get(t)
      // Allow menu rows that aren't registered CRUD tables but ARE known
      // standalone pages (e.g. structure, sessions) — they still have a real
      // /dashboard/<table> route and must stay clickable.  Only skip rows
      // that are neither registered nor a known default page.
      if (!reg && !def) continue
      // A menu row counts as "system default" (and thus i18n-translatable)
      // only when it maps to a known default page AND its label matches the
      // default English label (i.e. the admin has not renamed it).  Custom
      // labels are kept verbatim in every language.
      const isDefault = def != null && (cfg.label == null || cfg.label === def.label)
      merged.push({
        table: t,
        label: cfg.label ?? def?.label ?? reg?.label ?? t,
        icon: cfg.icon ?? def?.icon ?? reg?.icon ?? 'i-lucide-circle-dashed',
        order: typeof cfg.order === 'number' ? cfg.order : merged.length * 10,
        translatable: isDefault
      })
    }
  } else {
    // No config: show every registered table + every known default page
    // (DEFAULT_MENU may include standalone pages like structure/sessions that
    // are not registered CRUD tables), keeping DEFAULT_MENU's intended order.
    const seen = new Set<string>()
    const ordered = [
      ...defaultMenuMap.keys(),
      ...registered.map(r => r.meta.table)
    ]
    for (const t of ordered) {
      if (seen.has(t)) continue
      seen.add(t)
      if (!allowed(t)) continue
      const def = defaultMenuMap.get(t)
      const reg = regMetaByTable.get(t)
      merged.push({
        table: t,
        label: def?.label ?? reg?.label ?? t,
        icon: def?.icon ?? reg?.icon ?? 'i-lucide-circle-dashed',
        order: def?.order ?? merged.length * 10,
        translatable: def != null
      })
    }
  }
  merged.sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.label.localeCompare(b.label))

  const tables = registered
    .filter(r => allowed(r.meta.table))
    .map(r => ({
      table: r.meta.table,
      label: r.meta.label,
      icon: r.meta.icon,
      custom: r.meta.custom
    }))

  return { menu: merged, tables }
})

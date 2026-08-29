<script setup lang="ts">
/**
 * Dashboard table route — `/dashboard/:table` (e.g. `/dashboard/roles`).
 *
 * Dispatch rules (driven by backend registry `server/utils/dashboard/tables.ts`):
 *   1. Look up the table in the cached `dashboard:meta` response.  The
 *      backend marks each registered table with `custom: true | false`.
 *   2. If `custom: true` **and** a frontend component exists in
 *      `CUSTOM_PAGE_MAP` → render that component (full custom UI + API).
 *   3. If `custom: true` but no component is registered → show "not yet
 *      implemented" alert (graceful degradation).
 *   4. If `custom: false` → load `/api/dashboard/meta/:table` for field
 *      metadata and render the generic `DashboardCrudPage`.
 *   5. If the table is not in the registry at all → "unknown table" alert.
 *
 * NOTE: Tables with `custom: false` that also have a dedicated page file
 * (e.g. `pages/dashboard/users.vue`, `pages/dashboard/files.vue`) are
 * handled by those page files directly — Nuxt's filesystem router gives
 * static segments priority over the `[table]` dynamic segment, so this
 * file is never reached for `users` or `files`.
 *
 * NOTE: These explicit `import` statements go through the `~/components/*`
 * path which resolves via the root `components/` → `app/components/` symlink
 * (see `scripts/link-app-dirs.cjs`).  Template usage is auto-imported; only
 * the script-level reference (for `<component :is="...">`) needs an import.
 */
import type { Component } from 'vue'
import type { TableMetaWithOptions } from '~/types/dashboard'
import DashboardConfigsPage from '~/components/dashboard/configsPage.vue'

definePageMeta({ middleware: 'admin', layout: 'dashboard', keepalive: true })

const { t } = useI18n()
const route = useRoute()
const activeTable = computed<string>(() => {
  const tableName = (route.params as { table?: string }).table
  return typeof tableName === 'string' ? tableName : ''
})

useSeoMeta({
  title: () => {
    const tableName = activeTable.value || t('dashboard.title')
    return `${tableName.charAt(0).toUpperCase()}${tableName.slice(1)} · ${t('dashboard.table.seoSuffix')}`
  }
})

// ---------- Custom page component map ----------
// Maps table names (that the backend marks `custom: true`) to their
// dedicated Vue components.  Adding a new custom table requires:
//   1. Register it in `server/utils/dashboard/tables.ts` with `custom: true`
//   2. Create `app/components/dashboard/<tableName>Page.vue`
//   3. Import it above and add an entry here
//
// NOTE: `users` and `files` are `custom: false` and have their own page
// files at `pages/dashboard/users.vue` and `pages/dashboard/files.vue`.
// They reuse DashboardCrudPage with slots and are NOT listed here.
const CUSTOM_PAGE_MAP: Record<string, Component> = {
  configs: markRaw(DashboardConfigsPage)
}

function navigate(path: string) {
  if (path.startsWith('/') || path.startsWith('http')) {
    navigateTo(path)
    return
  }
  if (activeTable.value === path) return
  navigateTo(`/dashboard/${path}`)
}

// ---------- Load full metadata (menu + tables list with custom flags) ----------
const { data: metaData } = await useDashboardMeta()

// ---------- Derive dispatch state from backend metadata ----------
const tableInfo = computed(() => {
  const t = activeTable.value
  if (!t) return null
  return metaData.value?.tables?.find(x => x.table === t) ?? null
})

const isCustomTable = computed(() => tableInfo.value?.custom === true)
const customComponent = computed<Component | null>(() => {
  return CUSTOM_PAGE_MAP[activeTable.value] ?? null
})
const isUnknownTable = computed(() => !tableInfo.value)

// ---------- Load per-table field metadata for generic CRUD tables ----------
// Use `useAsyncData` (keyed by active table) so the SSR result is serialized
// into the payload and hydrated on the client. A plain `cGet` call would only
// run on the client, desyncing SSR vs client render and causing a hydration
// mismatch ("server rendered more child nodes than client").
const {
  data: tableMetaState,
  error: metaError,
  pending: metaLoading
} = useAsyncData<TableMetaWithOptions | null>(
  () => `dash-meta-${activeTable.value}`,
  async () => {
    const tableName = activeTable.value
    // Skip for custom tables or empty table names (resolve to null).
    if (!tableName || isCustomTable.value) return null
    return await cGet<TableMetaWithOptions>(`/api/dashboard/meta/${tableName}`)
  },
  { watch: [activeTable] }
)

// Normalize the async error into a displayable message (auto-fetched on
// navigation since `watch: [activeTable]` re-runs the loader above).
const tableMetaError = computed(() =>
  metaError.value ? extractErrorMessage(metaError.value, t('dashboard.table.loadMetaFailed')) : ''
)
</script>

<template>
  <DashboardShell :active-table="activeTable" @navigate="navigate">
    <template #default>
      <!-- Error loading metadata (generic tables only) -->
      <UContainer v-if="tableMetaError" class="py-10">
        <UAlert color="error" :title="t('dashboard.table.loadFailed')" :description="tableMetaError" />
      </UContainer>

      <!-- Custom page: backend says custom:true AND we have a component -->
      <component
        v-else-if="isCustomTable && customComponent"
        :is="customComponent"
      />

      <!-- Custom table but no frontend component yet -->
      <UContainer v-else-if="isCustomTable && !customComponent" class="py-10">
        <UAlert
          color="warning"
          :title="t('dashboard.table.customNotImplemented')"
          :description="t('dashboard.table.customNotImplementedDesc', { table: activeTable })"
        />
      </UContainer>

      <!-- Generic CRUD (e.g. /dashboard/roles) -->
      <template v-else-if="!isUnknownTable && tableMetaState && !tableMetaState.custom">
        <DashboardCrudPage v-if="!metaLoading" :meta="tableMetaState" />
        <UContainer v-else class="py-10">
          <UCard class="h-96"><div class="p-6 text-muted">{{ t('dashboard.table.loadingMeta') }}</div></UCard>
        </UContainer>
      </template>

      <!-- Unknown table (not in backend registry) -->
      <UContainer v-else-if="isUnknownTable && !metaLoading" class="py-10">
        <UAlert
          color="warning"
          :title="t('dashboard.table.unknownTable')"
          :description="t('dashboard.table.unknownTableDesc', { table: activeTable })"
        />
      </UContainer>
    </template>
  </DashboardShell>
</template>

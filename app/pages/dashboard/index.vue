<script setup lang="ts">
/**
 * Dashboard overview — exact path `/dashboard`.
 *
 * Because `pages/dashboard.vue` is now the GROUP LAYOUT (rendering `<NuxtPage/>`),
 * the overview page content has moved into this file (`dashboard/index.vue`).
 *
 * Stats cards + quick-entry buttons for each menu row.  Table-level detail
 * routes live alongside this file as `dashboard/[table].vue` so their URLs
 * read cleanly as `/dashboard/roles`, `/dashboard/users`, etc.
 */
import type { DashboardMenuItem } from '~/types/dashboard'

definePageMeta({ middleware: 'admin', layout: 'dashboard', keepalive: true })
const { t } = useI18n()
const { menuLabel } = useDashboardLabels()
useSeoMeta({ title: () => `${t('dashboard.title')} · Dashboard` })

function navigate(table: string) { navigateTo(`/dashboard/${table}`) }

// Overview targets are derived from the shared dashboard metadata so any
// newly registered non-custom table automatically appears here (instead of
// a hardcoded list).  Same `dashboard:meta` cache as the shell & nav.
const { data: metaData } = useDashboardMeta()

// Only non-custom tables are reachable through the generic /api/dashboard/data API.
const overviewTargets = computed<string[]>(() =>
  (metaData.value?.tables ?? [])
    .filter(t => !t.custom)
    .map(t => t.table)
)

// Overview counts (SSR-friendly)
const { data: overview } = await useAsyncData(
  'dashboard:overview',
  () => Promise.all(
    overviewTargets.value.map(async (table) => {
      let total = -1
      try {
        const row = await cGet<{ items: unknown[]; pagination: { total: number } }>(`/api/dashboard/data/${table}`, { pageSize: 1 })
        total = row?.pagination?.total ?? -1
      } catch { /* keep -1 */ }
      return { table, total }
    })
  ).then(results => Object.fromEntries(results.map(r => [r.table, r.total]))),
  { server: true, watch: [overviewTargets] }
)

interface SlotScope {
  menu: DashboardMenuItem[]
  metaError: unknown
}
function labelForTable(t: string, scope: SlotScope) {
  const item = scope.menu.find(m => m.table === t)
  return item ? menuLabel(item) : t
}
function iconForTable(t: string, scope: SlotScope) {
  return scope.menu.find(m => m.table === t)?.icon ?? 'i-lucide-circle-dashed'
}
</script>

<template>
  <DashboardShell @navigate="navigate">
    <template #default="{ menu, metaError }: { menu: DashboardMenuItem[]; metaError: unknown }">
      <UContainer class="py-10 max-w-7xl">
        <header class="mb-8">
          <h1 class="text-3xl font-bold">{{ t('dashboard.overview.title') }}</h1>
          <p class="text-muted mt-1">
            {{ t('dashboard.overview.description') }}
          </p>
        </header>

        <div v-if="metaError" class="mb-4">
          <UAlert color="error" :title="t('dashboard.overview.menuLoadFailed')" :description="(metaError as { message?: string })?.message ?? ''" />
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          <UCard
            v-for="tName in overviewTargets"
            :key="tName"
            class="hover:shadow-md transition-shadow"
          >
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon :name="iconForTable(tName, { menu, metaError })" class="h-5 w-5 text-primary" />
                <span class="text-sm text-muted">{{ labelForTable(tName, { menu, metaError }) }}</span>
              </div>
            </template>
            <div class="flex items-baseline gap-2">
              <span class="text-3xl font-bold">{{ overview?.[tName] ?? 0 }}</span>
              <span class="text-xs text-muted">{{ t('dashboard.overview.recordsUnit') }}</span>
            </div>
            <template #footer>
              <UButton
                variant="ghost"
                size="xs"
                :to="`/dashboard/${tName}`"
                color="primary"
                class="w-full justify-start"
              >
                {{ t('dashboard.overview.viewDetail') }} <UIcon name="i-lucide-arrow-right" class="ml-1 h-3.5 w-3.5" />
              </UButton>
            </template>
          </UCard>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
          <!-- Record count distribution per table -->
          <UCard class="lg:col-span-2">
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-bar-chart-3" class="h-5 w-5 text-primary" />
                <span class="font-medium">{{ t('dashboard.overview.distribution') }}</span>
              </div>
            </template>
            <BaseMiniBars
              :items="overviewTargets.map(t => ({
                label: labelForTable(t, { menu, metaError }),
                icon: iconForTable(t, { menu, metaError }),
                value: overview?.[t] ?? 0
              }))"
            />
          </UCard>

          <!-- Explanation -->
          <UCard>
            <template #header>
              <div class="flex items-center gap-2">
                <UIcon name="i-lucide-info" class="h-5 w-5 text-primary" />
                <span class="font-medium">{{ t('dashboard.overview.hint') }}</span>
              </div>
            </template>
            <p class="text-sm text-muted">{{ t('dashboard.overview.description') }}</p>
          </UCard>
        </div>

        <UCard>
          <template #header>
            <h2 class="text-lg font-semibold">{{ t('dashboard.overview.quickEntry') }}</h2>
          </template>
          <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            <UButton
              v-for="item in menu"
              :key="item.table"
              :to="`/dashboard/${item.table}`"
              variant="soft"
              class="justify-start"
            >
              <UIcon :name="item.icon" class="h-4 w-4 mr-2 shrink-0" />
              <span class="truncate">{{ menuLabel(item) }}</span>
            </UButton>
          </div>
        </UCard>
      </UContainer>
    </template>
  </DashboardShell>
</template>

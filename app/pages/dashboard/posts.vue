<script setup lang="ts">
/**
 * Posts dashboard page — `/dashboard/posts`.
 *
 * The blog post table is generic (`custom: false`), so this page reuses the
 * host <DashboardCrudPage> unchanged, adding only a "restore version" button
 * to each row's action column via the `#table-actions-prepend` slot.
 */
import type { TableMetaWithOptions } from '~/types/dashboard'

definePageMeta({ middleware: 'admin', layout: 'dashboard', keepalive: true })

useSeoMeta({ title: 'Posts · Dashboard' })

const { data: meta } = await useAsyncData<TableMetaWithOptions | null>(
  'posts:meta',
  () => cGet<TableMetaWithOptions>('/api/dashboard/meta/posts').catch(() => null)
)

function navigate(table: string) {
  if (table === 'posts') return
  navigateTo(`/dashboard/${table}`)
}
</script>

<template>
  <DashboardShell active-table="posts" @navigate="navigate">
    <template #default>
      <DashboardCrudPage v-if="meta" :meta="meta">
        <template #table-actions-prepend="{ item }">
          <BaseVersionHistoryModal
            :table="'posts'"
            :id="item.id"
            variant="icon"
          />
        </template>
      </DashboardCrudPage>
      <UContainer v-else class="py-10">
        <UCard class="h-96">
          <div class="p-6 text-muted">{{ $t('dashboard.table.loadingMeta') }}</div>
        </UCard>
      </UContainer>
    </template>
  </DashboardShell>
</template>

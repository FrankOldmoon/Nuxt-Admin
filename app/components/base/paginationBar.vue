<script setup lang="ts">
import type { PaginationMeta } from '~/types/pagination'

const props = defineProps<{
  pagination: PaginationMeta | null | undefined
  page: number
  pageSize: number
}>()

const emit = defineEmits<{
  'update:page': [number]
  'update:pageSize': [number]
}>()

const { t } = useI18n()

const pageSizes = [10, 20, 50, 100]
</script>

<template>
  <div
    v-if="props.pagination && props.pagination.total > 0"
    class="flex flex-wrap items-center justify-between gap-3 pt-4"
  >
    <div class="text-sm text-muted">
      {{ t('pagination.total', { total: props.pagination.total }) }}
      <span class="ml-2 text-dimmed">
        {{ t('pagination.range', {
          from: (props.pagination.page - 1) * props.pagination.pageSize + 1,
          to: Math.min(props.pagination.page * props.pagination.pageSize, props.pagination.total)
        }) }}
      </span>
    </div>
    <div class="flex items-center gap-3">
      <USelectMenu
        :model-value="props.pageSize"
        value-key="value"
        :items="pageSizes.map(s => ({ label: `${s} / ${t('pagination.page')}`, value: s }))"
        size="xs"
        @update:model-value="emit('update:pageSize', Number($event))"
      />
      <UPagination
        :page="props.page"
        :total="props.pagination.total"
        :items-per-page="props.pageSize"
        size="sm"
        @update:page="emit('update:page', $event)"
      />
    </div>
  </div>
</template>

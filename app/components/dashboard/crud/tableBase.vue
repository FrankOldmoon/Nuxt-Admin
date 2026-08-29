<script setup lang="ts">
import type { PaginationMeta } from '~/types/pagination'

defineProps<{
  pending?: boolean
  loadingText?: string
  emptyText?: string
  hasItems?: boolean
  pagination?: PaginationMeta | null
  page: number
  pageSize: number
}>()

const emit = defineEmits<{
  'update:page': [number]
  'update:pageSize': [number]
}>()
</script>

<template>
  <UCard>
    <div
      v-if="pending"
      class="py-12 text-center text-muted"
    >
      {{ loadingText }}
    </div>
    <div
      v-else-if="!hasItems"
      class="py-12 text-center text-muted"
    >
      {{ emptyText }}
    </div>
    <div v-else>
      <div class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-default text-left text-muted">
              <slot name="table-header" />
            </tr>
          </thead>
          <tbody>
            <slot name="table-body" />
          </tbody>
        </table>
      </div>
      <BasePaginationBar
        :pagination="pagination"
        :page="page"
        :page-size="pageSize"
        @update:page="emit('update:page', $event)"
        @update:page-size="emit('update:pageSize', $event)"
      />
    </div>
  </UCard>
</template>

<script setup lang="ts" generic="T extends object">
import { computed, ref, watch } from 'vue'
import type { FieldMeta, TableMetaWithOptions } from '~/types/dashboard'

type BusinessField = Pick<FieldMeta, 'key' | 'label' | 'type'> & Partial<FieldMeta>

const props = defineProps<{
  items: T[]
  fields: BusinessField[]
  pending?: boolean
  rowKey?: string
}>()
const slots = defineSlots<{
  [key: `table-${string}`]: (props: { item: T, value?: unknown }) => unknown
}>()
const search = ref('')
const page = ref(1)
const pageSize = ref(20)
const sort = ref<{ field: string, order: 'asc' | 'desc' } | null>(null)
const tableFields = computed<FieldMeta[]>(() => props.fields.map(field => ({
  nullable: true, showInForm: false, showInTable: true, showInDetail: false, editable: false,
  ...field
})))
const meta = computed<TableMetaWithOptions>(() => ({
  table: 'business-list', label: '业务记录', icon: '', fields: tableFields.value,
  features: { softDelete: false, search: [], detail: false },
  custom: true, relationOptions: {}
}))
const filtered = computed(() => {
  const needle = search.value.trim().toLocaleLowerCase()
  const rows = props.items.map((item, index) => {
    const row = item as Record<string, unknown>
    return { ...row, id: row[props.rowKey ?? 'id'] ?? index }
  }).filter(row => !needle || Object.values(row).some(value => String(value ?? '').toLocaleLowerCase().includes(needle)))
  if (sort.value) {
    const { field, order } = sort.value
    rows.sort((a, b) => {
      const left = (a as Record<string, unknown>)[field]
      const right = (b as Record<string, unknown>)[field]
      const result = typeof left === 'number' && typeof right === 'number'
        ? left - right
        : String(left ?? '').localeCompare(String(right ?? ''), 'zh-CN', { numeric: true })
      return order === 'asc' ? result : -result
    })
  }
  return rows
})
const totalPages = computed(() => Math.max(1, Math.ceil(filtered.value.length / pageSize.value)))
watch([search, pageSize, () => props.items], () => {
  page.value = 1
})
watch(totalPages, (total) => {
  page.value = Math.min(page.value, total)
})
const pagination = computed(() => ({
  page: page.value, pageSize: pageSize.value, total: filtered.value.length,
  totalPages: totalPages.value, hasNext: page.value < totalPages.value, hasPrev: page.value > 1
}))
const visible = computed(() => filtered.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
</script>

<template>
  <div class="space-y-2">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <UInput
        v-model="search"
        icon="i-lucide-search"
        placeholder="搜索已加载记录"
        aria-label="搜索已加载记录"
      />
      <span class="text-xs text-muted">已加载 {{ items.length }} 条；可用页面上方条件查询其他记录</span>
    </div>
    <DashboardCrudTable
      v-model:page="page"
      v-model:page-size="pageSize"
      :meta="meta"
      :items="visible"
      :visible-fields="tableFields"
      :pending="pending"
      :pagination="pagination"
      :sort="sort"
      business
      @sort="sort = $event"
    >
      <template
        v-for="(_, name) in slots"
        #[name]="scope"
      >
        <slot
          :name="name"
          :item="scope.item as T"
          :value="scope.value"
        />
      </template>
    </DashboardCrudTable>
  </div>
</template>

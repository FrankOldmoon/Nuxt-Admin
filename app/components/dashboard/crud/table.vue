<script setup lang="ts">
/**
 * Generic CRUD table driven by TableMeta, built on UTable (TanStack).
 * - Column pinning via v-model:column-pinning (select + first field left, actions right)
 * - Cell rendering via DashboardCellRenderer or parent `table-{field.key}` slot
 * - Sort by clicking header buttons (emits `sort`)
 * - Selection via useCrudSelection (checkbox header + cells)
 * - Row actions via DashboardCrudRowActions
 */
import { h, resolveComponent } from 'vue'
import type { TableColumn } from '@nuxt/ui'
import type { TableMetaWithOptions, FieldMeta } from '~/types/dashboard'
import { useCrudSelection } from '~/composables/useCrudSelection'

type SortState = { field: string, order: 'asc' | 'desc' } | null

const props = defineProps<{
  meta: TableMetaWithOptions
  items: Record<string, unknown>[]
  visibleFields: FieldMeta[]
  pending?: boolean
  trashed?: boolean
  pagination?: import('~/types/pagination').PaginationMeta | null
  page?: number
  pageSize?: number
  sort?: SortState
}>()

const emit = defineEmits<{
  detail: [item: Record<string, unknown>]
  edit: [item: Record<string, unknown>]
  delete: [item: Record<string, unknown>]
  restore: [item: Record<string, unknown>]
  permanentDelete: [item: Record<string, unknown>]
  batchAction: [action: 'soft-delete' | 'restore' | 'permanent-delete', ids: Array<string | number>]
  'update:page': [number]
  'update:pageSize': [number]
  sort: [SortState]
}>()

const { t } = useI18n()
const { fieldLabel } = useDashboardLabels()
const { can } = usePermission()
const slots = useSlots()
const { selectedIds, toggleItem, toggleAll, isSelected, isAllSelected, isSomeSelected, hasSelection, clear } = useCrudSelection<number | string>()
watch(() => props.trashed, () => clear())

// Resolve auto-imported components for use in render functions
const CellRenderer = resolveComponent('DashboardCellRenderer')
const RowActions = resolveComponent('DashboardCrudRowActions')
const UCheckbox = resolveComponent('UCheckbox')
const UIcon = resolveComponent('UIcon')

// ---- Sort (UTable native sorting, synced with parent's SortState) ----
const sorting = ref<{ id: string, desc: boolean }[]>([])

// Sync parent → sorting
watch(() => props.sort, (val) => {
  if (!val) {
    if (sorting.value.length > 0) sorting.value = []
  } else {
    const cur = sorting.value[0]
    if (!cur || cur.id !== val.field || cur.desc !== (val.order === 'desc')) {
      sorting.value = [{ id: val.field, desc: val.order === 'desc' }]
    }
  }
}, { immediate: true })

// Sync sorting → parent
watch(sorting, (val) => {
  if (val.length === 0) {
    if (props.sort) emit('sort', null)
  } else {
    const s = val[0]!
    if (!props.sort || props.sort.field !== s.id || props.sort.order !== (s.desc ? 'desc' : 'asc')) {
      emit('sort', { field: s.id, order: s.desc ? 'desc' : 'asc' })
    }
  }
}, { deep: true })

function idOf(item: Record<string, unknown>): number | string {
  return (item.id as number | string) ?? String(item)
}

const selectableItems = computed(() => props.items as unknown as { id: number | string }[])

function emitBatch(action: 'soft-delete' | 'restore' | 'permanent-delete') {
  emit('batchAction', action, [...selectedIds.value])
}

// ---- Build UTable columns ----
type Row = Record<string, unknown>

const columns = computed<TableColumn<Row>[]>(() => {
  const cols: TableColumn<Row>[] = []

  // Select column (pinned left)
  cols.push({
    id: 'select',
    size: 48,
    enableSorting: false,
    enablePinning: true,
    meta: { class: { th: 'text-left', td: 'text-left' } },
    header: () => h(UCheckbox, {
      'modelValue': isAllSelected(selectableItems.value),
      'indeterminate': isSomeSelected(selectableItems.value),
      'onUpdate:modelValue': () => toggleAll(selectableItems.value)
    }),
    cell: ({ row }) => h(UCheckbox, {
      'modelValue': isSelected(idOf(row.original)),
      'onUpdate:modelValue': () => toggleItem(idOf(row.original))
    })
  })

  // Data columns
  for (const f of props.visibleFields) {
    cols.push({
      accessorKey: f.key,
      enableSorting: true,
      meta: f.widthClass
        ? { class: { th: `text-left whitespace-nowrap ${f.widthClass}`, td: f.widthClass } }
        : { class: { th: 'text-left whitespace-nowrap' } },
      header: fieldLabel(props.meta.table, f),
      cell: ({ row }) => {
        const slotName = `table-${f.key}`
        if (slots[slotName]) {
          return slots[slotName]!({ item: row.original, value: row.original[f.key] })
        }
        return h(CellRenderer, {
          field: f,
          value: row.original[f.key],
          options: props.meta.relationOptions?.[f.key],
          variant: 'table'
        })
      }
    })
  }

  // Actions column (pinned right)
  cols.push({
    id: 'actions',
    size: 144,
    enableSorting: false,
    enablePinning: true,
    meta: { class: { th: 'text-right', td: 'text-right' } },
    header: () => t('dashboard.crud.action'),
    cell: ({ row }) => {
      const prepend = slots['table-actions-prepend']
      const actions = h(RowActions, {
        item: row.original,
        table: props.meta.table,
        mode: props.trashed ? 'trashed' : 'active',
        showDetail: props.meta.features.detail !== false,
        onDetail: () => emit('detail', row.original),
        onEdit: () => emit('edit', row.original),
        onDelete: () => emit('delete', row.original),
        onRestore: () => emit('restore', row.original),
        onPermanentDelete: () => emit('permanentDelete', row.original)
      })
      if (!prepend) return actions
      return h('div', { class: 'flex items-center justify-end gap-0.5' }, [prepend({ item: row.original }), actions])
    }
  })

  return cols
})

// ---- Column pinning (sticky columns) ----
// select + first visible field on the left, actions on the right
const columnPinning = ref<{ left: string[], right: string[] }>({
  left: ['select'],
  right: ['actions']
})

watch(() => props.visibleFields[0]?.key, (key) => {
  columnPinning.value = {
    left: key ? ['select', key] : ['select'],
    right: ['actions']
  }
}, { immediate: true })

// Stable row id for TanStack (used by get-row-id prop)
function getRowId(row: Record<string, unknown>): string {
  return String(row.id)
}
</script>

<template>
  <!-- Batch action bar (above table, shown when items are selected) -->
  <div
    v-if="hasSelection"
    class="mb-2 flex items-center justify-between rounded-md border border-default bg-elevated px-3 py-2"
  >
    <span class="text-sm text-muted">{{ t('dashboard.crud.selectedCount', { count: [...selectedIds].length }) }}</span>
    <div class="flex gap-2">
      <template v-if="!trashed">
        <BaseConfirmButton
          v-if="meta.features.softDelete && can(meta.table, 'delete')"
          :label="t('dashboard.crud.batchDelete')"
          :confirm-label="t('dashboard.crud.batchDeleteConfirm')"
          color="warning"
          variant="solid"
          size="xs"
          @confirm="emitBatch('soft-delete')"
        />
        <BaseConfirmButton
          v-if="can(meta.table, 'delete')"
          :label="t('dashboard.crud.permanentDelete')"
          :confirm-label="t('dashboard.crud.permanentDeleteConfirm')"
          color="error"
          variant="solid"
          size="xs"
          @confirm="emitBatch('permanent-delete')"
        />
      </template>
      <template v-else>
        <UButton
          v-if="can(meta.table, 'update')"
          size="xs" variant="solid" color="success" @click="emitBatch('restore')"
        >
          {{ t('dashboard.crud.batchRestore') }}
        </UButton>
        <BaseConfirmButton
          v-if="can(meta.table, 'delete')"
          :label="t('dashboard.crud.permanentDelete')"
          :confirm-label="t('dashboard.crud.permanentDeleteConfirm')"
          color="error"
          variant="solid"
          size="xs"
          @confirm="emitBatch('permanent-delete')"
        />
      </template>
    </div>
  </div>

  <UCard>
    <div v-if="pending" class="py-12 text-center text-muted">{{ t('common.loading') }}</div>
    <div v-else-if="items.length === 0" class="py-12 text-center text-muted">{{ t('dashboard.crud.empty') }}</div>
    <template v-else>
      <BasePaginationBar
        :pagination="pagination"
        :page="page ?? 1"
        :page-size="pageSize ?? 10"
        @update:page="emit('update:page', $event)"
        @update:page-size="emit('update:pageSize', $event)"
      />
      <UTable
        :data="items"
        :columns="columns"
        v-model:column-pinning="columnPinning"
        v-model:sorting="sorting"
        :sorting-options="{ manualSorting: true }"
        :get-row-id="getRowId"
        sticky
        class="w-full text-sm"
      >
        <!-- Sortable header for each data column (server-side sort via v-model:sorting) -->
        <template
          v-for="f in visibleFields"
          :key="`hdr-${f.key}`"
          #[`${f.key}-header`]="{ column }"
        >
          <button
            type="button"
            class="inline-flex items-center gap-1 hover:text-primary transition"
            @click="column.toggleSorting(column.getIsSorted() === 'asc')"
          >
            <span>{{ fieldLabel(meta.table, f) }}</span>
            <UIcon
              :name="column.getIsSorted() === 'asc'
                ? 'i-lucide-arrow-up-narrow-wide'
                : column.getIsSorted() === 'desc'
                  ? 'i-lucide-arrow-down-wide-narrow'
                  : 'i-lucide-arrow-up-down'"
              :class="['size-3.5', column.getIsSorted() ? 'text-primary' : 'text-muted/50']"
            />
          </button>
        </template>
      </UTable>
    </template>
  </UCard>
</template>

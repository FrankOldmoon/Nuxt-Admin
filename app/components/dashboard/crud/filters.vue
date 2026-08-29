<script setup lang="ts">
/**
 * Dynamic metadata-driven filter builder + search bar.
 *
 * Emits two separate reactive values (split because quick filters and the
 * advanced condition builder serve distinct audiences):
 *
 *   • filters: Record<string,string>   — "legacy" quick-select slot values
 *     (e.g. files.vue mimeType dropdown, users.vue role select).  These
 *     are exact-match / contains semantics and get AND-ed by the server
 *     alongside the structured conditions below.
 *   • conditions: AdvancedFilterCondition[]  — dynamic "add a row" builder
 *     with [logic] [column] [operator] [value] cells.
 *
 * The two outputs are kept independent so a page can provide only quick
 * filters, only the advanced builder, or both — and `usePagedResource`
 * serialises them into distinct query params (`conditions` JSON for
 * structured, per-column query keys for quick filters).
 */
import type {
  AdvancedFilterCondition,
  FieldMeta,
  FilterOperator,
  FilterOperatorMeta,
  TableMetaWithOptions
} from '~/types/dashboard'

const props = defineProps<{
  /** Legacy quick-filter payload — only used by custom slots. */
  filters: Record<string, string>
  /** Structured advanced conditions built by this component. */
  conditions: AdvancedFilterCondition[]
  /** Table metadata required to render the column/operator dropdowns. */
  meta: TableMetaWithOptions
}>()

const emit = defineEmits<{
  'update:filters': [Record<string, string>]
  'update:conditions': [AdvancedFilterCondition[]]
}>()

const { t } = useI18n()
const { fieldLabel } = useDashboardLabels()
const { getOperatorsForType, isFilterable } = useFilterOperators()

/** Unified field label (i18n first, backend fallback) */
function fLabel(f: FieldMeta | undefined): string {
  return f ? fieldLabel(props.meta.table, f) : ''
}

// ---------------- Filter panel visibility (inline toggle) ----------------
const showFilters = ref(false)

// ---------------- Search (debounced, mixed into `filters.search`) ----------------
const localSearch = ref((props.filters?.search) ?? '')
let searchTimer: ReturnType<typeof setTimeout> | undefined
watch(localSearch, (val) => {
  clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    const next = { ...(props.filters ?? {}) }
    if (val) next.search = val
    else delete next.search
    emit('update:filters', next)
  }, 300)
})
watch(() => props.filters?.search, (val) => {
  if ((val ?? '') !== localSearch.value) localSearch.value = val ?? ''
})

// ---------------- Quick filter helpers (for `#filters` custom slot) ----------------
function set(key: string, value: string | number | undefined) {
  const next = { ...(props.filters ?? {}) }
  const v = value === undefined || value === '' ? '' : String(value)
  if (v) next[key] = v
  else delete next[key]
  emit('update:filters', next)
}

// ---------------- Advanced condition rows ----------------
const logicOptions = [
  { label: 'AND', value: 'AND' as const },
  { label: 'OR', value: 'OR' as const }
]

/** Filterable columns.  Excludes many-to-many (SQL subqueries not yet
 *  wired in the server side) and pure-display columns. */
const filterableFields = computed<FieldMeta[]>(() =>
  props.meta.fields.filter(f => isFilterable(f.type))
)

/** Map for quick lookups inside a single row. */
function fieldByKey(key: string): FieldMeta | undefined {
  return filterableFields.value.find(f => f.key === key)
}

/** For a given row, resolve the list of valid operator options. */
function operatorOptions(row: AdvancedFilterCondition): FilterOperatorMeta[] {
  const f = fieldByKey(row.field)
  return f ? getOperatorsForType(f.type) : []
}

/** Resolve the currently-selected operator meta for a row. */
function currentOperator(row: AdvancedFilterCondition): FilterOperatorMeta | undefined {
  return operatorOptions(row).find(m => m.op === row.op)
}

/** For select/relation columns we render a dropdown from the
 *  `relationOptions` map; otherwise a text/number/boolean/date widget. */
function fieldOptions(row: AdvancedFilterCondition): { label: string, value: string | number }[] {
  const f = fieldByKey(row.field)
  if (!f) return []
  if (f.relation || f.type === 'select') {
    const opts = props.meta.relationOptions?.[f.key] ?? f.options ?? []
    return opts.map(o => ({ label: o.label, value: o.value as string | number }))
  }
  if (f.type === 'boolean') {
    return [
      { label: t('dashboard.crud.booleanYes'), value: 'true' },
      { label: t('dashboard.crud.booleanNo'), value: 'false' }
    ]
  }
  return []
}

/** Adds a new condition at the bottom.  Defaults: AND + first field + first
 *  operator + empty value (operator with needsValue=false will ignore it). */
function addCondition() {
  const firstField = filterableFields.value[0]
  if (!firstField) return
  const ops = getOperatorsForType(firstField.type)
  const firstOp = ops[0]
  if (!firstOp) return
  const conds = props.conditions ?? []
  const row: AdvancedFilterCondition = {
    logic: conds.length === 0 ? 'AND' : 'AND',
    field: firstField.key,
    op: firstOp.op,
    value: firstOp.needsValue ? defaultValue(firstField, firstOp) : undefined
  }
  emit('update:conditions', [...conds, row])
}

function removeCondition(idx: number) {
  emit('update:conditions', (props.conditions ?? []).filter((_, i) => i !== idx))
}

function updateRow(idx: number, patch: Partial<AdvancedFilterCondition>) {
  const next = (props.conditions ?? []).slice()
  const existing = next[idx]
  if (!existing) return
  const merged = { ...existing, ...patch }
  // When switching FIELD, reset OPERATOR to the new type's first option,
  // and reset value accordingly (prevents number→eq leaking into text field)
  if (patch.field && patch.field !== existing.field) {
    const f = fieldByKey(merged.field)
    const ops = getOperatorsForType(f?.type ?? 'text')
    const firstOp = ops[0]
    if (firstOp) {
      merged.op = firstOp.op
      merged.value = firstOp.needsValue ? defaultValue(f, firstOp) : undefined
    }
  } else if (patch.op) {
    const f = fieldByKey(merged.field)
    const op = getOperatorsForType(f?.type ?? 'text').find(m => m.op === merged.op)
    if (!op || !op.needsValue) merged.value = undefined
    else merged.value = defaultValue(f, op)
  }
  next[idx] = merged
  emit('update:conditions', next)
}

/** Between values use a pair: [min, max]; everything else starts empty. */
function defaultValue(f: FieldMeta | undefined, op: FilterOperatorMeta): AdvancedFilterCondition['value'] {
  if (op.valueKind === 'between') {
    if (f?.type === 'number' || f?.type === 'relation' || f?.type === 'select') return ['', '']
    return ['', '']
  }
  if (f?.type === 'boolean') return true
  return ''
}

/** Between-pair helpers: index 0 = min, index 1 = max. */
function betweenMin(row: AdvancedFilterCondition): string | number {
  const arr = Array.isArray(row.value) ? row.value as (string | number)[] : ['', '']
  return arr[0] ?? ''
}
function betweenMax(row: AdvancedFilterCondition): string | number {
  const arr = Array.isArray(row.value) ? row.value as (string | number)[] : ['', '']
  return arr[1] ?? ''
}
function updateBetween(rowIdx: number, side: 0 | 1, val: string | number) {
  const conds = props.conditions ?? []
  const pair: (string | number)[] = Array.isArray(conds[rowIdx]?.value)
    ? [...conds[rowIdx].value as (string | number)[]]
    : ['', '']
  pair[side] = val
  updateRow(rowIdx, { value: pair })
}

function clearAll() {
  localSearch.value = ''
  emit('update:filters', {})
  emit('update:conditions', [])
}

const advancedActiveCount = computed(() => (props.conditions?.length ?? 0))
const quickActiveCount = computed(() =>
  Object.keys(props.filters ?? {}).filter(k => k !== 'search' && (props.filters ?? {})[k]).length
)
const totalActiveCount = computed(() => advancedActiveCount.value + quickActiveCount.value + (localSearch.value ? 1 : 0))

const hasCustomSlot = !!useSlots().default
</script>

<template>
  <div class="mb-4 space-y-2">
    <!-- Top row: [filters toggle] [search box flex-1] [right slot] -->
    <div class="flex items-center gap-2">
      <!-- Filters toggle (left of search) -->
      <UButton
        size="sm"
        variant="ghost"
        color="neutral"
        class="shrink-0"
        @click="showFilters = !showFilters"
      >
        <UIcon name="i-lucide-sliders-horizontal" />
        <UBadge
          v-if="totalActiveCount > 0"
          :label="String(totalActiveCount)"
          color="primary"
          variant="subtle"
          size="sm"
        />
        <UIcon
          name="i-lucide-chevron-down"
          class="transition"
          :class="{ 'rotate-180': showFilters }"
        />
      </UButton>

      <!-- Search bar (flex-1, fills remaining space) -->
      <UInput
        v-model="localSearch"
        icon="i-lucide-search"
        :placeholder="t('common.searchPlaceholder')"
        class="flex-1"
      />

      <!-- Right slot (columns toggle etc.) -->
      <slot name="right" />
    </div>

    <!-- Filter panel: inline (occupies space), toggled by the button above -->
    <div
      v-if="showFilters"
      class="space-y-3 rounded border border-default bg-muted/30 p-3"
    >
      <!-- Quick filter custom slot (pages can inject e.g. role/mimeType selects) -->
      <div v-if="hasCustomSlot" class="flex flex-wrap items-end gap-3 border-b border-default pb-3">
        <slot :set="set" :filters="props.filters ?? {}" />
      </div>

      <!-- Advanced condition builder: one row per condition -->
      <div class="space-y-2">
        <div
          v-for="(row, i) in (conditions ?? [])"
          :key="i"
          class="flex items-end gap-2"
        >
          <!-- Logic connector (AND/OR) — hidden for the very first row -->
          <div v-if="i === 0" class="w-16 shrink-0" />
          <USelectMenu
            v-else
            v-model="row.logic"
            value-key="value"
            :items="logicOptions"
            size="xs"
            class="w-16 shrink-0"
            @update:model-value="v => updateRow(i, { logic: v as any })"
          />

          <!-- Column -->
          <USelectMenu
            :model-value="row.field"
            value-key="value"
            :items="filterableFields.map(f => ({ label: `${fLabel(f)} (${f.key})`, value: f.key }))"
            size="xs"
            class="flex-1 min-w-0"
            @update:model-value="v => updateRow(i, { field: String(v) })"
          />

          <!-- Operator -->
          <USelectMenu
            :model-value="row.op"
            value-key="value"
            :items="operatorOptions(row).map(m => ({ label: m.label, value: m.op }))"
            size="xs"
            class="w-24 shrink-0"
            @update:model-value="v => updateRow(i, { op: v as FilterOperator })"
          />

          <!-- Value cell — rendered differently per operator.valueKind.
               All value inputs use flex-1 so they have the same width. -->
          <template v-if="currentOperator(row)?.needsValue">
            <!-- between (min/max pair) -->
            <div v-if="currentOperator(row)?.valueKind === 'between'" class="flex items-end gap-1 flex-1 min-w-0">
              <UInput
                :model-value="String(betweenMin(row))"
                :type="(fieldByKey(row.field)?.type === 'number' || fieldByKey(row.field)?.type === 'relation' || fieldByKey(row.field)?.type === 'select') ? 'number' : fieldByKey(row.field)?.type === 'date' ? 'date' : fieldByKey(row.field)?.type === 'datetime' ? 'datetime-local' : 'text'"
                size="xs"
                :placeholder="fieldByKey(row.field)?.type === 'date' || fieldByKey(row.field)?.type === 'datetime' ? 'From' : 'Min'"
                class="flex-1 min-w-0"
                @update:model-value="v => updateBetween(i, 0, v ?? '')"
              />
              <span class="text-xs text-muted px-0.5">—</span>
              <UInput
                :model-value="String(betweenMax(row))"
                :type="(fieldByKey(row.field)?.type === 'number' || fieldByKey(row.field)?.type === 'relation' || fieldByKey(row.field)?.type === 'select') ? 'number' : fieldByKey(row.field)?.type === 'date' ? 'date' : fieldByKey(row.field)?.type === 'datetime' ? 'datetime-local' : 'text'"
                size="xs"
                :placeholder="fieldByKey(row.field)?.type === 'date' || fieldByKey(row.field)?.type === 'datetime' ? 'To' : 'Max'"
                class="flex-1 min-w-0"
                @update:model-value="v => updateBetween(i, 1, v ?? '')"
              />
            </div>
            <!-- boolean -->
            <USelectMenu
              v-else-if="fieldByKey(row.field)?.type === 'boolean'"
              :model-value="String(row.value ?? true)"
              value-key="value"
              :items="fieldOptions(row)"
              size="xs"
              class="flex-1 min-w-0"
              @update:model-value="v => updateRow(i, { value: v === 'true' })"
            />
            <!-- select / relation (dropdown with labels) -->
            <USelectMenu
              v-else-if="currentOperator(row)?.valueKind === 'select' || fieldByKey(row.field)?.type === 'relation' || fieldByKey(row.field)?.type === 'select'"
              :model-value="String(row.value ?? '')"
              value-key="value"
              :items="fieldOptions(row)"
              :placeholder="t('dashboard.crud.selectPlaceholder', { label: fLabel(fieldByKey(row.field)) })"
              size="xs"
              class="flex-1 min-w-0"
              @update:model-value="v => updateRow(i, { value: v === undefined ? undefined : (fieldByKey(row.field)?.type === 'number' || fieldByKey(row.field)?.type === 'relation' ? Number(v) ?? '' : v) })"
            />
            <!-- number -->
            <UInput
              v-else-if="currentOperator(row)?.valueKind === 'number'"
              :model-value="String(row.value ?? '')"
              type="number"
              size="xs"
              class="flex-1 min-w-0"
              @update:model-value="v => updateRow(i, { value: v === '' || v === undefined ? '' : Number(v) })"
            />
            <!-- date -->
            <UInput
              v-else-if="currentOperator(row)?.valueKind === 'date'"
              :model-value="String(row.value ?? '')"
              type="date"
              size="xs"
              class="flex-1 min-w-0"
              @update:model-value="v => updateRow(i, { value: v ?? '' })"
            />
            <!-- datetime -->
            <UInput
              v-else-if="currentOperator(row)?.valueKind === 'datetime'"
              :model-value="String(row.value ?? '')"
              type="datetime-local"
              size="xs"
              class="flex-1 min-w-0"
              @update:model-value="v => updateRow(i, { value: v ?? '' })"
            />
            <!-- default: text -->
            <UInput
              v-else
              :model-value="String(row.value ?? '')"
              size="xs"
              :placeholder="t('common.value')"
              class="flex-1 min-w-0"
              @update:model-value="v => updateRow(i, { value: v ?? '' })"
            />
          </template>
          <!-- No-value operators (isNull etc.) — fill space to align remove button -->
          <div v-else class="flex-1 min-w-0" />

          <!-- Remove row button -->
          <UButton
            size="xs"
            variant="ghost"
            color="neutral"
            icon="i-lucide-x"
            class="shrink-0"
            :aria-label="t('common.delete')"
            @click="removeCondition(i)"
          />
        </div>

        <!-- Add button + clear button -->
        <div class="flex items-center justify-between pt-1">
          <UButton
            size="xs"
            variant="ghost"
            icon="i-lucide-plus"
            :label="t('dashboard.crud.addFilterCondition')"
            :disabled="filterableFields.length === 0"
            @click="addCondition"
          />
          <UButton
            size="xs"
            variant="ghost"
            color="neutral"
            icon="i-lucide-x"
            :label="t('common.clearFilters')"
            :disabled="totalActiveCount === 0"
            @click="clearAll"
          />
        </div>
      </div>
    </div>
  </div>
</template>

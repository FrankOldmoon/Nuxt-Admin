<script setup lang="ts">
/**
 * Main metadata-driven CRUD page.
 *
 * Composes atomic dashboard-level building blocks:
 *   - DashboardCrudHeader + DashboardCrudFilters for the search/title bar
 *   - DashboardCrudTable for list view (which in turn wraps CrudTableBase
 *     + DashboardCrudRowActions + DashboardCellRenderer)
 *   - DashboardCrudFormModal (form) + DashboardCrudDetailModal (detail)
 *
 * Per-field slots are forwarded to inner components with a matching name
 * (e.g. `#table-id`, `#form-name`, `#detail-description`, `#toolbar`, etc.).
 */
import type { AdvancedFilterCondition, TableMetaWithOptions } from '~/types/dashboard'

type FormRef = Ref<any>

const props = withDefaults(defineProps<{
  meta: TableMetaWithOptions
  /** Optional transformer: convert custom form state to API payload before POST/PUT */
  transformPayload?: (formValue: any, mode: 'create' | 'update', editing: Record<string, unknown> | null) => Record<string, unknown>
  /** Override the base URL prefix for data APIs; defaults to the main project's generic path.
   *  The component appends `/${meta.table}` (and /${id}, /batch, etc.) to this base.
   *  Example: '/api/dashboard/data' (module-specific generic CRUD namespace) */
  apiBase?: string
  /** Show a "Export JSON" button in the toolbar (uses /export?format=json with current filters) */
  jsonExport?: boolean
}>(), {
  transformPayload: undefined,
  apiBase: '/api/dashboard/data',
  jsonExport: false
})

const emit = defineEmits<{
  /** Fired right before the create modal opens; parent can mutate `form.value` for custom form state */
  'before-create': [form: FormRef]
  /** Fired right before the edit modal opens; parent can mutate `form.value` for custom form state */
  'before-edit': [item: Record<string, unknown>, form: FormRef]
}>()

const { t } = useI18n()
const toast = useToast()
const { fieldLabel, tableLabel } = useDashboardLabels()
const { can } = usePermission()

const filters = ref<Record<string, string>>({})
const conditions = ref<AdvancedFilterCondition[]>([])
const sort = ref<{ field: string; order: 'asc' | 'desc' } | null>(null)

// ---- Column visibility (persisted to localStorage per table) ----
const storageKey = computed(() => `crud-columns-${props.meta.table}`)
const allTableFields = computed(() => props.meta.fields.filter(f => f.showInTable))

const hiddenKeys = ref<Set<string>>(new Set())
function loadHiddenKeys() {
  if (import.meta.server) return
  try {
    const raw = localStorage.getItem(storageKey.value)
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) hiddenKeys.value = new Set(arr.filter((x: unknown) => typeof x === 'string'))
    }
  } catch { /* ignore */ }
}
function saveHiddenKeys() {
  if (import.meta.server) return
  try {
    localStorage.setItem(storageKey.value, JSON.stringify([...hiddenKeys.value]))
  } catch { /* ignore */ }
}
function toggleColumn(key: string) {
  const next = new Set(hiddenKeys.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  hiddenKeys.value = next
  saveHiddenKeys()
}
function showAllColumns() {
  hiddenKeys.value = new Set()
  saveHiddenKeys()
}

onMounted(loadHiddenKeys)

const visibleFields = computed(() => allTableFields.value.filter(f => !hiddenKeys.value.has(f.key)))
const columnToggleItems = computed(() =>
  allTableFields.value.map(f => ({
    key: f.key,
    label: fieldLabel(props.meta.table, f),
    visible: !hiddenKeys.value.has(f.key)
  }))
)

const baseUrl = computed(() => `${props.apiBase.replace(/\/$/, '')}/${props.meta.table}`)
const {
  data, pending, page, pageSize, pagination, trashed, sort: sortState, setTrashed, setPage, setPageSize, setSort, refresh
} = usePagedResource<{ items: Record<string, unknown>[], pagination: any }>(
  `dashboard:list:${props.meta.table}`,
  baseUrl.value,
  filters,
  conditions,
  sort
)
const items = computed(() => (data.value as any)?.items ?? [])

/** Quietly reload the current table data and toast a success hint. */
function doRefresh() {
  refresh(true)
  toast.add({ title: t('common.refreshed'), color: 'primary' })
}

// --- Excel import / export UI ---
const importOpen = ref(false)
const { exporting, exportTableExcel } = useExcelExport()

async function runExport() {
  await exportTableExcel(props.meta, baseUrl.value, filters.value, trashed.value)
}

// --- Seed UI ---
const seedOpen = ref(false)
const seedCount = ref(10)
const seeding = ref(false)

async function runSeed() {
  try {
    seeding.value = true
    const res = await cPost<{ ok: boolean, inserted: number }>(`${baseUrl.value}/seed`, { count: seedCount.value })
    toast.add({ title: t('dashboard.crud.seedDone', { count: res.inserted }), color: 'success' })
    seedOpen.value = false
    await refresh(true)
  } catch (e) {
    toast.add({ title: extractErrorMessage(e, t('dashboard.crud.seedFailed')), color: 'error' })
  } finally {
    seeding.value = false
  }
}

/** Export all data under the current filters as a JSON file (button only appears when jsonExport is enabled) */
async function exportJson() {
  try {
    exporting.value = true
    const params = new URLSearchParams()
    if (trashed.value) params.set('trashed', 'true')
    for (const [k, v] of Object.entries(filters.value || {})) {
      if (v !== '' && v != null) params.set(k, String(v))
    }
    if (conditions.value && conditions.value.length > 0) {
      params.set('conditions', JSON.stringify(conditions.value))
    }
    if (sort.value) {
      params.set('sort', sort.value.field)
      params.set('order', sort.value.order)
    }
    params.set('format', 'json')
    const url = `${baseUrl.value}/export?${params.toString()}`
    const blob = await cRequest<Blob>(url, { method: 'GET', responseType: 'blob' })
    const objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = `${props.meta.table}-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(objectUrl)
    toast.add({ title: t('dashboard.crud.jsonExported'), color: 'success' })
  } catch (e) {
    toast.add({ title: extractErrorMessage(e, t('dashboard.crud.jsonExportFailed')), color: 'error' })
  } finally {
    exporting.value = false
  }
}

// --- Form / Modal state ---
const modalOpen = ref(false)
const modalMode = ref<'create' | 'update'>('create')
const editing = ref<Record<string, unknown> | null>(null)
/** Typed as `any` to support custom form state shapes (e.g. QuestionFormState). */
const form = ref<any>({})
const saving = ref(false)
const errorMsg = ref('')
const fieldErrors = ref<Record<string, string>>({})

function initCreateForm() {
  const payload: Record<string, unknown> = {}
  for (const f of props.meta.fields) {
    if (!f.showInForm) continue
    if (f.type === 'boolean') payload[f.key] = (f.validation?.required ?? true) ? true : false
    else if (f.nullable) payload[f.key] = null
    else if (f.type === 'number') payload[f.key] = 0
    else payload[f.key] = ''
  }
  form.value = payload
}

function openCreate() {
  modalMode.value = 'create'
  editing.value = null
  initCreateForm()
  errorMsg.value = ''
  fieldErrors.value = {}
  // Allow parent to override form state for fully custom forms
  emit('before-create', form)
  modalOpen.value = true
}

async function openEdit(row: Record<string, unknown>) {
  modalMode.value = 'update'
  editing.value = row
  errorMsg.value = ''
  fieldErrors.value = {}
  // Fetch the full record (includes many-to-many ids that the list API
  // does not return) so the form can pre-select relation/m2m values.
  let fullRow: Record<string, unknown> = { ...row }
  try {
    const id = row.id as number | string
    const res = await cGet<{ item: Record<string, unknown> }>(`${baseUrl.value}/${id}`)
    if (res?.item) fullRow = res.item
  } catch { /* fall back to the list snapshot */ }
  // Clear password fields — never pre-fill hashed passwords
  for (const f of props.meta.fields) {
    if (f.type === 'password') fullRow[f.key] = ''
  }
  form.value = fullRow
  // Allow parent to override form state for fully custom forms (e.g. DB row → QuestionFormState)
  emit('before-edit', row, form)
  modalOpen.value = true
}

async function save() {
  try {
    saving.value = true
    errorMsg.value = ''
    fieldErrors.value = {}
    // Apply payload transformer (if any) to convert custom form state → API format
    let payload: Record<string, unknown>
    if (props.transformPayload) {
      payload = props.transformPayload(form.value, modalMode.value, editing.value)
    } else {
      payload = { ...form.value }
      // Password drop only applies in default (no transformer) mode
      if (editing.value) {
        for (const f of props.meta.fields) {
          if (f.type === 'password' && !payload[f.key]) delete payload[f.key]
        }
      }
    }
    // Apply each field's custom setter (if registered) so the form value is
    // re-shaped to its storage/API format before validation + persist.
    for (const f of props.meta.fields) {
      if (!f.setter) continue
      if (!(f.key in payload)) continue
      payload[f.key] = applyFieldSetter(f.setter, payload[f.key])
    }
    // Client-side validation against meta.validation (mirrors the backend).
    const errs = validateForm(props.meta, payload, modalMode.value)
    if (Object.keys(errs).length > 0) {
      fieldErrors.value = errs
      errorMsg.value = Object.values(errs).join('; ')
      return
    }
    if (modalMode.value === 'create') {
      await cPost(`${baseUrl.value}`, payload)
      toast.add({ title: t('dashboard.crud.createSuccess'), color: 'success' })
    } else if (editing.value) {
      const id = editing.value.id as number | string
      await cPut(`${baseUrl.value}/${id}`, payload)
      toast.add({ title: t('dashboard.crud.updateSuccess'), color: 'success' })
    }
    modalOpen.value = false
    await refresh()
  } catch (e) {
    errorMsg.value = extractErrorMessage(e, t('dashboard.crud.saveFailed'))
  } finally {
    saving.value = false
  }
}

function cancel() {
  modalOpen.value = false
}

// --- Detail modal ---
const detailOpen = ref(false)
const detailItem = ref<Record<string, unknown> | null>(null)
const detailLoading = ref(false)

async function openDetail(row: Record<string, unknown>) {
  detailItem.value = row
  detailOpen.value = true
  const id = row.id as number | string
  detailLoading.value = true
  try {
    const res = await cGet<{ item: Record<string, unknown> }>(`${baseUrl.value}/${id}`)
    detailItem.value = res.item
  } catch { /* fall back to the list snapshot */ } finally {
    detailLoading.value = false
  }
}

// --- Row actions (single row = batch with 1 id) ---
async function softDeleteRow(row: Record<string, unknown>) {
  const id = row.id as number | string
  try {
    await cPost(`${baseUrl.value}/batch`, { action: 'soft-delete', ids: [id] })
    toast.add({ title: t('dashboard.crud.deleted'), color: 'primary' })
    await refresh()
  } catch (e) {
    toast.add({ title: extractErrorMessage(e, t('dashboard.crud.deleteFailed')), color: 'error' })
  }
}
async function restoreRow(row: Record<string, unknown>) {
  const id = row.id as number | string
  try {
    await cPost(`${baseUrl.value}/batch`, { action: 'restore', ids: [id] })
    toast.add({ title: t('dashboard.crud.restored'), color: 'success' })
    await refresh()
  } catch (e) {
    toast.add({ title: extractErrorMessage(e, t('dashboard.crud.restoreFailed')), color: 'error' })
  }
}
async function permanentDeleteRow(row: Record<string, unknown>) {
  const id = row.id as number | string
  try {
    await cPost(`${baseUrl.value}/batch`, { action: 'permanent-delete', ids: [id] })
    toast.add({ title: t('dashboard.crud.permanentDeleted'), color: 'error' })
    await refresh()
  } catch (e) {
    toast.add({ title: extractErrorMessage(e, t('dashboard.crud.permanentDeleteFailed')), color: 'error' })
  }
}
async function onBatchAction(action: 'soft-delete' | 'restore' | 'permanent-delete', ids: Array<string | number>) {
  if (!ids.length) return
  try {
    await cPost(`${baseUrl.value}/batch`, { action, ids })
    toast.add({ title: t('dashboard.crud.batchDone', { count: ids.length }), color: 'primary' })
    await refresh()
  } catch (e) {
    toast.add({ title: extractErrorMessage(e, t('dashboard.crud.batchFailed')), color: 'error' })
  }
}

const slots = useSlots()

defineExpose({ refresh })
</script>

<template>
  <UContainer class="py-10">
    <DashboardCrudHeader
      :title="tableLabel(meta.table, meta.label)"
      :create-label="t('dashboard.crud.createLabel', { name: tableLabel(meta.table, meta.label).slice(0, -1) })"
      :trashed="trashed"
      @create="openCreate"
      @update:trashed="setTrashed"
    >
      <template #header-actions>
        <slot name="toolbar" :refresh="doRefresh" :trashed="trashed" :open-create="openCreate">
          <div class="flex items-center gap-2">
            <UButton
              v-if="props.jsonExport && can(meta.table, 'read')"
              icon="i-lucide-file-json"
              variant="ghost"
              color="warning"
              :label="t('dashboard.crud.jsonExport')"
              :loading="exporting"
              @click="exportJson"
            />
            <UButton
              v-if="can(meta.table, 'read')"
              icon="i-lucide-download"
              variant="ghost"
              color="warning"
              :label="t('dashboard.excel.export')"
              :loading="exporting"
              @click="runExport"
            />
            <UButton
              v-if="!trashed && can(meta.table, 'create')"
              icon="i-lucide-wand-2"
              variant="ghost"
              color="success"
              :label="t('dashboard.crud.seed')"
              @click="seedOpen = true"
            />
            <UButton
              v-if="can(meta.table, 'create')"
              icon="i-lucide-upload"
              variant="ghost"
              color="primary"
              :label="t('dashboard.excel.import')"
              @click="importOpen = true"
            />
            <UButton
              v-if="!trashed && can(meta.table, 'create')"
              icon="i-lucide-plus"
              color="primary"
              :label="t('dashboard.crud.createLabel', { name: meta.label.slice(0, -1) })"
              @click="openCreate"
            />
          </div>
        </slot>
      </template>
    </DashboardCrudHeader>

    <DashboardCrudFilters
      v-model:filters="filters"
      v-model:conditions="conditions"
      :meta="meta"
    >
      <template #default="{ set, filters: currentFilters }">
        <slot name="filters" :set="set" :filters="currentFilters" />
      </template>

      <!-- Columns toggle (right of search bar) -->
      <template #right>
        <UButton
          size="sm"
          variant="ghost"
          color="neutral"
          icon="i-lucide-refresh-cw"
          :aria-label="t('common.refresh')"
          :title="t('common.refresh')"
          @click="doRefresh"
        />
        <details class="group relative">
          <summary class="inline-flex cursor-pointer list-none items-center gap-1 rounded px-2 py-1.5 text-sm text-muted transition hover:bg-elevated">
            <UIcon name="i-lucide-columns-3" />
            <span>{{ t('dashboard.crud.columns') }}</span>
            <UIcon name="i-lucide-chevron-down" class="transition group-open:rotate-180" />
          </summary>
          <div class="absolute right-0 z-50 mt-1 min-w-56 rounded border border-default bg-default shadow-lg">
            <div class="flex items-center justify-between border-b border-default px-3 py-2">
              <span class="text-xs font-medium text-muted">{{ t('dashboard.crud.columnVisibility') }}</span>
              <UButton size="xs" variant="ghost" :label="t('dashboard.crud.showAllColumns')" @click="showAllColumns" />
            </div>
            <div class="max-h-64 overflow-y-auto p-2">
              <label
                v-for="col in columnToggleItems"
                :key="col.key"
                class="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-elevated"
              >
                <UCheckbox
                  :model-value="col.visible"
                  @update:model-value="toggleColumn(col.key)"
                />
                <span>{{ col.label }}</span>
              </label>
            </div>
          </div>
        </details>
      </template>
    </DashboardCrudFilters>

    <DashboardCrudTable
      :meta="meta"
      :items="items"
      :visible-fields="visibleFields"
      :pending="pending"
      :trashed="trashed"
      :pagination="pagination"
      :page="page"
      :page-size="pageSize"
      :sort="sortState"
      @detail="openDetail"
      @edit="openEdit"
      @delete="softDeleteRow"
      @restore="restoreRow"
      @permanent-delete="permanentDeleteRow"
      @batch-action="onBatchAction"
      @update:page="setPage"
      @update:page-size="setPageSize"
      @sort="setSort"
    >
      <template
        v-for="f in meta.fields.filter(f => f.showInTable && slots[`table-${f.key}`])"
        :key="`slot-table-${f.key}`"
        #[`table-${f.key}`]="scoped"
      >
        <slot :name="`table-${f.key}`" v-bind="scoped" />
      </template>
      <template #table-actions-prepend="scoped">
        <slot name="table-actions-prepend" v-bind="scoped" />
      </template>
    </DashboardCrudTable>

    <DashboardCrudFormModal
      :modal-open="modalOpen"
      :modal-title="modalMode === 'create' ? t('dashboard.crud.createLabel', { name: meta.label.slice(0, -1) }) : t('dashboard.crud.editLabel', { name: meta.label.slice(0, -1) })"
      :saving="saving"
      :error-msg="errorMsg"
      @update:modal-open="(v) => { modalOpen = v; if (!v) { editing = null } }"
      @save="save"
      @cancel="cancel"
    >
      <template #form>
        <!-- Full form override slot: when provided, completely replaces DashboardCrudForm -->
        <slot
          v-if="slots['form-content']"
          name="form-content"
          :form="form"
          :mode="modalMode"
          :errors="fieldErrors"
          :editing="editing"
        />
        <DashboardCrudForm
          v-else
          :meta="meta"
          v-model="form"
          :mode="modalMode"
          :errors="fieldErrors"
        >
          <template
            v-for="f in meta.fields.filter(f => f.showInForm && slots[`form-${f.key}`])"
            :key="`slot-form-${f.key}`"
            #[`form-${f.key}`]="scoped"
          >
            <slot :name="`form-${f.key}`" v-bind="scoped" />
          </template>
          <template #form-before="scoped"><slot name="form-before" v-bind="scoped" /></template>
          <template #form-after="scoped"><slot name="form-after" v-bind="scoped" /></template>
        </DashboardCrudForm>
      </template>
    </DashboardCrudFormModal>

    <DashboardCrudDetailModal
      :detail-open="detailOpen"
      :detail-title="t('dashboard.crud.detailLabel', { name: meta.label.slice(0, -1) })"
      @update:detail-open="(v) => { detailOpen = v; if (!v) { detailItem = null } }"
    >
      <template #detail>
        <!-- Full detail override slot: when provided, completely replaces DashboardCrudDetail -->
        <slot
          v-if="slots['detail-content']"
          name="detail-content"
          :item="detailItem"
          :loading="detailLoading"
        />
        <DashboardCrudDetail v-else :meta="meta" :item="detailItem" :loading="detailLoading">
          <template
            v-for="f in meta.fields.filter(f => f.showInDetail && slots[`detail-${f.key}`])"
            :key="`slot-detail-${f.key}`"
            #[`detail-${f.key}`]="scoped"
          >
            <slot :name="`detail-${f.key}`" v-bind="scoped" />
          </template>
          <template #detail-before="scoped"><slot name="detail-before" v-bind="scoped" /></template>
          <template #detail-after="scoped"><slot name="detail-after" v-bind="scoped" /></template>
        </DashboardCrudDetail>
      </template>
    </DashboardCrudDetailModal>

    <DashboardCrudExcelImportModal
      v-model:open="importOpen"
      :meta="meta"
      :api-base="apiBase"
      @imported="refresh"
    />

    <!-- Seed modal: insert N generated rows -->
    <UModal
      :open="seedOpen"
      :title="t('dashboard.crud.seedTitle', { name: meta.label.slice(0, -1) })"
      @update:open="seedOpen = $event"
    >
      <template #body>
        <div class="space-y-4">
          <p class="text-sm text-muted">{{ t('dashboard.crud.seedDescription') }}</p>
          <div class="flex items-center gap-3">
            <span class="shrink-0 text-sm">{{ t('dashboard.crud.seedCount') }}</span>
            <UInput
              v-model.number="seedCount"
              type="number"
              min="1"
              max="100"
              class="w-32"
            />
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" :label="t('common.cancel')" @click="seedOpen = false" />
          <UButton color="success" :label="t('dashboard.crud.seed')" :loading="seeding" @click="runSeed" />
        </div>
      </template>
    </UModal>
  </UContainer>
</template>

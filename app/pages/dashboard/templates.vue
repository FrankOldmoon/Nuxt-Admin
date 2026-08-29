<script setup lang="ts">
/**
 * Templates — the "personalization ladder" showcase page.
 *
 * This page is the living example of every way a table can be customised on
 * top of the metadata-driven generic CRUD:
 *
 *   L0  pure generic CRUD (all switches off)
 *   L1  custom list API override  → adds a VIRTUAL column (inventoryStatus)
 *       via server/api/dashboard/data/templates/index.get.ts
 *   L2  per-cell / per-detail / per-form slot overrides
 *   L3  custom toolbar + custom quick-filter
 *   L4  fully custom page (total layout control, no generic CRUD)
 *
 * Each switch is persisted server-side (`demo_templates_switches` config) and
 * toggled from the panel at the top, so you can flip one on at a time and see
 * exactly which layer is responsible for which change.
 */
import type { TableMetaWithOptions } from '~/types/dashboard'

definePageMeta({ middleware: 'admin', layout: 'dashboard', keepalive: true })

useSeoMeta({ title: 'Templates · Dashboard' })

type SwitchKey =
  | 'customListApi'
  | 'cellOverrides'
  | 'detailOverrides'
  | 'formOverrides'
  | 'customToolbar'
  | 'fullCustomPage'

interface DemoSwitches {
  customListApi: boolean
  cellOverrides: boolean
  detailOverrides: boolean
  formOverrides: boolean
  customToolbar: boolean
  fullCustomPage: boolean
}

const defaultSwitches: DemoSwitches = {
  customListApi: false,
  cellOverrides: false,
  detailOverrides: false,
  formOverrides: false,
  customToolbar: false,
  fullCustomPage: false
}

// --- Switch meta used by the switch panel ---
interface SwitchDef {
  key: SwitchKey
  tier: 'L1' | 'L2' | 'L3' | 'L4'
  title: string
  desc: string
}
const SWITCH_DEFS: SwitchDef[] = [
  { key: 'customListApi', tier: 'L1', title: 'Custom list API', desc: 'Shows a virtual column (stock status) computed by an API override.' },
  { key: 'cellOverrides', tier: 'L2', title: 'Custom table cells', desc: 'Slot-overrides price / status / tags / date / inventory columns.' },
  { key: 'detailOverrides', tier: 'L2', title: 'Custom detail head', desc: 'Adds a hero banner + Markdown notes renderer to the detail modal.' },
  { key: 'formOverrides', tier: 'L2', title: 'Custom form fields', desc: 'Currency-prefixed price input + status renderer inside the create/edit form.' },
  { key: 'customToolbar', tier: 'L3', title: 'Custom toolbar', desc: 'Replaces the toolbar with custom buttons (bulk approve + create).' },
  { key: 'fullCustomPage', tier: 'L4', title: 'Full custom page', desc: 'Completely replaces the generic CRUD page with a hand-written layout.' }
]

const toast = useToast()

function navigate(table: string) {
  if (table === 'templates') return
  navigateTo(`/dashboard/${table}`)
}

// --- Fetch table meta (relation options etc.) ---
const { data: meta } = await useAsyncData(
  'templates:meta',
  () => cGet<TableMetaWithOptions>('/api/dashboard/meta/templates')
)

// L1 virtual column: `inventoryStatus` only exists when the Custom list API
// switch is ON, so hide it from the table otherwise.
const tableMeta = computed<TableMetaWithOptions | null>(() => {
  if (!meta.value) return null
  return {
    ...meta.value,
    fields: meta.value.fields.map(f =>
      f.key === 'inventoryStatus' ? { ...f, showInTable: switches.value.customListApi } : f
    )
  }
})

// --- Fetch the persisted personalization switches ---
const { data: swData } = await useAsyncData(
  'templates:switches',
  () => cGet<{ switches: DemoSwitches }>('/api/dashboard/templates/demo-switches')
)
const switches = computed<DemoSwitches>(() => swData.value?.switches ?? defaultSwitches)

// --- Generic CRUD page ref (needed to reload rows when L1 toggles) ---
const crudRef = ref()

async function toggleSwitch(key: SwitchKey) {
  const next = { ...switches.value, [key]: !switches.value[key] }
  try {
    const res = await cPut<{ switches: DemoSwitches }>('/api/dashboard/templates/demo-switches', { switches: { [key]: next[key] } })
    swData.value = { switches: res.switches }
    toast.add({ title: `Switch "${key}" → ${res.switches[key] ? 'ON' : 'OFF'}`, color: 'primary' })
    // Reload the CRUD list so L1's enriched columns reflect immediately.
    await nextTick()
    crudRef.value?.refresh()
  } catch (e) {
    toast.add({ title: extractErrorMessage(e, 'Failed to update switch'), color: 'error' })
  }
}

async function resetSwitches() {
  try {
    const res = await cPut<{ switches: DemoSwitches }>('/api/dashboard/templates/demo-switches', {
      switches: Object.fromEntries(SWITCH_DEFS.map(d => [d.key, false]))
    })
    swData.value = { switches: res.switches }
    toast.add({ title: 'All switches reset to OFF', color: 'neutral' })
    await nextTick()
    crudRef.value?.refresh()
  } catch (e) {
    toast.add({ title: extractErrorMessage(e, 'Failed to reset switches'), color: 'error' })
  }
}

// ---------- L1 / L2 helpers (display formatting) ----------
function formatPrice(v: unknown): string {
  const n = typeof v === 'number' ? v : Number(v)
  if (Number.isNaN(n)) return '-'
  return `$${n.toFixed(2)}`
}
function statusColor(v: unknown) {
  if (v === 'active') return 'success'
  if (v === 'archived') return 'warning'
  return 'neutral'
}
function statusLabel(v: unknown): string {
  if (v === 'active') return 'Active'
  if (v === 'draft') return 'Draft'
  if (v === 'archived') return 'Archived'
  return v ? String(v) : '-'
}
function inventoryColor(v: unknown) {
  if (v === 'in_stock') return 'success'
  if (v === 'low_stock') return 'warning'
  if (v === 'out_of_stock') return 'error'
  return 'neutral'
}
const inventoryLabels: Record<string, string> = {
  in_stock: 'In Stock',
  low_stock: 'Low Stock',
  out_of_stock: 'Out of Stock'
}
function inventoryLabel(v: unknown): string {
  if (v != null) {
    const label = inventoryLabels[String(v)]
    if (label) return label
  }
  return '-'
}
const statusSelectOptions = [
  { label: 'Active', value: 'active' },
  { label: 'Draft', value: 'draft' },
  { label: 'Archived', value: 'archived' }
]

// ---------- L3 toolbar demo ----------
function bulkApprove() {
  // For a demo we just toast; swap the body for a real batch update call.
  toast.add({ title: 'Bulk approve clicked (L3 toolbar)', description: 'Attach your real batch logic here.', color: 'primary' })
}

// ---------- L4 fully custom page data ----------
const { data: customData, pending: customPending, refresh: refreshCustom } = await useAsyncData(
  'templates:custom',
  () => cGet<{ items: Record<string, unknown>[] }>('/api/dashboard/data/templates', { pageSize: 200 })
)
const customItems = computed(() => customData.value?.items ?? [])
const customStats = computed(() => {
  const items = customItems.value
  const total = items.length
  const out = items.filter(i => Number(i.stock ?? 0) <= 0).length
  const low = items.filter(i => {
    const s = Number(i.stock ?? 0)
    return s > 0 && s < 10
  }).length
  const prices = items.map(i => Number(i.price ?? 0)).filter(n => !Number.isNaN(n))
  const avg = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0
  return { total, out, low, avg }
})
function refreshL4() {
  refreshCustom()
}
</script>

<template>
  <DashboardShell active-table="templates" @navigate="navigate">
    <template #default>
      <!-- ================= L4: fully custom page ================= -->
      <UContainer v-if="switches.fullCustomPage" class="py-6">
        <div class="space-y-4">
          <UAlert
            icon="i-lucide-construction"
            color="warning"
            title="L4 — fully custom page"
            description="Below is a completely hand-written layout that ignores DashboardCrudPage. It reuses the same /templates list API, so if L1 is also ON the enriched columns appear here too."
          />
          <div class="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <UCard>
              <p class="text-sm text-muted">Total templates</p>
              <p class="mt-1 text-2xl font-semibold text-highlighted">{{ customStats.total }}</p>
            </UCard>
            <UCard>
              <p class="text-sm text-muted">In stock</p>
              <p class="mt-1 text-2xl font-semibold text-success">{{ customStats.total - customStats.out - customStats.low }}</p>
            </UCard>
            <UCard>
              <p class="text-sm text-muted">Low stock</p>
              <p class="mt-1 text-2xl font-semibold text-warning">{{ customStats.low }}</p>
            </UCard>
            <UCard>
              <p class="text-sm text-muted">Average price</p>
              <p class="mt-1 text-2xl font-semibold text-highlighted">{{ formatPrice(customStats.avg) }}</p>
            </UCard>
          </div>

          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <span class="font-medium">Custom template list</span>
                <UButton size="xs" variant="ghost" icon="i-lucide-refresh-cw" label="Refresh" :loading="customPending" @click="refreshL4" />
              </div>
            </template>
            <ul class="divide-y divide-default">
              <li v-for="p in customItems" :key="String(p.id)" class="flex items-center gap-4 py-2">
                <span class="w-10 shrink-0 text-sm text-muted">#{{ p.id }}</span>
                <div class="min-w-0 flex-1">
                  <p class="truncate font-medium text-highlighted">{{ p.name }}</p>
                  <p class="text-xs text-muted">{{ p.sku }}</p>
                </div>
                <span class="w-24 text-right font-semibold text-primary">{{ formatPrice(p.price) }}</span>
                <UBadge :label="statusLabel(p.status)" :color="statusColor(p.status)" variant="subtle" size="sm" />
                <span v-if="switches.customListApi" class="w-24 text-right">
                  <UBadge :label="inventoryLabel(p.inventoryStatus)" :color="inventoryColor(p.inventoryStatus)" variant="subtle" size="sm" />
                </span>
              </li>
              <li v-if="!customItems.length && !customPending" class="py-6 text-center text-sm text-muted">No templates yet — create one.</li>
            </ul>
          </UCard>
        </div>
      </UContainer>

      <!-- ================= L0/L1/L2/L3: generic CRUD page with conditional slots ================= -->
      <DashboardCrudPage v-else-if="tableMeta" ref="crudRef" :meta="tableMeta">
        <!-- ---- L3: custom toolbar ---- -->
        <template #toolbar="{ openCreate, refresh: toolbarRefresh }">
          <div v-if="switches.customToolbar" class="flex items-center gap-2">
            <UButton icon="i-lucide-check-check" color="success" variant="soft" label="Bulk approve (L3)" @click="bulkApprove" />
            <UButton icon="i-lucide-plus" color="primary" label="Create (L3)" @click="openCreate" />
            <UButton icon="i-lucide-refresh-cw" variant="ghost" color="neutral" label="Reload" @click="toolbarRefresh" />
          </div>
          <!-- default toolbar is rendered by the generic page when the slot is absent;
               when customToolbar is ON we fully replace it with the custom one above. -->
        </template>

        <!-- ---- L2: custom table cells ---- -->
        <template v-if="switches.cellOverrides" #table-price="{ value }">
          <span class="font-semibold text-primary">{{ formatPrice(value) }}</span>
        </template>
        <template v-if="switches.cellOverrides" #table-status="{ value }">
          <UBadge :label="statusLabel(value)" :color="statusColor(value)" variant="subtle" size="sm" />
        </template>
        <template v-if="switches.cellOverrides" #table-tags="{ value }">
          <div class="flex flex-wrap gap-1">
            <UBadge v-for="tg in (value ?? [])" :key="String(tg)" :label="String(tg)" color="neutral" variant="subtle" size="sm" />
          </div>
        </template>
        <template v-if="switches.cellOverrides" #table-releasedAt="{ value }">
          <span>{{ value ? new Date(String(value)).toLocaleDateString() : '-' }}</span>
        </template>
        <template v-if="switches.cellOverrides" #table-inventoryStatus="{ value }">
          <UBadge :label="inventoryLabel(value)" :color="inventoryColor(value)" variant="subtle" size="sm" />
        </template>

        <!-- ---- L2: custom detail head ---- -->
        <template v-if="switches.detailOverrides" #detail-before="{ item }">
          <div v-if="item" class="mb-4 rounded-lg border border-default bg-muted/30 p-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p class="text-xs text-muted">Inventory (L1)</p>
                <UBadge v-if="switches.customListApi" :label="inventoryLabel(item.inventoryStatus)" :color="inventoryColor(item.inventoryStatus)" variant="subtle" size="sm" />
                <span v-else class="text-sm text-muted">Enable L1 to see</span>
              </div>
              <div class="text-right">
                <p class="text-xs text-muted">Price</p>
                <p class="text-lg font-semibold text-primary">{{ formatPrice(item.price) }}</p>
              </div>
            </div>
          </div>
        </template>
        <template v-if="switches.detailOverrides" #detail-tags="{ value }">
          <div class="flex flex-wrap gap-1">
            <UBadge v-for="tg in (value ?? [])" :key="String(tg)" :label="String(tg)" color="neutral" variant="subtle" size="sm" />
          </div>
        </template>
        <!-- Always render the `markdown` field as formatted Markdown in the detail view. -->
        <template #detail-markdown="{ value }">
          <div class="max-h-72 overflow-y-auto rounded border border-default p-3">
            <BaseCherryViewer v-if="value" :source="String(value)" />
            <span v-else class="text-muted">-</span>
          </div>
        </template>

        <!-- ---- L2: custom form fields ---- -->
        <template v-if="switches.formOverrides" #form-price="{ modelValue, update }">
          <div class="flex w-full items-center gap-2">
            <UIcon name="i-lucide-dollar-sign" class="text-muted shrink-0" />
            <UInput
              :model-value="modelValue ?? ''"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              class="min-w-0 flex-1"
              @update:model-value="(v) => update(v === '' || v == null ? null : Number(v))"
            />
          </div>
        </template>
        <template v-if="switches.formOverrides" #form-status="{ modelValue, update }">
          <USelectMenu
            :model-value="modelValue ?? ''"
            value-key="value"
            :items="statusSelectOptions"
            placeholder="Select status"
            class="min-w-0 flex-1"
            @update:model-value="(v) => update(v === undefined ? null : v)"
          />
        </template>
      </DashboardCrudPage>

      <!-- ================= Switch panel (shown under the table) ================= -->
      <UContainer class="pt-6">
        <UCard>
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 class="font-semibold text-highlighted">Templates — customization switcher</h3>
                <p class="text-sm text-muted">Turn each personalization layer on to compare it against plain generic CRUD (L0).</p>
              </div>
              <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-rotate-ccw" label="Reset all" @click="resetSwitches" />
            </div>
          </template>

          <div class="grid grid-cols-1 gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            <div
              v-for="d in SWITCH_DEFS"
              :key="d.key"
              class="flex items-start gap-3 rounded-lg border border-default p-3"
            >
              <USwitch
                :model-value="switches[d.key]"
                @update:model-value="toggleSwitch(d.key)"
              />
              <div class="min-w-0">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="text-sm font-medium text-highlighted">{{ d.title }}</span>
                  <UBadge :label="d.tier" variant="subtle" size="sm" color="info" />
                  <UBadge v-if="switches[d.key]" label="ON" variant="solid" size="sm" color="success" />
                </div>
                <p class="mt-0.5 text-xs text-muted">{{ d.desc }}</p>
              </div>
            </div>
          </div>
        </UCard>
      </UContainer>
    </template>
  </DashboardShell>
</template>
<script setup lang="ts">
/**
 * Dashboard menu editor panel — lets admins add/remove/reorder/label the
 * sidebar items directly from the UI.
 *
 * Now embedded as a tab inside the configs page instead of a modal.
 * Self-contained: loads its own menu/tables data via /api/dashboard/meta
 * and refreshes the shared `dashboard:meta` cache on save.
 */
import type { DashboardMenuItem } from '~/types/dashboard'

const { t } = useI18n()
const toast = useToast()

// Load menu + available tables (shares cache via useDashboardMeta composable)
const { data: metaData, refresh: refreshMeta } = await useDashboardMeta()

const menu = computed<DashboardMenuItem[]>(() => metaData.value?.menu ?? [])
const availableTables = computed(() => metaData.value?.tables ?? [])

// Wrap menu rows with a local numeric id so v-for keys remain stable
// as the user reorders / deletes / adds rows.
interface Editable extends Omit<DashboardMenuItem, 'order'> {
  order: number
  __id: number
}
let __nextId = 1
function mkRow(src: DashboardMenuItem | Partial<DashboardMenuItem> = {}): Editable {
  return {
    table: src.table ?? '',
    label: src.label ?? '',
    icon: src.icon ?? 'i-lucide-circle-dashed',
    order: typeof src.order === 'number' ? src.order : (__nextId * 10),
    hidden: !!src.hidden,
    __id: __nextId++
  }
}

// USelectMenu items for the "bind table" column.
// Using value-key="value" so v-model binds the raw table name string.
const tableItems = computed(() =>
  availableTables.value.map(tbl => ({
    label: `${tbl.label}（${tbl.table}${tbl.custom ? t('dashboard.menu.customSuffix') : ''}）`,
    value: tbl.table,
  })),
)

const rows = ref<Editable[]>([])
const saving = ref(false)
const errorMsg = ref('')

function normalize(items: DashboardMenuItem[]): Editable[] {
  const sorted = [...items].sort(
    (a, b) => (a.order ?? 0) - (b.order ?? 0)
  )
  // Re-stamp order sequentially so we don't have gaps in the UI.
  return sorted.map((it, i) => {
    const r = mkRow(it)
    r.order = (i + 1) * 10
    return r
  })
}

// Initialize rows from loaded menu data
watch(
  menu,
  (items) => {
    rows.value = normalize(items)
    saving.value = false
    errorMsg.value = ''
  },
  { immediate: true }
)

function addRow() {
  const r = mkRow({ order: (rows.value.length + 1) * 10 })
  const tbl = availableTables.value[0]
  if (tbl) {
    r.table = tbl.table
    r.label = tbl.label
    r.icon = tbl.icon
  }
  rows.value.push(r)
}

function removeRow(id: number) {
  rows.value = rows.value.filter(r => r.__id !== id)
}

function move(row: Editable, dir: -1 | 1) {
  const arr = [...rows.value]
  const idx = arr.findIndex(r => r.__id === row.__id)
  if (idx < 0) return
  const j = idx + dir
  if (j < 0 || j >= arr.length) return
  ;[arr[idx], arr[j]] = [arr[j]!, arr[idx]!]
  // Re-stamp order sequentially based on new position
  arr.forEach((r, i) => (r.order = (i + 1) * 10))
  rows.value = arr
}

async function resetDefault() {
  try {
    saving.value = true
    errorMsg.value = ''
    await cPut('/api/config', {
      key: 'dashboard.menu',
      value: '[]',
      type: 'json',
      description: t('dashboard.menu.configResetDesc')
    })
    toast.add({ title: t('dashboard.menu.resetDone'), color: 'primary' })
    await refreshMeta()
  } catch (e) {
    errorMsg.value = extractErrorMessage(e, t('dashboard.menu.resetFailed'))
  } finally {
    saving.value = false
  }
}

async function save() {
  try {
    saving.value = true
    errorMsg.value = ''

    // Validate
    for (const r of rows.value) {
      if (!r.table) throw new Error(t('dashboard.menu.allRowsNeedTable'))
      if (!r.label) throw new Error(t('dashboard.menu.rowMissingLabel', { row: r.order / 10 }))
    }

    // Normalize order once more for cleanliness
    rows.value.forEach((r, i) => (r.order = (i + 1) * 10))

    const toSave: DashboardMenuItem[] = rows.value
      .sort((a, b) => a.order - b.order)
      .map(({ __id: _ignored, ...rest }) => rest)

    await cPut('/api/config', {
      key: 'dashboard.menu',
      value: JSON.stringify(toSave),
      type: 'json',
      description: t('dashboard.menu.configDesc')
    })

    toast.add({ title: t('dashboard.menu.saved'), color: 'success' })
    await refreshMeta()
  } catch (e) {
    errorMsg.value = extractErrorMessage(e, t('dashboard.menu.saveFailed'))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <UAlert
      v-if="errorMsg"
      color="error"
      variant="subtle"
      :description="errorMsg"
      class="mb-4"
    />

    <p class="text-sm text-muted mb-4">
      {{ t('dashboard.menu.customMenuDesc') }}
    </p>

    <div class="space-y-3">
      <div v-if="rows.length === 0" class="py-8 text-center text-muted text-sm border rounded-md">
        {{ t('dashboard.menu.emptyMenu') }}
      </div>

      <div
        v-for="r in rows"
        :key="r.__id"
        class="border border-default rounded-lg p-3 transition-colors"
      >
        <!-- Row header: order + actions -->
        <div class="flex items-center justify-between mb-3 pb-2 border-b border-default">
          <span class="text-xs font-medium text-muted">#{{ r.order }}</span>
          <div class="flex gap-1">
            <UButton
              size="xs"
              variant="ghost"
              icon="i-lucide-chevron-up"
              :disabled="rows[0]?.__id === r.__id"
              :aria-label="t('dashboard.menu.moveUp')"
              @click="move(r, -1)"
            />
            <UButton
              size="xs"
              variant="ghost"
              icon="i-lucide-chevron-down"
              :disabled="rows[rows.length - 1]?.__id === r.__id"
              :aria-label="t('dashboard.menu.moveDown')"
              @click="move(r, 1)"
            />
            <UButton
              size="xs"
              variant="ghost"
              icon="i-lucide-trash"
              color="error"
              :aria-label="t('dashboard.menu.deleteRow')"
              @click="removeRow(r.__id)"
            />
          </div>
        </div>

        <!-- Fields: label (right-aligned, narrow) | input (fill) -->
        <div class="space-y-2">
          <div class="grid grid-cols-12 items-center gap-2">
            <label class="col-span-3 text-right text-xs text-muted pr-2">{{ t('dashboard.menu.bindTable') }}</label>
            <div class="col-span-9">
              <USelectMenu
                v-model="r.table"
                value-key="value"
                :items="tableItems"
                :placeholder="t('dashboard.menu.selectTablePlaceholder')"
                size="xs"
                class="w-full"
                @update:model-value="v => { const tbl = availableTables.find(x => x.table === v); if (tbl && !r.label) { r.label = tbl.label; r.icon = tbl.icon } }"
              />
            </div>
          </div>

          <div class="grid grid-cols-12 items-center gap-2">
            <label class="col-span-3 text-right text-xs text-muted pr-2">{{ t('dashboard.menu.displayName') }}</label>
            <div class="col-span-9">
              <UInput
                :model-value="r.label"
                :placeholder="t('dashboard.menu.nameLabelPlaceholder')"
                size="xs"
                class="w-full"
                @update:model-value="v => (r.label = v as string)"
              />
            </div>
          </div>

          <div class="grid grid-cols-12 items-center gap-2">
            <label class="col-span-3 text-right text-xs text-muted pr-2">{{ t('dashboard.menu.icon') }}</label>
            <div class="col-span-9">
              <BaseIconPicker v-model="r.icon" />
            </div>
          </div>

          <div class="grid grid-cols-12 items-center gap-2">
            <label class="col-span-3 text-right text-xs text-muted pr-2">{{ t('dashboard.menu.hidden') }}</label>
            <div class="col-span-9">
              <USwitch
                :model-value="!!r.hidden"
                @update:model-value="v => (r.hidden = !!v)"
              />
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="flex justify-between mt-4 pt-4 border-t">
      <div class="flex gap-2">
        <UButton
          variant="ghost"
          size="sm"
          icon="i-lucide-plus"
          :label="t('dashboard.menu.addRow')"
          :disabled="saving"
          @click="addRow"
        />
        <UButton
          variant="ghost"
          size="sm"
          color="warning"
          icon="i-lucide-rotate-ccw"
          :label="t('dashboard.menu.resetToDefault')"
          :disabled="saving"
          @click="resetDefault"
        />
      </div>

      <div class="flex justify-end gap-2">
        <UButton
          type="submit"
          :loading="saving"
          :label="t('common.save')"
          @click="save"
        />
      </div>
    </div>
  </div>
</template>

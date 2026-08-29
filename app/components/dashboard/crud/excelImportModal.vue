<script setup lang="ts">
/**
 * DashboardCrudExcelImportModal — generic batch-import modal powered by
 * Univer sheet. Reads importable field keys from `meta.fields` to construct
 * the sheet header row, then POSTs the resulting 2D string[][] to
 * `${apiBase}/${meta.table}/import`.
 */
import type { TableMetaWithOptions } from '~/types/dashboard'

const props = withDefaults(defineProps<{
  meta: TableMetaWithOptions
  apiBase?: string
}>(), {
  apiBase: '/api/dashboard/data',
})

const { t } = useI18n()
const toast = useToast()
const open = defineModel<boolean>('open', { default: false })

const importing = ref(false)

interface ImportResult {
  total: number
  succeeded: number
  failed: number
  errors: Array<{ row: number; key: string; error: string }>
}
const importResult = ref<ImportResult | null>(null)

// Build import header/columns from meta — ioFields ordered by the backend
// contract (id + auto-fields stripped). Here we just keep form-visible fields
// that aren't id / many-to-many, mirroring server/utils ioFieldKeys.
const importHeaders = computed<{ key: string; label: string }[]>(() =>
  props.meta.fields
    .filter((f) => f.type !== 'many-to-many')
    .filter((f) => {
      if (f.key === 'id') return false
      if (!f.editable) return false
      return f.showInForm !== false
    })
    .map((f) => ({
      key: f.key,
      label: (f as any).labelKey && (t as any)((f as any).labelKey, { default: f.label })
        ? (t as any)((f as any).labelKey, { default: f.label })
        : f.label,
    })),
)

const importSheetHeaders = computed(() => importHeaders.value.map(h => h.label))
const importColWidths = computed(() => {
  const w: Record<string, number> = {}
  importHeaders.value.forEach((_, i) => { w[i] = 180 })
  return w
})

const { sheetContainer, getRows, reset } = useUniverSheet(
  () => importSheetHeaders.value,
  () => importColWidths.value,
  () => 50,
  () => open.value,
  () => false,
  () => false,
  () => false,
  () => null,
  () => {},
)

async function runImport() {
  const rows = getRows()
  if (rows.length === 0) {
    toast.add({ title: t('dashboard.excel.noRows'), color: 'error' })
    return
  }
  importing.value = true
  importResult.value = null
  try {
    const url = `${props.apiBase.replace(/\/$/, '')}/${props.meta.table}/import`
    const res = await cPost<ImportResult>(url, { rows })
    importResult.value = res
    const msgKey = res.failed > 0 ? 'dashboard.excel.importResultWarn' : 'dashboard.excel.importResultOk'
    toast.add({
      title: t(msgKey, { succeeded: res.succeeded, total: res.total, failed: res.failed }),
      color: res.failed > 0 ? 'warning' : 'success',
    })
    if (res.succeeded > 0) emit('imported')
  } catch (e: unknown) {
    toast.add({ title: extractErrorMessage(e, t('dashboard.excel.importFailed')), color: 'error' })
  } finally {
    importing.value = false
  }
}

const emit = defineEmits<{ imported: [] }>()

watch(open, (v) => {
  if (!v) {
    importResult.value = null
    return
  }
  importResult.value = null
  // Univer watcher will init the sheet once active === true. Force a fresh
  // reset so stale data from a previous table isn't carried over.
  nextTick(() => { try { reset() } catch { /* noop */ } })
})
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('dashboard.excel.importTitle', { name: meta.label })"
    :description="t('dashboard.excel.importSubtitle')"
    fullscreen
  >
    <template #body>
      <div
        ref="sheetContainer"
        class="h-80 w-full overflow-hidden rounded border border-default"
      />

      <div
        v-if="importResult && importResult.errors.length > 0"
        class="mt-4 max-h-48 overflow-auto rounded border border-error/30 bg-error/5 p-2"
      >
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted">
              <th class="px-2 py-1 w-16">{{ t('dashboard.excel.colRow') }}</th>
              <th class="px-2 py-1">{{ t('dashboard.excel.colKey') }}</th>
              <th class="px-2 py-1">{{ t('common.detail') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="err in importResult.errors"
              :key="`${err.row}-${err.key}`"
              class="border-t border-default"
            >
              <td class="px-2 py-1 text-muted">{{ err.row }}</td>
              <td class="px-2 py-1">{{ err.key || '-' }}</td>
              <td class="px-2 py-1 text-error">{{ err.error }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <template #footer>
      <div class="flex w-full items-center justify-between gap-3">
        <span
          v-if="importResult"
          class="text-sm text-muted"
        >
          {{ t('dashboard.excel.importResultSummary', { succeeded: importResult.succeeded, total: importResult.total, failed: importResult.failed }) }}
        </span>
        <span v-else />
        <div class="flex gap-2">
          <UButton
            variant="ghost"
            :label="t('common.close')"
            @click="open = false"
          />
          <UButton
            icon="i-lucide-upload"
            :label="t('dashboard.excel.importSubmit')"
            :loading="importing"
            @click="runImport"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>

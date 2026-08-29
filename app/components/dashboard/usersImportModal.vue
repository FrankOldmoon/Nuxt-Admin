<script setup lang="ts">
/**
 * Users batch-import modal — Univer sheet editor + CSV/JSON import.
 *
 * Emits `imported` after a successful import so the parent page can
 * refresh its CRUD list.
 */
const { t } = useI18n()
const toast = useToast()

const open = defineModel<boolean>('open', { default: false })

const importing = ref(false)
interface ImportError { row: number, username: string, error: string }
interface ImportResult { total: number, succeeded: number, failed: number, errors: ImportError[] }
const importResult = ref<ImportResult | null>(null)

const importHeaders = ['username', 'name', 'email', 'password']
const importColWidths: Record<string, number> = { 0: 140, 1: 180, 2: 220, 3: 160 }
const { sheetContainer: importSheetContainer, getRows: getImportRows } = useUniverSheet(
  () => importHeaders,
  () => importColWidths,
  () => 50,
  () => open.value,
  () => false,
  () => false,
  () => false,
  () => null,
  () => {}
)

async function importUsers() {
  const rows = getImportRows()
  if (rows.length === 0) {
    toast.add({ title: t('users.importNoData'), color: 'error' })
    return
  }
  const users = rows.map(r => ({
    username: r[0] ?? '',
    name: r[1] || undefined,
    email: r[2] ?? '',
    password: r[3] || undefined
  }))
  importing.value = true
  importResult.value = null
  try {
    const res = await cPost<ImportResult>('/api/dashboard/data/users/import', { users })
    importResult.value = res
    toast.add({
      title: t('users.importResult', { succeeded: res.succeeded, total: res.total, failed: res.failed }),
      color: res.failed > 0 ? 'warning' : 'success'
    })
    if (res.succeeded > 0) {
      emit('imported')
    }
  } catch (e: unknown) {
    toast.add({ title: extractErrorMessage(e, t('users.errors.saveFailed')), color: 'error' })
  } finally {
    importing.value = false
  }
}

const emit = defineEmits<{ imported: [] }>()

watch(open, (v) => {
  if (v) importResult.value = null
})
</script>

<template>
  <UModal
    v-model:open="open"
    :title="t('users.importTitle')"
    :description="t('users.importSubtitle')"
    fullscreen
  >
    <template #body>
      <div
        ref="importSheetContainer"
        class="h-80 w-full overflow-hidden rounded border border-default"
      />

      <div
        v-if="importResult && importResult.errors.length > 0"
        class="mt-4 max-h-48 overflow-auto rounded border border-error/30 bg-error/5 p-2"
      >
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-muted">
              <th class="px-2 py-1">{{ t('users.colRow') }}</th>
              <th class="px-2 py-1">{{ t('users.colUsername') }}</th>
              <th class="px-2 py-1">{{ t('common.detail') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="err in importResult.errors"
              :key="err.row"
              class="border-t border-default"
            >
              <td class="px-2 py-1 text-muted">{{ err.row }}</td>
              <td class="px-2 py-1">{{ err.username || '-' }}</td>
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
          {{ t('users.importResult', { succeeded: importResult.succeeded, total: importResult.total, failed: importResult.failed }) }}
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
            :label="t('users.importSubmit')"
            :loading="importing"
            @click="importUsers"
          />
        </div>
      </div>
    </template>
  </UModal>
</template>

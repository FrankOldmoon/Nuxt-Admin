<script setup lang="ts">
/**
 * BaseVersionHistoryModal — a button + UModal that lets an editor preview every
 * saved historical snapshot of a row (stored in its `versions` jsonb column)
 * and restore any one of them.
 *
 * Restoring issues a normal `PUT /api/dashboard/data/{table}/{id}` with the
 * snapshot's `title`/`content`; the generic `update` endpoint first snapshots
 * the *current* state (so the restore is itself undoable) before writing the
 * restored values.
 */
interface RowVersion {
  savedAt?: string
  title?: string | null
  content?: Record<string, unknown> | null
}

const props = withDefaults(defineProps<{
  /** Dashboard table name (e.g. 'posts' / 'docSections'). */
  table: string
  /** Row id to load versions for. */
  id: number | string
  /** 'icon' renders a compact ghost icon button (row actions); 'button' shows a labeled button. */
  variant?: 'icon' | 'button'
  /** Optional label for the 'button' variant (falls back to i18n). */
  label?: string
  /** Optional button color override; defaults to 'primary' for 'button', 'neutral' for 'icon'. */
  color?: 'neutral' | 'primary' | 'warning' | 'error' | 'success'
  /** Extra classes applied to the trigger button (e.g. 'flex-1'). */
  buttonClass?: string
}>(), {
  variant: 'icon',
  label: '',
  color: undefined,
  buttonClass: undefined
})

const emit = defineEmits<{
  restored: []
}>()

const { t } = useI18n()
const toast = useToast()

const open = ref(false)
const loading = ref(false)
const restoring = ref(false)
const versions = ref<RowVersion[]>([])
const selectedIdx = ref(0)

const selected = computed(() => versions.value[selectedIdx.value] ?? null)

function formatTime(ts?: string): string {
  if (!ts) return ''
  const d = new Date(ts)
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString()
}

async function openModal() {
  open.value = true
  await loadVersion()
}

async function loadVersion() {
  loading.value = true
  try {
    const res = await cGet<{ item: Record<string, unknown> }>(`/api/dashboard/data/${props.table}/${props.id}`)
    const list = Array.isArray(res?.item?.versions) ? (res.item.versions as RowVersion[]) : []
    versions.value = list
    selectedIdx.value = 0
  } catch (e) {
    toast.add({ title: (e as any)?.data?.message || t('versions.loadFailed'), color: 'error' })
  } finally {
    loading.value = false
  }
}

async function restore() {
  const v = selected.value
  if (!v) return
  restoring.value = true
  try {
    await cPut(`/api/dashboard/data/${props.table}/${props.id}`, {
      title: v.title ?? '',
      content: v.content ?? null
    })
    toast.add({ title: t('versions.restored'), color: 'success' })
    emit('restored')
    // Restoring itself creates a new snapshot of the previous state, so reload
    // the history to reflect the latest state.
    await loadVersion()
  } catch (e) {
    toast.add({ title: (e as any)?.data?.message || t('versions.restoreFailed'), color: 'error' })
  } finally {
    restoring.value = false
  }
}
</script>

<template>
  <UButton
    :variant="variant === 'button' ? 'soft' : 'ghost'"
    :color="color || (variant === 'button' ? 'primary' : 'neutral')"
    :icon="'i-lucide-history'"
    :size="variant === 'button' ? 'md' : 'xs'"
    :label="variant === 'button' ? (label || t('versions.button')) : undefined"
    :title="t('versions.button')"
    :class="buttonClass"
    @click="openModal"
  />
  <UModal v-model:open="open" :title="t('versions.title')" class="max-w-4xl">
    <template #body>
      <p
        v-if="loading"
        class="py-12 text-center text-muted"
      >
        {{ t('common.loading') }}
      </p>
      <div v-else-if="versions.length === 0" class="py-12 text-center text-muted">
        {{ t('versions.empty') }}
      </div>
      <div v-else class="grid grid-cols-1 gap-6 md:grid-cols-[260px_minmax(0,1fr)]">
        <!-- Version list -->
        <div class="max-h-[60vh] space-y-1 overflow-y-auto pr-1">
          <button
            v-for="(v, i) in versions"
            :key="i"
            type="button"
            class="flex w-full flex-col items-start gap-0.5 rounded-md border px-3 py-2 text-left text-sm transition"
            :class="i === selectedIdx
              ? 'border-primary bg-primary/10 text-primary'
              : 'border-default hover:bg-elevated'"
            @click="selectedIdx = i"
          >
            <span class="font-medium">{{ formatTime(v.savedAt) }}</span>
            <span class="truncate text-xs text-muted">{{ v.title || '—' }}</span>
          </button>
        </div>
        <!-- Selected version preview + restore -->
        <div v-if="selected" class="min-w-0 space-y-3">
          <div class="flex flex-wrap items-center gap-2">
            <h3 class="min-w-0 flex-1 truncate text-base font-semibold text-highlighted">
              {{ selected.title }}
            </h3>
            <span class="shrink-0 text-xs text-dimmed">{{ t('versions.savedAt') }}: {{ formatTime(selected.savedAt) }}</span>
          </div>
          <div class="max-h-[52vh] overflow-y-auto rounded-md border border-default bg-elevated p-4">
            <p v-if="!selected.content" class="text-sm text-muted">
              {{ t('dashboard.crud.empty') }}
            </p>
            <BaseUeditorRender v-else :json="selected.content" class="text-sm leading-relaxed" />
          </div>
        </div>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton color="neutral" variant="ghost" :label="t('common.close')" @click="open = false" />
        <UButton
          color="primary"
          variant="solid"
          :label="t('versions.restore')"
          icon="i-lucide-history"
          :disabled="!selected"
          :loading="restoring"
          @click="restore"
        />
      </div>
    </template>
  </UModal>
</template>

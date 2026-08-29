<script setup lang="ts">
/**
 * Searchable relation select with inline create capability.
 *
 * Renders a USelectMenu for choosing an existing record; when the user
 * selects "Create new…", switches to an inline input that calls
 * POST /api/dashboard/data/{table} to persist the new record and then
 * selects it automatically.
 *
 * Emits the selected value (id) via v-model, matching the parent's
 * expectation for a `relation` field.
 */
import type { FieldOption } from '~/types/dashboard'

const props = defineProps<{
  /** Relation table name (e.g. "categories", "navCategories") */
  table: string
  /** Label column key (e.g. "name") */
  labelKey: string
  /** Optional slug column key — auto-generated from the label when creating */
  slugField?: string
  /** Currently selected value */
  modelValue: string | number | null | undefined
  /** Pre-loaded options (id → label) */
  options?: FieldOption[]
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string | number | null | undefined]
}>()

const { t } = useI18n()
const toast = useToast()

/** Simple slug generator: lowercase, replace spaces with hyphens, strip non-alphanumeric. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u4e00-\u9fff\s-]/g, '')  // keep CJK characters
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 160) || 'untitled'
}

// Resolved options (merge supplied options with any newly created ones)
const localOptions = ref<FieldOption[]>([])
watch(() => props.options, (val) => {
  localOptions.value = val ?? []
}, { immediate: true })

// The selected item's value (id)
const selectedValue = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

// Create-mode state
const creating = ref(false)
const newLabel = ref('')
const saving = ref(false)

function startCreate() {
  creating.value = true
  newLabel.value = ''
  nextTick(() => {
    // Focus the input after the UI switches
    document.getElementById('creatable-new-input')?.focus()
  })
}

function cancelCreate() {
  creating.value = false
  newLabel.value = ''
}

async function confirmCreate() {
  const label = newLabel.value.trim()
  if (!label) return
  saving.value = true
  try {
    // Build the payload: label + optional auto-generated slug
    const payload: Record<string, unknown> = { [props.labelKey]: label }
    if (props.slugField) {
      payload[props.slugField] = slugify(label)
    }
    // POST to the generic dashboard data endpoint for this table.
    const res = await $fetch<{ id?: number; data?: Record<string, unknown> }>(
      `/api/dashboard/data/${props.table}`,
      { method: 'POST', body: payload }
    )
    const newId = res?.id ?? (res?.data as Record<string, unknown> | undefined)?.id
    if (newId != null) {
      // Add to local options so it appears in the dropdown immediately.
      const existing = localOptions.value.find(o => String(o.value) === String(newId))
      if (!existing) {
        localOptions.value = [
          ...localOptions.value,
          { label, value: Number(newId) }
        ]
      }
      // Select the new item.
      selectedValue.value = Number(newId)
      // Dispatch a custom event so the parent form can re-fetch relation options.
      window.dispatchEvent(new CustomEvent('relation-created', {
        detail: { table: props.table }
      }))
      toast.add({ title: t('dashboard.crud.created', { label }), color: 'success' })
    }
    creating.value = false
  } catch (e) {
    toast.add({ title: t('dashboard.crud.createFailed'), color: 'error', description: extractErrorMessage(e) })
  } finally {
    saving.value = false
  }
}

// Augment the options list with a synthetic "Create new…" option.
// Use -1 as the marker value (real ids are always positive).
const CREATE_MARKER = -1
const augmentedOptions = computed(() => {
  return [...localOptions.value, { label: t('dashboard.crud.createNew'), value: CREATE_MARKER }]
})

function onSelect(val: string | number | null | undefined) {
  if (val === CREATE_MARKER) {
    startCreate()
  } else {
    selectedValue.value = val
  }
}
</script>

<template>
  <div class="w-full">
    <!-- Searchable select when not in create mode -->
    <USelectMenu
      v-if="!creating"
      v-model="selectedValue"
      value-key="value"
      :items="augmentedOptions"
      searchable
      :placeholder="placeholder ?? t('dashboard.crud.selectPlaceholder', { label: '' })"
      class="w-full"
      @update:model-value="onSelect"
    />

    <!-- Inline create form -->
    <div v-else class="flex items-center gap-2">
      <UInput
        id="creatable-new-input"
        v-model="newLabel"
        :placeholder="t('dashboard.crud.createNewPlaceholder')"
        class="flex-1"
        :disabled="saving"
        @keydown.enter="confirmCreate"
        @keydown.esc="cancelCreate"
      />
      <UButton
        icon="i-lucide-check"
        size="sm"
        color="primary"
        :loading="saving"
        @click="confirmCreate"
      />
      <UButton
        icon="i-lucide-x"
        size="sm"
        color="neutral"
        variant="ghost"
        :disabled="saving"
        @click="cancelCreate"
      />
    </div>
  </div>
</template>
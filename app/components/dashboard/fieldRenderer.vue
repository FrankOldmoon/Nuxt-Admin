<script setup lang="ts">
/**
 * Form field renderer driven by FieldMeta.
 *
 * Two-way bound via v-model on the raw value.  Callers can override any
 * field by providing a slot named `form-{field.key}`.
 */
import type { FieldMeta, FieldOption } from '~/types/dashboard'

const props = defineProps<{
  field: FieldMeta
  modelValue: unknown
  /** Pre-loaded options for relation/select fields */
  options?: FieldOption[]
  /** Create vs update — passwords are only required on create */
  mode: 'create' | 'update'
  error?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: unknown]
}>()

const { t } = useI18n()

// The table name is provided by a parent, used to resolve i18n field labels
const dashboardTableName = inject<string | undefined>('dashboardTableName', undefined)
const { fieldLabel } = useDashboardLabels()
const fLabel = computed(() =>
  dashboardTableName ? fieldLabel(dashboardTableName, props.field) : props.field.label
)

function resolveImageSrc(raw: unknown): string {
  const s = String(raw ?? '')
  if (/^https?:\/\//i.test(s) || s.startsWith('/') || s.startsWith('data:')) return s
  return `/api/files/serve/${s}`
}

// Typed as `any` on purpose: the raw value is forwarded to many different
// Nuxt UI inputs whose modelValue types are mutually incompatible.
const inputValue = computed<any>({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

// Helper for v-model:modelValue shorthand on fields that expose v-model only
function update(val: unknown) { emit('update:modelValue', val) }

/** Convert an ISO string / Date into `YYYY-MM-DDTHH:mm` for <input type="datetime-local"> */
function formatDatetimeLocal(v: string | Date | undefined | null): string {
  if (!v) return ''
  const d = typeof v === 'string' ? new Date(v) : v
  if (isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Convert an ISO string / Date into `YYYY-MM-DD` for <input type="date"> */
function formatDate(v: string | Date | undefined | null): string {
  if (!v) return ''
  const d = typeof v === 'string' ? new Date(v) : v
  if (isNaN(d.getTime())) return String(v)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Shape the value coming back from a datetime-local input for storage. */
function formatDatetimeInput(v: unknown, nullable: boolean): unknown {
  if (!v) return nullable ? null : undefined
  return new Date(String(v)).toISOString()
}

const required = computed(() => !!props.field.validation?.required && (props.mode === 'create' || props.field.type !== 'password'))

const isTagsField = computed(() =>
  props.field.type === 'tags' || (props.field.type === 'json' && props.field.key.toLowerCase().includes('tags'))
)
// UInputTags requires an array model — normalise any string (legacy / JSON
// text) so editing never hands it a raw "new,hot" string.
const tagsValue = computed<string[]>({
  get: () => {// Sync from the potentially-string source
    if (Array.isArray(props.modelValue)) return props.modelValue as string[]
    if (typeof props.modelValue === 'string') {
      const s = (props.modelValue as string).trim()
      if (!s) return []
      try {
        const parsed = JSON.parse(s)
        if (Array.isArray(parsed)) return parsed.map(String)
      } catch { /* fall through */ }
      return s.split(/[,，\s]+/).filter(Boolean)
    }
    return []
  },
  set: (v) => update(v)
})

/** Convert a value into `HH:mm` for `<input type="time">` */
function formatTime(v: unknown): string {
  const s = String(v ?? '')
  return s.length >= 5 ? s.slice(0, 5) : s
}

/** Extract the storage path from a file value (plain string or { path, fileName }) */
function filePath(v: unknown): unknown {
  return v && typeof v === 'object' ? (v as { path?: unknown }).path : v
}
/** Extract a display name from a file value */
function fileName(v: unknown): string {
  if (v && typeof v === 'object' && 'fileName' in v) return String((v as { fileName?: unknown }).fileName ?? '')
  const p = v && typeof v === 'object' ? (v as { path?: unknown }).path : v
  return String(p ?? '')
}

// ---- Multi-file (type 'files') helpers ----
interface FileEntry { path: string, name: string }
/** Normalise the underlying value into a list of { path, name } for display. */
const filesList = computed<FileEntry[]>(() => {
  const raw = props.modelValue
  const arr = Array.isArray(raw) ? raw : (raw == null || raw === '' ? [] : [raw])
  return arr.map((x) => {
    if (x && typeof x === 'object') {
      const obj = x as Record<string, unknown>
      return { path: String(obj.path ?? ''), name: String(obj.fileName ?? obj.path ?? '') }
    }
    const p = String(x ?? '')
    return { path: p, name: p }
  })
})
/** Append newly uploaded files to the array and emit the new value. */
function appendFiles(files: unknown) {
  const list = Array.isArray(files) ? files : [files]
  const added = list.map((f) => {
    const p = (f && typeof f === 'object' && 'path' in (f as Record<string, unknown>))
      ? String((f as Record<string, unknown>).path)
      : ''
    return p
  }).filter(Boolean)
  const current = Array.isArray(props.modelValue)
    ? props.modelValue.map((x: unknown) => (x && typeof x === 'object' ? String((x as Record<string, unknown>).path ?? '') : String(x ?? '')))
    : []
  update([...current, ...added])
}
/** Remove one file by index. */
function removeFile(index: number) {
  const current = Array.isArray(props.modelValue)
    ? props.modelValue.map((x: unknown) => (x && typeof x === 'object' ? String((x as Record<string, unknown>).path ?? '') : String(x ?? '')))
    : []
  current.splice(index, 1)
  update(current)
}
</script>

<template>
  <div class="grid grid-cols-12 items-start gap-3 form-row">
    <div class="col-span-3 pt-2 text-sm text-right text-muted pr-2">
      <label :for="`field-${field.key}`">
        {{ fLabel }}
        <span v-if="required" class="text-error pl-1">*</span>
      </label>
      <p v-if="field.helpText" class="mt-1 text-xs text-muted/80">{{ field.helpText }}</p>
    </div>
    <div class="col-span-9">
      <slot :name="`form-${field.key}`" :modelValue="inputValue" :update="update">
        <!-- text / hyperlink default → UInput -->
        <UInput
          v-if="field.type === 'text'"
          v-model="inputValue"
          :id="`field-${field.key}`"
          :placeholder="field.placeholder ?? t('dashboard.crud.inputPlaceholder', { label: field.label })"
          :maxlength="field.validation?.maxLength"
          type="text"
          class="w-full"
        />
        <!-- hyperlink: URL input -->
        <UInput
          v-else-if="field.type === 'hyperlink'"
          v-model="inputValue"
          :id="`field-${field.key}`"
          :placeholder="field.placeholder ?? 'https://example.com'"
          type="url"
          class="w-full"
        />
        <!-- textarea -->
        <UTextarea
          v-else-if="field.type === 'textarea'"
          v-model="inputValue"
          :id="`field-${field.key}`"
          :placeholder="field.placeholder ?? t('dashboard.crud.inputPlaceholder', { label: field.label })"
          :rows="5"
          class="w-full"
        />
        <!-- markdown: edit raw markdown source -->
        <UTextarea
          v-else-if="field.type === 'markdown'"
          v-model="inputValue"
          :id="`field-${field.key}`"
          :placeholder="field.placeholder ?? t('dashboard.crud.inputPlaceholder', { label: field.label })"
          :rows="12"
          class="w-full font-mono text-sm"
        />
        <!-- number -->
        <UInput
          v-else-if="field.type === 'number'"
          :id="`field-${field.key}`"
          :model-value="inputValue == null ? '' : String(Number(inputValue))"
          type="number"
          :min="field.validation?.min"
          :max="field.validation?.max"
          :step="field.validation?.step ?? 'any'"
          @update:model-value="(v) => update(v === '' || v == null ? (field.nullable ? null : 0) : Number(v))"
          :placeholder="field.placeholder ?? t('dashboard.crud.inputPlaceholder', { label: field.label })"
          class="w-full"
        />
        <!-- boolean -->
        <div v-else-if="field.type === 'boolean'" class="h-9 flex items-center">
          <USwitch
            :model-value="!!inputValue"
            @update:model-value="(v) => update(v)"
          />
        </div>
        <!-- date -->
        <UInput
          v-else-if="field.type === 'date'"
          :id="`field-${field.key}`"
          :model-value="formatDate(inputValue as string | Date | undefined)"
          type="date"
          @update:model-value="(v) => update(v || (field.nullable ? null : undefined))"
          class="w-full"
        />
        <!-- time -->
        <UInput
          v-else-if="field.type === 'time'"
          :id="`field-${field.key}`"
          :model-value="formatTime(inputValue)"
          type="time"
          @update:model-value="(v) => update(v || (field.nullable ? null : undefined))"
          class="w-full"
        />
        <!-- datetime -->
        <UInput
          v-else-if="field.type === 'datetime'"
          :id="`field-${field.key}`"
          :model-value="formatDatetimeLocal(inputValue as string | Date | undefined)"
          type="datetime-local"
          @update:model-value="(v) => update(formatDatetimeInput(v, field.nullable))"
          class="w-full"
        />
        <!-- select / relation -->
        <USelectMenu
          v-else-if="field.type === 'select' || field.type === 'relation'"
          v-model="inputValue"
          value-key="value"
          :items="options ?? field.options ?? []"
          :placeholder="field.placeholder ?? t('dashboard.crud.selectPlaceholder', { label: field.label })"
          class="w-full"
        />
        <!-- many-to-many: multi-select, value array persisted on a pivot
             form field (handled by a virtual `many-to-many` field in meta) -->
        <USelectMenu
          v-else-if="field.type === 'many-to-many'"
          v-model="inputValue"
          value-key="value"
          :items="options ?? field.options ?? []"
          multiple
          :placeholder="field.placeholder ?? t('dashboard.crud.selectPlaceholder', { label: field.label })"
          class="w-full"
        />
        <!-- image / avatarPath: show existing file + uploader to replace -->
        <template v-else-if="field.type === 'image'">
          <div v-if="inputValue" class="flex items-center gap-3">
            <UTooltip :ui="{ content: '!max-w-[85vw] !w-auto !overflow-visible' }">
              <template #content>
                <img
                  :src="resolveImageSrc(filePath(inputValue))"
                  :alt="field.label"
                  class="max-h-[80vh] max-w-[80vw] rounded object-contain"
                >
              </template>
              <img
                :src="resolveImageSrc(filePath(inputValue))"
                :alt="field.label"
                class="h-14 w-14 shrink-0 cursor-zoom-in rounded object-cover border border-default"
              >
            </UTooltip>
            <span class="text-sm text-muted break-all">{{ fileName(inputValue) }}</span>
            <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-x" :aria-label="t('common.close')" @click="update(null)" />
          </div>
          <BaseFileUploader
            :max-files="1"
            :multiple="false"
            accept="image/*"
            @uploaded="(files) => {
              const first = Array.isArray(files) ? files[0] : files
              if (first?.path) update(first.path)
            }"
          />
        </template>
        <!-- files: multiple files — list existing + uploader to append -->
        <template v-else-if="field.type === 'files'">
          <div v-if="filesList.length" class="space-y-1.5">
            <div
              v-for="(item, i) in filesList"
              :key="`${item.path}-${i}`"
              class="flex items-center gap-3 rounded-md border border-default px-2 py-1.5"
            >
              <a
                :href="resolveImageSrc(item.path)"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex min-w-0 flex-1 items-center gap-1.5 text-sm text-primary hover:underline"
                :title="item.name"
              >
                <UIcon name="i-lucide-file" class="h-4 w-4 shrink-0" />
                <span class="truncate">{{ item.name }}</span>
              </a>
              <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-x" :aria-label="t('common.close')" @click="removeFile(i)" />
            </div>
          </div>
          <BaseFileUploader
            :max-files="5"
            multiple
            @uploaded="appendFiles"
          />
        </template>
        <!-- file: show existing file + uploader to replace -->
        <template v-else-if="field.type === 'file'">
          <div v-if="inputValue" class="flex items-center gap-3">
            <a
              :href="resolveImageSrc(filePath(inputValue))"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
            >
              <UIcon name="i-lucide-file" class="h-4 w-4 shrink-0" />
              <span class="break-all">{{ fileName(inputValue) }}</span>
            </a>
            <UButton size="xs" variant="ghost" color="neutral" icon="i-lucide-x" :aria-label="t('common.close')" @click="update(null)" />
          </div>
          <BaseFileUploader
            :max-files="1"
            :multiple="false"
            @uploaded="(files) => {
              const first = Array.isArray(files) ? files[0] : files
              if (first?.path) update(first.path)
            }"
          />
        </template>
        <!-- tags (JSON array persisted) -->
        <UInputTags
          v-else-if="isTagsField"
          v-model="tagsValue"
          :placeholder="field.placeholder ?? t('dashboard.crud.inputPlaceholder', { label: field.label })"
          class="w-full"
        />
        <!-- password -->
        <UInput
          v-else-if="field.type === 'password'"
          v-model="inputValue"
          :id="`field-${field.key}`"
          type="password"
          :placeholder="mode === 'create' ? t('dashboard.crud.passwordCreatePlaceholder') : t('dashboard.crud.passwordEditPlaceholder')"
          :required="mode === 'create'"
          :minlength="field.validation?.minLength"
          class="w-full"
        />
        <!-- json -->
        <UTextarea
          v-else-if="field.type === 'json'"
          :model-value="typeof inputValue === 'string' ? inputValue : JSON.stringify(inputValue ?? '', null, 2)"
          :placeholder="field.placeholder ?? t('dashboard.crud.jsonPlaceholder')"
          @update:model-value="update"
          :rows="6"
          class="w-full font-mono text-xs"
        />
        <!-- fallback -->
        <UInput v-else v-model="inputValue" type="text" :placeholder="field.placeholder" class="w-full" />
      </slot>
      <p v-if="error" class="mt-1 text-xs text-error">{{ error }}</p>
    </div>
  </div>
</template>

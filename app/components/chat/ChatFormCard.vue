<script setup lang="ts">
/**
 * Schema-driven chat form card (Core).
 *
 * The server owns the field list, labels, options and validation rules; the
 * client only renders them and posts the collected values back to the draft
 * submit endpoint. Unknown fields can never be produced here.
 */
import type { FormDescriptor, FormFieldDescriptor } from '~~/server/core/capability'

const props = defineProps<{
  schema: FormDescriptor
  initial?: Record<string, unknown>
  preview?: { summary?: string, warnings?: string[] }
  submitting?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  submit: [payload: Record<string, unknown>]
  cancel: []
}>()

const values = reactive<Record<string, unknown>>({})
const errors = reactive<Record<string, string>>({})

function reset(): void {
  for (const key of Object.keys(values)) values[key] = undefined
  for (const key of Object.keys(errors)) errors[key] = ''
  for (const field of props.schema.fields) {
    const initial = props.initial?.[field.key]
    values[field.key] = initial ?? (field.type === 'boolean' ? false : '')
  }
}

watch(() => [props.schema, props.initial], reset, { immediate: true, deep: true })

const columns = computed(() => props.schema.layout === 'two-column'
  ? 'grid gap-3 sm:grid-cols-2'
  : 'grid gap-3')

const wideFields = new Set(['textarea'])

function fieldClasses(field: FormFieldDescriptor): string {
  return wideFields.has(field.type) ? 'sm:col-span-2' : ''
}

function optionsFor(field: FormFieldDescriptor) {
  return field.options ?? []
}

function clearError(key: string): void {
  errors[key] = ''
}

function toNumber(value: unknown): number | undefined {
  if (value === '' || value === null || value === undefined) return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function validate(): Record<string, unknown> | null {
  const payload: Record<string, unknown> = {}
  const initialKeys = new Set(Object.keys(props.initial ?? {}))
  let valid = true

  for (const field of props.schema.fields) {
    errors[field.key] = ''
    const raw = values[field.key]
    const empty = raw === '' || raw === null || raw === undefined

    if (field.required && (empty || (field.type === 'boolean' && raw !== true))) {
      errors[field.key] = field.validation?.message ?? `请填写${field.label}`
      valid = false
      continue
    }
    if (empty && !initialKeys.has(field.key)) continue

    if (field.type === 'number') {
      const n = toNumber(raw)
      if (n === undefined) {
        errors[field.key] = `${field.label}必须是数字`
        valid = false
        continue
      }
      if (field.validation?.min !== undefined && n < field.validation.min) {
        errors[field.key] = `${field.label}不能小于 ${field.validation.min}`
        valid = false
        continue
      }
      if (field.validation?.max !== undefined && n > field.validation.max) {
        errors[field.key] = `${field.label}不能大于 ${field.validation.max}`
        valid = false
        continue
      }
      payload[field.key] = n
      continue
    }

    if (field.type === 'select') {
      if (empty) continue
      const match = optionsFor(field).find(option => String(option.value) === String(raw))
      payload[field.key] = match ? match.value : raw
      continue
    }

    if (field.type === 'boolean') {
      payload[field.key] = raw === true
      continue
    }

    const text = typeof raw === 'string' ? raw.trim() : String(raw ?? '')
    if (field.validation?.pattern) {
      try {
        if (!new RegExp(field.validation.pattern).test(text)) {
          errors[field.key] = field.validation.message ?? `${field.label}格式不正确`
          valid = false
          continue
        }
      } catch {
        // Invalid server-side pattern: skip the client check.
      }
    }
    payload[field.key] = text
  }

  return valid ? payload : null
}

function submit(): void {
  const payload = validate()
  if (!payload) return
  emit('submit', payload)
}
</script>

<template>
  <div class="mt-2 overflow-hidden rounded-xl border border-default bg-default">
    <div class="flex items-center gap-2 border-b border-default bg-elevated px-3 py-2">
      <UIcon
        name="i-lucide-clipboard-pen"
        class="size-3.5 shrink-0 text-primary"
      />
      <p class="min-w-0 flex-1 truncate text-xs font-medium text-highlighted">
        {{ schema.submitLabel || '表单确认' }}
      </p>
    </div>

    <div class="space-y-3 p-3">
      <p
        v-if="preview?.summary"
        class="rounded-lg bg-elevated px-3 py-2 text-xs text-toned"
      >
        {{ preview.summary }}
      </p>
      <ul
        v-if="preview?.warnings?.length"
        class="space-y-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200"
      >
        <li
          v-for="warning in preview.warnings"
          :key="warning"
          class="flex gap-1.5"
        >
          <UIcon
            name="i-lucide-triangle-alert"
            class="mt-0.5 size-3.5 shrink-0"
          />
          <span>{{ warning }}</span>
        </li>
      </ul>

      <form
        :class="columns"
        @submit.prevent="submit"
      >
        <div
          v-for="field in schema.fields"
          :key="field.key"
          :class="fieldClasses(field)"
        >
          <label
            :for="`chat-form-${field.key}`"
            class="mb-1 block text-xs font-medium text-toned"
          >
            {{ field.label }}
            <span
              v-if="field.required"
              class="text-red-500"
            >*</span>
          </label>

          <textarea
            v-if="field.type === 'textarea'"
            :id="`chat-form-${field.key}`"
            v-model="values[field.key]"
            :placeholder="field.placeholder"
            :readonly="field.readonly || disabled"
            rows="3"
            class="w-full rounded-lg border border-default bg-default px-2.5 py-1.5 text-sm text-highlighted outline-none focus:border-primary disabled:opacity-60"
            @input="clearError(field.key)"
          />

          <input
            v-else-if="field.type === 'text' || field.type === 'date' || field.type === 'datetime'"
            :id="`chat-form-${field.key}`"
            v-model="values[field.key]"
            :type="field.type === 'text' ? 'text' : field.type === 'date' ? 'date' : 'datetime-local'"
            :placeholder="field.placeholder"
            :readonly="field.readonly || disabled"
            class="w-full rounded-lg border border-default bg-default px-2.5 py-1.5 text-sm text-highlighted outline-none focus:border-primary disabled:opacity-60"
            @input="clearError(field.key)"
          >

          <input
            v-else-if="field.type === 'number'"
            :id="`chat-form-${field.key}`"
            v-model="values[field.key]"
            type="number"
            :placeholder="field.placeholder"
            :readonly="field.readonly || disabled"
            class="w-full rounded-lg border border-default bg-default px-2.5 py-1.5 text-sm text-highlighted outline-none focus:border-primary disabled:opacity-60"
            @input="clearError(field.key)"
          >

          <select
            v-else-if="field.type === 'select' && optionsFor(field).length"
            :id="`chat-form-${field.key}`"
            v-model="values[field.key]"
            :disabled="field.readonly || disabled"
            class="w-full rounded-lg border border-default bg-default px-2.5 py-1.5 text-sm text-highlighted outline-none focus:border-primary disabled:opacity-60"
            @change="clearError(field.key)"
          >
            <option value="">
              请选择
            </option>
            <option
              v-for="option in optionsFor(field)"
              :key="String(option.value)"
              :value="String(option.value)"
            >
              {{ option.label }}
            </option>
          </select>

          <input
            v-else-if="field.type === 'select'"
            :id="`chat-form-${field.key}`"
            v-model="values[field.key]"
            type="number"
            :placeholder="field.placeholder || '请输入 ID'"
            :readonly="field.readonly || disabled"
            class="w-full rounded-lg border border-default bg-default px-2.5 py-1.5 text-sm text-highlighted outline-none focus:border-primary disabled:opacity-60"
            @input="clearError(field.key)"
          >

          <label
            v-else-if="field.type === 'boolean'"
            class="flex items-center gap-2 text-sm text-toned"
          >
            <input
              :id="`chat-form-${field.key}`"
              v-model="values[field.key]"
              type="checkbox"
              :disabled="field.readonly || disabled"
              class="size-4 rounded border-default"
            >
            <span>{{ field.placeholder || '是' }}</span>
          </label>

          <p
            v-if="field.help && !errors[field.key]"
            class="mt-1 text-[11px] text-muted"
          >
            {{ field.help }}
          </p>
          <p
            v-if="errors[field.key]"
            class="mt-1 text-[11px] text-red-500"
          >
            {{ errors[field.key] }}
          </p>
        </div>

        <div class="flex items-center justify-end gap-2 sm:col-span-2">
          <UButton
            color="neutral"
            variant="ghost"
            size="sm"
            :disabled="submitting"
            @click="emit('cancel')"
          >
            {{ schema.cancelLabel || '取消' }}
          </UButton>
          <UButton
            type="submit"
            size="sm"
            :loading="submitting"
            :disabled="disabled"
          >
            {{ schema.submitLabel || '提交' }}
          </UButton>
        </div>
      </form>
    </div>
  </div>
</template>

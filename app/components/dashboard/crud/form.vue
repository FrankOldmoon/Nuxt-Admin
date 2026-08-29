<script setup lang="ts">
/**
 * Create/Edit form driven by FieldMeta.
 * Renders one field per meta row with `form-{key}` slot override,
 * and provides a `form-before` / `form-after` slot too.
 */
import type { TableMetaWithOptions } from '~/types/dashboard'

const props = defineProps<{
  meta: TableMetaWithOptions
  modelValue: Record<string, unknown>
  mode: 'create' | 'update'
  errors?: Record<string, string>
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, unknown>]
}>()

function patch<K extends string>(k: K, v: unknown) {
  emit('update:modelValue', { ...props.modelValue, [k]: v })
}

const formFields = computed(() => props.meta.fields.filter(f => f.showInForm))

provide('dashboardTableName', props.meta.table)

function hasFormSlot(key: string): boolean {
  const slots = useSlots()
  return !!slots[`form-${key}`]
}
provide('hasFormSlot', hasFormSlot)
</script>

<template>
  <div class="space-y-4">
    <slot name="form-before" :form="modelValue" :patch="patch" />
    <DashboardFieldRenderer
      v-for="f in formFields"
      :key="f.key"
      :field="f"
      :options="meta.relationOptions?.[f.key]"
      :mode="mode"
      :error="errors?.[f.key]"
      :model-value="modelValue[f.key]"
      @update:model-value="(v) => patch(f.key, v)"
    >
      <template #[`form-${f.key}`]="slotProps">
        <slot :name="`form-${f.key}`" v-bind="slotProps" :form="modelValue" :patch="patch" />
      </template>
    </DashboardFieldRenderer>
    <slot name="form-after" :form="modelValue" :patch="patch" />
  </div>
</template>

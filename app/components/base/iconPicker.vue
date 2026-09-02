<script setup lang="ts">
/**
 * Icon picker component for selecting Iconify icon classes.
 *
 * Usage:
 *   <BaseIconPicker v-model="icon" />
 *
 * Shows a preview of the current icon, opens a modal with a searchable
 * grid of Lucide icons to pick from.
 */
import { filterLucideIcons } from '~/utils/lucideIcons'

const modelValue = defineModel<string>({ default: '' })

const { t } = useI18n()

const open = ref(false)
const search = ref('')

const filteredIcons = computed(() => filterLucideIcons(search.value))

function pick(icon: string) {
  modelValue.value = icon
  open.value = false
  search.value = ''
}
</script>

<template>
  <div class="flex items-center gap-2">
    <UInput
      :model-value="modelValue"
      placeholder="i-lucide-xxx"
      class="flex-1"
      @update:model-value="modelValue = $event as string"
    />
    <UButton
      icon="i-lucide-grid-3x3"
      variant="outline"
      :aria-label="t('dashboard.menu.selectIcon')"
      @click="open = true"
    />
    <div class="flex h-8 w-8 items-center justify-center rounded border border-default">
      <UIcon :name="modelValue || 'i-lucide-circle-dashed'" class="h-4 w-4 text-muted" />
    </div>
  </div>

  <UModal v-model:open="open" :title="t('dashboard.menu.selectIcon')" class="max-w-2xl">
    <template #body>
      <div class="space-y-3">
        <UInput
          v-model="search"
          icon="i-lucide-search"
          :placeholder="t('common.searchPlaceholder')"
          class="w-full"
        />
        <div class="grid max-h-[60vh] grid-cols-6 gap-2 overflow-y-auto sm:grid-cols-8">
          <button
            v-for="icon in filteredIcons"
            :key="icon"
            type="button"
            class="flex flex-col items-center gap-1 rounded-lg border border-default p-2 transition hover:bg-elevated"
            :class="{ 'border-primary bg-primary/10': modelValue === icon }"
            @click="pick(icon)"
          >
            <UIcon :name="icon" class="h-5 w-5" />
            <span class="w-full truncate text-[10px] text-muted text-center">
              {{ icon.replace('i-lucide-', '') }}
            </span>
          </button>
        </div>
      </div>
    </template>
  </UModal>
</template>

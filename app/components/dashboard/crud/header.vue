<script setup lang="ts">
const { t } = useI18n()

defineProps<{
  title: string
  subtitle?: string
  createLabel?: string
  trashed?: boolean
}>()

const emit = defineEmits<{
  'create': []
  'update:trashed': [boolean]
}>()
</script>

<template>
  <div class="mb-6 flex items-center justify-between">
    <div>
      <h1 class="text-3xl font-bold text-highlighted">
        {{ title }}
        <span
          v-if="trashed"
          class="text-base font-normal text-muted"
        >({{ t('common.trash') }})</span>
      </h1>
      <p
        v-if="subtitle"
        class="mt-1 text-sm text-muted"
      >
        {{ subtitle }}
      </p>
    </div>
    <div class="flex items-center gap-2">
      <UButton
        :icon="trashed ? 'i-lucide-arrow-left' : 'i-lucide-trash-2'"
        :color="trashed ? 'primary' : 'error'"
        :variant="trashed ? 'soft' : 'ghost'"
        :label="trashed ? t('common.back') : t('common.trash')"
        @click="emit('update:trashed', !trashed)"
      />
      <slot name="header-actions">
        <UButton
          v-if="createLabel && !trashed"
          icon="i-lucide-plus"
          :label="createLabel"
          @click="emit('create')"
        />
      </slot>
    </div>
  </div>
</template>

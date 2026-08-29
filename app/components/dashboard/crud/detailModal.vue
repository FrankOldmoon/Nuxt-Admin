<script setup lang="ts">
defineProps<{
  detailOpen?: boolean
  detailTitle?: string
}>()

const emit = defineEmits<{
  'update:detailOpen': [boolean]
}>()

const { t } = useI18n()
</script>

<template>
  <UModal
    :open="detailOpen"
    :title="detailTitle"
    @update:open="emit('update:detailOpen', $event)"
  >
    <template #body>
      <dl class="space-y-3">
        <slot name="detail" />
      </dl>
      <div class="mt-6 flex justify-end">
        <UButton
          color="neutral"
          variant="ghost"
          :label="t('common.close')"
          @click="emit('update:detailOpen', false)"
        />
      </div>
    </template>
  </UModal>
</template>

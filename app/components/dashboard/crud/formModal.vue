<script setup lang="ts">
defineProps<{
  modalOpen?: boolean
  modalTitle?: string
  modalUi?: Record<string, string>
  saving?: boolean
  errorMsg?: string
}>()

const emit = defineEmits<{
  'update:modalOpen': [boolean]
  'save': []
  'cancel': []
}>()

const { t } = useI18n()
</script>

<template>
  <UModal
    :open="modalOpen"
    :title="modalTitle"
    :ui="modalUi"
    @update:open="emit('update:modalOpen', $event)"
  >
    <template #body>
      <UAlert
        v-if="errorMsg"
        color="error"
        variant="subtle"
        :description="errorMsg"
        class="mb-4"
      />
      <form
        class="space-y-4"
        @submit.prevent="emit('save')"
      >
        <slot name="form" />
        <div class="flex justify-end gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            :label="t('common.cancel')"
            @click="emit('cancel')"
          />
          <UButton
            type="submit"
            :loading="saving"
            :label="t('common.save')"
          />
        </div>
      </form>
    </template>
  </UModal>
</template>

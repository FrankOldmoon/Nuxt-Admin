<script setup lang="ts">
type Color = 'error' | 'primary' | 'secondary' | 'success' | 'info' | 'warning' | 'neutral'
type Variant = 'ghost' | 'link' | 'solid' | 'outline' | 'soft' | 'subtle'
type Size = 'xs' | 'sm' | 'md' | 'lg' | 'xl'

const { t } = useI18n()

withDefaults(defineProps<{
  icon?: string
  color?: Color
  variant?: Variant
  size?: Size
  label?: string
  title?: string
  confirmText?: string
  confirmLabel?: string
  cancelLabel?: string
  confirmColor?: Color
  loading?: boolean
  disabled?: boolean
}>(), {
  variant: 'ghost',
  confirmColor: 'error',
  confirmText: '',
  confirmLabel: '',
  cancelLabel: '',
  loading: false,
  disabled: false
})

const emit = defineEmits<{
  confirm: []
}>()

const open = ref(false)

function onConfirm() {
  emit('confirm')
  open.value = false
}
</script>

<template>
  <UPopover
    v-model:open="open"
    :content="{ align: 'center' }"
  >
    <UButton
      :icon="icon"
      :color="color"
      :variant="variant"
      :size="size"
      :label="label"
      :title="title"
      :loading="loading"
      :disabled="disabled"
    />
    <template #content>
      <div class="flex flex-col gap-3 p-4">
        <p class="text-sm text-default">
          {{ confirmText || t('common.confirmAction') }}
        </p>
        <div class="flex justify-end gap-2">
          <UButton
            size="xs"
            color="neutral"
            variant="soft"
            :label="cancelLabel || t('common.cancel')"
            @click="open = false"
          />
          <UButton
            size="xs"
            :color="confirmColor"
            variant="soft"
            :label="confirmLabel || t('common.confirm')"
            @click="onConfirm"
          />
        </div>
      </div>
    </template>
  </UPopover>
</template>

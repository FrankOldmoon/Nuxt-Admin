<script setup lang="ts">
import type { AuthMode } from './form.vue'

const props = defineProps<{
  open: boolean
  mode?: AuthMode
}>()
const emit = defineEmits<{
  'update:open': [value: boolean]
  'update:mode': [mode: AuthMode]
  'success': []
}>()

const { t } = useI18n()
const { isLoggedIn } = useAuth()
const internalMode = ref<AuthMode>(props.mode ?? 'login')

watch(() => props.mode, (v) => {
  if (v) internalMode.value = v
})

function close() {
  emit('update:open', false)
}

function onSuccess() {
  emit('success')
  if (isLoggedIn.value) {
    close()
  }
}
</script>

<template>
  <UModal
    :open="open"
    :title="t('auth.modal.title')"
    :ui="{ content: 'max-w-md' }"
    @update:open="(v) => emit('update:open', v)"
  >
    <template #body>
      <AuthForm
        :mode="internalMode"
        :redirect-on-success="false"
        @success="onSuccess"
        @update:mode="(m: AuthMode) => { internalMode = m; emit('update:mode', m) }"
      />
    </template>
  </UModal>
</template>

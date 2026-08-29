<script setup lang="ts" generic="T">
const { t } = useI18n()
const { can } = usePermission()

withDefaults(defineProps<{
  item: T
  table: string
  mode?: 'active' | 'trashed'
  showDetail?: boolean
}>(), {
  showDetail: true
})

const emit = defineEmits<{
  detail: [item: T]
  edit: [item: T]
  delete: [item: T]
  restore: [item: T]
  permanentDelete: [item: T]
}>()
</script>

<template>
  <div class="flex justify-end gap-1">
    <template v-if="mode === 'trashed'">
      <UButton
        v-if="can(table, 'update')"
        icon="i-lucide-rotate-ccw"
        size="xs"
        color="success"
        variant="ghost"
        :title="t('common.restore')"
        @click="emit('restore', item)"
      />
      <BaseConfirmButton
        v-if="can(table, 'delete')"
        icon="i-lucide-x-circle"
        size="xs"
        color="error"
        variant="ghost"
        :title="t('common.permanentDelete')"
        :confirm-text="t('common.confirmPermanentDelete')"
        @confirm="emit('permanentDelete', item)"
      />
    </template>
    <template v-else>
      <UButton
        v-if="showDetail && can(table, 'read')"
        icon="i-lucide-eye"
        size="xs"
        color="neutral"
        variant="ghost"
        :title="t('common.detail')"
        @click="emit('detail', item)"
      />
      <UButton
        v-if="can(table, 'update')"
        icon="i-lucide-pencil"
        size="xs"
        color="neutral"
        variant="ghost"
        :title="t('common.edit')"
        @click="emit('edit', item)"
      />
      <BaseConfirmButton
        v-if="can(table, 'delete')"
        icon="i-lucide-trash"
        size="xs"
        color="error"
        variant="ghost"
        :title="t('common.delete')"
        :confirm-text="t('common.confirmDelete')"
        @confirm="emit('delete', item)"
      />
    </template>
  </div>
</template>

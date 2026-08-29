<script setup lang="ts">
/**
 * Dashboard menu editor — drag-and-drop multi-level tree editor.
 * Embedded in the configs page's "Menu" tab.
 * Uses the generic BaseTreeEditor component for the tree UI.
 * Clicking a row opens a modal for detailed editing.
 */
import type { DashboardMenuItem } from '~/types/dashboard'
import type { MenuFlatNode } from '~/composables/useMenuEditor'
import { useMenuEditor } from '~/composables/useMenuEditor'

const { t } = useI18n()
const toast = useToast()

const { data: metaData, refresh: refreshMeta } = await useDashboardMeta()

const menu = computed<DashboardMenuItem[]>(() => metaData.value?.menu ?? [])
const availableTables = computed(() => metaData.value?.tables ?? [])

const saving = ref(false)
const errorMsg = ref('')

const {
  flatItems, visibleItems, collapsedKeys,
  editModalOpen, editForm, editingIndex,
  hasChildren, toggleCollapse, originalIndex,
  checkMove, onDragStart, onVisibleUpdate, onDragEnd,
  addRoot, addSibling, addChild, deleteItem,
  openEdit, saveEdit: saveEditItem,
  save,
} = useMenuEditor(menu, availableTables, async (toSave) => {
  saving.value = true
  errorMsg.value = ''
  try {
    // Validate
    for (const item of toSave) {
      if (!item.url && !item.table) throw new Error(t('dashboard.menu.allRowsNeedTable'))
      if (!item.label) throw new Error(t('dashboard.menu.rowMissingLabel', { row: '' }))
    }
    await cPut('/api/config', {
      key: 'dashboard.menu',
      value: JSON.stringify(toSave),
      type: 'json',
      description: t('dashboard.menu.configDesc')
    })
    toast.add({ title: t('dashboard.menu.saved'), color: 'success' })
    await refreshMeta()
  } catch (e) {
    errorMsg.value = extractErrorMessage(e, t('dashboard.menu.saveFailed'))
  } finally {
    saving.value = false
  }
})

async function resetDefault() {
  try {
    saving.value = true
    errorMsg.value = ''
    await cPut('/api/config', {
      key: 'dashboard.menu',
      value: '[]',
      type: 'json',
      description: t('dashboard.menu.configResetDesc')
    })
    toast.add({ title: t('dashboard.menu.resetDone'), color: 'primary' })
    await refreshMeta()
  } catch (e) {
    errorMsg.value = extractErrorMessage(e, t('dashboard.menu.resetFailed'))
  } finally {
    saving.value = false
  }
}

function getLabel(item: MenuFlatNode) {
  return item.label || item.url || '(empty)'
}
function getDepth(item: MenuFlatNode) {
  return item.depth
}
</script>

<template>
  <div>
    <UAlert
      v-if="errorMsg"
      color="error"
      variant="subtle"
      :description="errorMsg"
      class="mb-4"
    />

    <p class="text-sm text-muted mb-4">
      {{ t('dashboard.menu.customMenuDesc') }}
    </p>

    <BaseTreeEditor
      v-model="flatItems"
      v-model:collapsed-keys="collapsedKeys"
      :max-depth="3"
      :get-label="getLabel"
      :get-depth="getDepth"
      @add-root="addRoot"
      @add-sibling="addSibling"
      @add-child="addChild"
      @delete="deleteItem"
    >
      <template #item="{ item, index }">
        <button
          class="flex-1 min-w-0 text-left text-sm truncate px-2 py-1 rounded hover:bg-muted transition-colors"
          @click="openEdit(index)"
        >
          <UIcon v-if="item.icon" :name="item.icon" class="size-3.5 mr-1.5 shrink-0 align-middle" />
          {{ item.label || '(untitled)' }}
          <span class="text-xs text-muted ml-1">{{ item.url }}</span>
          <span v-if="item.hidden" class="text-xs text-muted ml-1">({{ t('dashboard.menu.hidden') }})</span>
        </button>
      </template>
    </BaseTreeEditor>

    <div class="flex justify-between mt-4 pt-4 border-t">
      <UButton
        variant="ghost"
        size="sm"
        color="warning"
        icon="i-lucide-rotate-ccw"
        :label="t('dashboard.menu.resetToDefault')"
        :disabled="saving"
        @click="resetDefault"
      />
      <UButton
        type="submit"
        :loading="saving"
        :label="t('common.save')"
        @click="save"
      />
    </div>

    <!-- Edit modal -->
    <UModal v-model:open="editModalOpen">
      <template #body>
        <div class="space-y-4 p-4">
          <h3 class="text-lg font-medium">{{ t('dashboard.menu.editMenuItem') }}</h3>

          <div class="grid grid-cols-12 items-center gap-2">
            <label class="col-span-3 text-right text-xs text-muted pr-2">{{ t('dashboard.menu.url') }}</label>
            <div class="col-span-9">
              <UInput
                v-model="editForm.url"
                placeholder="/dashboard/users"
                size="sm"
                class="w-full"
              />
            </div>
          </div>

          <div class="grid grid-cols-12 items-center gap-2">
            <label class="col-span-3 text-right text-xs text-muted pr-2">{{ t('dashboard.menu.displayName') }}</label>
            <div class="col-span-9">
              <UInput
                v-model="editForm.label"
                :placeholder="t('dashboard.menu.nameLabelPlaceholder')"
                size="sm"
                class="w-full"
              />
            </div>
          </div>

          <div class="grid grid-cols-12 items-center gap-2">
            <label class="col-span-3 text-right text-xs text-muted pr-2">{{ t('dashboard.menu.icon') }}</label>
            <div class="col-span-9">
              <BaseIconPicker v-model="editForm.icon" />
            </div>
          </div>

          <div class="grid grid-cols-12 items-center gap-2">
            <label class="col-span-3 text-right text-xs text-muted pr-2">{{ t('dashboard.menu.hidden') }}</label>
            <div class="col-span-9">
              <USwitch v-model="editForm.hidden" />
            </div>
          </div>

          <div class="flex justify-end gap-2 pt-2">
            <UButton color="neutral" variant="ghost" @click="editModalOpen = false">
              {{ t('common.cancel') }}
            </UButton>
            <UButton color="primary" @click="saveEditItem">
              {{ t('common.save') }}
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
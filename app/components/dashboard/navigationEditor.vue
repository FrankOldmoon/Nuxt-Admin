<script setup lang="ts">
/**
 * Header navigation editor — drag-and-drop multi-level tree editor.
 * Embedded in the configs page's "Navigation" tab.
 * Uses the generic BaseTreeEditor component for the tree UI.
 * Saves to the `site.navigation` config key.
 */
interface NavItem {
  label: string
  url: string
  icon?: string
  order?: number
  hidden?: boolean
  parentId?: string | null
}

interface FlatNode {
  _key: string
  label: string
  url: string
  icon: string
  hidden: boolean
  depth: number
  parentId: string | null
}

const { t } = useI18n()
const toast = useToast()

const saving = ref(false)
const errorMsg = ref('')

// Load current navigation config
const { data: configs } = await useAsyncData<Array<{ key: string, value: string }>>(
  'settings:navConfig',
  async () => {
    const res = await cRequest<{ configs: Array<{ key: string, value: string }> }>('/api/config')
    return res.configs
  },
  { default: () => [] as Array<{ key: string, value: string }> }
)

const rawNav = computed(() => {
  const cfg = configs.value?.find(c => c.key === 'site.navigation')
  if (!cfg?.value) return []
  try {
    const parsed = JSON.parse(cfg.value)
    return Array.isArray(parsed) ? parsed as NavItem[] : []
  } catch {
    return []
  }
})

// Build flat tree nodes
let keyCounter = 0
function genKey(): string { return 'n-' + keyCounter++ }

interface Flat extends FlatNode {}

function flatFromNav(items: NavItem[]): Flat[] {
  const result: Flat[] = []
  const depthMap = new Map<string, number>() // label -> depth
  for (const item of items) {
    const parentId = item.parentId ?? null
    const depth = parentId ? (depthMap.get(parentId) ?? 0) + 1 : 0
    const node: Flat = {
      _key: genKey(),
      label: item.label ?? '',
      url: item.url ?? '',
      icon: item.icon ?? '',
      hidden: !!item.hidden,
      depth,
      parentId,
    }
    depthMap.set(node.label, depth)
    result.push(node)
  }
  return result
}

function navFromFlat(nodes: Flat[]): NavItem[] {
  const result: NavItem[] = []
  let idx = 0
  for (const node of nodes) {
    result.push({
      label: node.label,
      url: node.url,
      icon: node.icon || undefined,
      hidden: node.hidden,
      order: (++idx) * 10,
      parentId: node.parentId ?? null, // parent is stored as the parent item's label
    })
  }
  return result
}

const flatItems = ref<Flat[]>([])
watch(rawNav, (items) => {
  flatItems.value = flatFromNav(items)
}, { immediate: true })

const collapsedKeys = ref(new Set<string>())

// Tree helpers
function hasChildren(key: string): boolean {
  const idx = flatItems.value.findIndex(i => i._key === key)
  if (idx === -1 || idx >= flatItems.value.length - 1) return false
  return flatItems.value[idx + 1].depth > flatItems.value[idx].depth
}

function getBlockEnd(list: Flat[], startIdx: number): number {
  const depth = list[startIdx].depth
  let end = startIdx
  for (let i = startIdx + 1; i < list.length; i++) {
    if (list[i].depth <= depth) break
    end = i
  }
  return end
}

function toggleCollapse(key: string) {
  const next = new Set(collapsedKeys.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  collapsedKeys.value = next
}

const visibleItems = computed(() => {
  const result: Flat[] = []
  const ancestors: Flat[] = []
  for (const item of flatItems.value) {
    while (ancestors.length > 0 && ancestors[ancestors.length - 1].depth >= item.depth) {
      ancestors.pop()
    }
    if (!ancestors.some(a => collapsedKeys.value.has(a._key))) {
      result.push(item)
      ancestors.push(item)
    }
  }
  return result
})

function originalIndex(visibleIdx: number): number {
  const v = visibleItems.value[visibleIdx]
  if (!v) return visibleIdx
  return flatItems.value.findIndex(i => i._key === v._key)
}

// Drag-and-drop
let dragTargetKey: string | null = null
let lastMoveInfo: { relatedKey: string; willInsertAfter: boolean } | null = null

function checkMove(evt: any): boolean {
  const dragged = evt.draggedContext?.element as Flat | undefined
  const related = evt.relatedContext?.element as Flat | undefined
  if (!dragged || !related) return false
  if (dragged.depth !== related.depth) return false
  if (evt.willInsertAfter && !collapsedKeys.value.has(related._key) && hasChildren(related._key)) return false
  dragTargetKey = dragged._key
  lastMoveInfo = { relatedKey: related._key, willInsertAfter: !!evt.willInsertAfter }
  return true
}

function onDragStart(evt: any) {
  const item = visibleItems.value[evt.oldIndex]
  dragTargetKey = item ? item._key : null
  lastMoveInfo = null
}

function onVisibleUpdate(newVisible: Flat[]) {
  const old = flatItems.value
  const dragIdx = dragTargetKey ? old.findIndex(i => i._key === dragTargetKey) : -1
  if (dragIdx !== -1) {
    const blockEnd = getBlockEnd(old, dragIdx)
    const block = old.slice(dragIdx, blockEnd + 1)
    const rest = old.slice(0, dragIdx).concat(old.slice(blockEnd + 1))
    let insertAt = -1
    if (lastMoveInfo) {
      const relatedIdx = rest.findIndex(i => i._key === lastMoveInfo!.relatedKey)
      if (relatedIdx !== -1) {
        insertAt = lastMoveInfo.willInsertAfter ? getBlockEnd(rest, relatedIdx) + 1 : relatedIdx
      }
    }
    if (insertAt === -1) {
      const newIdx = newVisible.findIndex(v => v._key === dragTargetKey)
      if (newIdx === 0) {
        insertAt = 0
      } else if (newIdx > 0) {
        const prevItem = newVisible[newIdx - 1]
        if (prevItem) {
          const prevIdx = rest.findIndex(i => i._key === prevItem._key)
          if (prevIdx !== -1) insertAt = getBlockEnd(rest, prevIdx) + 1
        }
      }
    }
    if (insertAt >= 0 && insertAt <= rest.length) {
      flatItems.value = rest.slice(0, insertAt).concat(block, rest.slice(insertAt))
      return
    }
  }
  flatItems.value = [...old]
}

function onDragEnd() {
  dragTargetKey = null
  lastMoveInfo = null
}

// CRUD
function createNode(depth: number, parentKey: string | null): Flat {
  return {
    _key: genKey(),
    label: '',
    url: '',
    icon: '',
    hidden: false,
    depth,
    parentId: parentKey,
  }
}

function addRoot() { flatItems.value = [...flatItems.value, createNode(0, null)] }
function addSibling(index: number) {
  const newItems = [...flatItems.value]
  const depth = newItems[index].depth
  const parentKey = depth > 0 ? newItems[index].parentId : null
  const blockEnd = getBlockEnd(newItems, index)
  newItems.splice(blockEnd + 1, 0, createNode(depth, parentKey))
  flatItems.value = newItems
}
function addChild(index: number) {
  const newItems = [...flatItems.value]
  const node = newItems[index]
  if (node.depth >= 2) return
  const blockEnd = getBlockEnd(newItems, index)
  newItems.splice(blockEnd + 1, 0, createNode(node.depth + 1, node.label))
  flatItems.value = newItems
  if (collapsedKeys.value.has(node._key)) {
    const next = new Set(collapsedKeys.value)
    next.delete(node._key)
    collapsedKeys.value = next
  }
}
function deleteItem(index: number) {
  const newItems = [...flatItems.value]
  const blockEnd = getBlockEnd(newItems, index)
  newItems.splice(index, blockEnd - index + 1)
  flatItems.value = newItems
}

// Modal editing
const editModalOpen = ref(false)
const editForm = ref<Flat>({ _key: '', label: '', url: '', icon: '', hidden: false, depth: 0, parentId: null })

function openEdit(index: number) {
  const item = flatItems.value[index]
  if (!item) return
  editForm.value = { ...item }
  editModalOpen.value = true
}

function saveEditItem() {
  const idx = flatItems.value.findIndex(i => i._key === editForm.value._key)
  if (idx !== -1) {
    const newItems = [...flatItems.value]
    newItems[idx] = { ...editForm.value }
    flatItems.value = newItems
  }
  editModalOpen.value = false
}

async function save() {
  saving.value = true
  errorMsg.value = ''
  try {
    for (const item of flatItems.value) {
      if (!item.label) throw new Error(t('dashboard.menu.rowMissingLabel', { row: '' }))
    }
    const toSave = navFromFlat(flatItems.value)
    await cPut('/api/config', {
      key: 'site.navigation',
      value: JSON.stringify(toSave),
      type: 'json',
      description: t('settings.navigation.configDesc')
    })
    toast.add({ title: t('settings.navigation.saved'), color: 'success' })
    await refreshNuxtData('config:public').catch(() => {})
  } catch (e) {
    errorMsg.value = extractErrorMessage(e, t('settings.navigation.saveFailed'))
  } finally {
    saving.value = false
  }
}

function getLabel(item: Flat) { return item.label || item.url || '(empty)' }
function getDepth(item: Flat) { return item.depth }
</script>

<template>
  <div>
    <UAlert v-if="errorMsg" color="error" variant="subtle" :description="errorMsg" class="mb-4" />

    <p class="text-sm text-muted mb-4">
      {{ t('settings.navigation.desc') }}
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

    <div class="flex justify-end mt-4 pt-4 border-t">
      <UButton type="submit" :loading="saving" :label="t('common.save')" @click="save" />
    </div>

    <!-- Edit modal -->
    <UModal v-model:open="editModalOpen">
      <template #body>
        <div class="space-y-4 p-4">
          <h3 class="text-lg font-medium">{{ t('settings.navigation.editItem') }}</h3>

          <div class="grid grid-cols-12 items-center gap-2">
            <label class="col-span-3 text-right text-xs text-muted pr-2">{{ t('dashboard.menu.displayName') }}</label>
            <div class="col-span-9">
              <UInput v-model="editForm.label" placeholder="/dashboard/users" size="sm" class="w-full" />
            </div>
          </div>

          <div class="grid grid-cols-12 items-center gap-2">
            <label class="col-span-3 text-right text-xs text-muted pr-2">{{ t('dashboard.menu.url') }}</label>
            <div class="col-span-9">
              <UInput v-model="editForm.url" placeholder="/blog" size="sm" class="w-full" />
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
            <UButton color="neutral" variant="ghost" @click="editModalOpen = false">{{ t('common.cancel') }}</UButton>
            <UButton color="primary" @click="saveEditItem">{{ t('common.save') }}</UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
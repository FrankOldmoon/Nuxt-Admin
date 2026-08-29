<template>
  <div>
    <draggable
      :model-value="visibleItems"
      item-key="_key"
      handle=".drag-handle"
      :move="checkMove"
      ghost-class="ghost"
      tag="div"
      class="space-y-0.5"
      @update:model-value="onVisibleUpdate"
      @start="onDragStart"
      @end="onDragEnd"
    >
      <template #item="{ element: item, index }">
        <div
          class="flex items-center gap-1 rounded-lg border border-transparent hover:border-default group transition-colors"
          :style="{ paddingLeft: getDepth(item) * 20 + 4 + 'px' }"
        >
          <!-- Collapse/expand -->
          <button
            v-if="hasChildren(item._key)"
            class="shrink-0 flex items-center justify-center size-4 rounded text-muted hover:text-foreground transition-colors cursor-pointer"
            @click.stop="toggleCollapse(item._key)"
          >
            <UIcon :name="collapsedKeys.has(item._key) ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'" class="size-3" />
          </button>
          <span v-else class="shrink-0 size-4" />

          <!-- Drag handle -->
          <div class="drag-handle cursor-grab active:cursor-grabbing shrink-0 text-muted hover:text-foreground">
            <UIcon name="i-lucide-grip-vertical" class="size-3.5" />
          </div>

          <!-- Custom item content -->
          <slot name="item" :item="item" :index="originalIndex(index)" :item-key="item._key" :depth="getDepth(item)">
            <span class="flex-1 min-w-0 text-sm truncate">{{ getLabel(item) }}</span>
          </slot>

          <!-- Action buttons -->
          <div class="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <slot name="actions" :item="item" :index="originalIndex(index)" :item-key="item._key" :depth="getDepth(item)">
              <UButton
                v-if="getDepth(item) < maxDepth"
                icon="i-lucide-plus"
                variant="ghost"
                size="xs"
                color="primary"
                :title="t('treeEditor.addChild')"
                @click="addChild(originalIndex(index))"
              />
              <UButton
                icon="i-lucide-list-plus"
                variant="ghost"
                size="xs"
                color="primary"
                :title="t('treeEditor.addSibling')"
                @click="addSibling(originalIndex(index))"
              />
              <UButton
                icon="i-lucide-trash-2"
                variant="ghost"
                size="xs"
                color="error"
                :title="t('treeEditor.delete')"
                @click="deleteItem(originalIndex(index))"
              />
            </slot>
          </div>
        </div>
      </template>
    </draggable>

    <UButton
      icon="i-lucide-plus"
      color="primary"
      variant="outline"
      size="xs"
      block
      class="mt-1"
      @click="addRoot"
    >
      {{ t('treeEditor.addRoot') }}
    </UButton>
  </div>
</template>

<script setup lang="ts">
/**
 * Reusable tree editor — drag-and-drop multi-level sorting.
 *
 * Expects a flat array of items with `_key` field for identity.
 * Provides slots for custom item rendering and actions.
 * Handles collapse/expand, drag-and-drop, add/delete nodes.
 */
import draggable from 'vuedraggable'

const { t } = useI18n()

interface TreeItem {
  _key: string
  [key: string]: any
}

const props = withDefaults(defineProps<{
  modelValue: TreeItem[]
  maxDepth?: number
  getLabel?: (item: TreeItem) => string
  getDepth?: (item: TreeItem) => number
  collapsedKeys?: Set<string>
}>(), {
  maxDepth: 3,
  getLabel: (item: TreeItem) => item.label ?? '',
  getDepth: (item: TreeItem) => item.depth ?? 0,
})

const emit = defineEmits<{
  'update:modelValue': [items: TreeItem[]]
  'update:collapsedKeys': [keys: Set<string>]
  'addRoot': []
  'addSibling': [index: number]
  'addChild': [index: number]
  'delete': [index: number]
}>()

const localCollapsed = ref(new Set<string>())
const collapsedKeys = computed({
  get: () => props.collapsedKeys ?? localCollapsed.value,
  set: (v) => {
    if (props.collapsedKeys) {
      emit('update:collapsedKeys', v)
    } else {
      localCollapsed.value = v
    }
  },
})

function hasChildren(key: string): boolean {
  const items = props.modelValue
  const idx = items.findIndex(i => i._key === key)
  if (idx === -1 || idx >= items.length - 1) return false
  return props.getDepth(items[idx + 1]) > props.getDepth(items[idx])
}

function getBlockEnd(list: TreeItem[], startIdx: number): number {
  const depth = props.getDepth(list[startIdx])
  let end = startIdx
  for (let i = startIdx + 1; i < list.length; i++) {
    if (props.getDepth(list[i]) <= depth) break
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
  const result: TreeItem[] = []
  const ancestors: TreeItem[] = []
  for (const item of props.modelValue) {
    while (ancestors.length > 0 && props.getDepth(ancestors[ancestors.length - 1]) >= props.getDepth(item)) {
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
  return props.modelValue.findIndex(i => i._key === v._key)
}

// Drag-and-drop
let dragTargetKey: string | null = null
let lastMoveInfo: { relatedKey: string; willInsertAfter: boolean } | null = null

function checkMove(evt: any): boolean {
  const dragged = evt.draggedContext?.element as TreeItem | undefined
  const related = evt.relatedContext?.element as TreeItem | undefined
  if (!dragged || !related) return false
  if (props.getDepth(dragged) !== props.getDepth(related)) return false
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

function onVisibleUpdate(newVisible: TreeItem[]) {
  const old = props.modelValue
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
      emit('update:modelValue', rest.slice(0, insertAt).concat(block, rest.slice(insertAt)))
      return
    }
  }
  emit('update:modelValue', [...old])
}

function onDragEnd() {
  dragTargetKey = null
  lastMoveInfo = null
}

// CRUD — emit events for parent to handle
function addSibling(index: number) { emit('addSibling', index) }
function addChild(index: number) { emit('addChild', index) }
function deleteItem(index: number) { emit('delete', index) }
function addRoot() { emit('addRoot') }
</script>

<style scoped>
:deep(.ghost) {
  opacity: 0.5;
  background: var(--ui-bg-elevated);
}
</style>
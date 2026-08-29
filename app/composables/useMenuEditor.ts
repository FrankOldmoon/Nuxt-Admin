import type { DashboardMenuItem } from '~/types/dashboard'

/** Internal flat tree node for the editor */
export interface MenuFlatNode {
  _key: string
  /** URL path — /dashboard/<table> for CRUD, or any custom URL */
  url: string
  label: string
  icon: string
  hidden: boolean
  depth: number
  parentId: string | null
}

let keyCounter = 0
function genKey(): string {
  return 'm-' + keyCounter++
}

export function flatFromMenu(items: DashboardMenuItem[]): MenuFlatNode[] {
  const result: MenuFlatNode[] = []
  const parentStack: string[] = []

  for (const item of items) {
    const depth = item.parentId == null ? 0 : (parentStack.indexOf(item.parentId) + 1)
    while (parentStack.length > depth) parentStack.pop()
    const url = item.url || (item.table ? `/dashboard/${item.table}` : '')
    const node: MenuFlatNode = {
      _key: genKey(),
      url,
      label: item.label,
      icon: item.icon || 'i-lucide-circle-dashed',
      hidden: !!item.hidden,
      depth,
      parentId: item.parentId ?? null,
    }
    parentStack[depth] = node._key
    result.push(node)
  }

  return result
}

export function menuFromFlat(nodes: MenuFlatNode[]): DashboardMenuItem[] {
  const result: DashboardMenuItem[] = []
  const idMap = new Map<string, string>()
  let idx = 0

  for (const node of nodes) {
    const id = 'id-' + idx++
    idMap.set(node._key, id)
    // If URL starts with /dashboard/, extract the table name; otherwise use URL as-is
    const match = node.url.match(/^\/dashboard\/(.+)/)
    const table = match ? match[1] : node.url
    result.push({
      table,
      url: node.url || undefined,
      label: node.label,
      icon: node.icon,
      hidden: node.hidden,
      order: (idx) * 10,
      parentId: node.parentId ? idMap.get(node.parentId) ?? null : null,
    })
  }

  return result
}

export function useMenuEditor(
  menu: Ref<DashboardMenuItem[]>,
  availableTables: Ref<Array<{ table: string; label: string; icon: string }>>,
  onSave: (items: DashboardMenuItem[]) => Promise<void>
) {
  const flatItems = ref<MenuFlatNode[]>([])
  const collapsedKeys = ref(new Set<string>())
  const editingIndex = ref<number | null>(null)
  const editModalOpen = ref(false)
  const editForm = ref<MenuFlatNode>({ _key: '', url: '', label: '', icon: '', hidden: false, depth: 0, parentId: null })

  // Initialize from menu data
  watch(menu, (items) => {
    flatItems.value = flatFromMenu(items)
  }, { immediate: true })

  // Tree helpers
  function hasChildren(key: string): boolean {
    const idx = flatItems.value.findIndex(i => i._key === key)
    if (idx === -1 || idx >= flatItems.value.length - 1) return false
    return flatItems.value[idx + 1].depth > flatItems.value[idx].depth
  }

  function getBlockEnd(list: MenuFlatNode[], startIdx: number): number {
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
    const result: MenuFlatNode[] = []
    const ancestors: MenuFlatNode[] = []
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
    const dragged = evt.draggedContext?.element as MenuFlatNode | undefined
    const related = evt.relatedContext?.element as MenuFlatNode | undefined
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

  function onVisibleUpdate(newVisible: MenuFlatNode[]) {
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
  function createNode(depth: number, parentKey: string | null): MenuFlatNode {
    return {
      _key: genKey(),
      url: '',
      label: '',
      icon: 'i-lucide-circle-dashed',
      hidden: false,
      depth,
      parentId: parentKey,
    }
  }

  function addRoot() {
    flatItems.value = [...flatItems.value, createNode(0, null)]
  }

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
    newItems.splice(blockEnd + 1, 0, createNode(node.depth + 1, node._key))
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
  function openEdit(index: number) {
    const item = flatItems.value[index]
    if (!item) return
    editingIndex.value = index
    editForm.value = { ...item }
    editModalOpen.value = true
  }

  function saveEdit() {
    if (editingIndex.value == null) return
    const idx = flatItems.value.findIndex(i => i._key === editForm.value._key)
    if (idx !== -1) {
      const newItems = [...flatItems.value]
      newItems[idx] = { ...editForm.value }
      flatItems.value = newItems
    }
    editModalOpen.value = false
    editingIndex.value = null
  }

  // Save
  async function save() {
    const toSave = menuFromFlat(flatItems.value)
    await onSave(toSave)
  }

  return {
    flatItems, visibleItems, collapsedKeys,
    editModalOpen, editForm, editingIndex,
    hasChildren, toggleCollapse, originalIndex,
    checkMove, onDragStart, onVisibleUpdate, onDragEnd,
    addRoot, addSibling, addChild, deleteItem,
    openEdit, saveEdit, save,
  }
}
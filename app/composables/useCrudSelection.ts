/**
 * Generic selection state manager for CRUD tables.
 *
 * Supports both numeric ids and string ids (e.g. uuid):
 *   const sel = useCrudSelection()               // number id (default)
 *   const sel = useCrudSelection<string>()       // uuid string id
 *
 * Usage:
 *   const { selectedIds, toggleItem, toggleAll, isSelected, hasSelection, selectedCount, isAllSelected, isSomeSelected, clear } = useCrudSelection()
 */
export function useCrudSelection<T extends string | number = number>() {
  // Cast to Ref<T[]>: bypass Vue's UnwrapRef inference for the generic T (string|number needs no deep unwrap)
  const selectedIds = ref<T[]>([]) as Ref<T[]>

  function toggleItem(id: T) {
    if (selectedIds.value.includes(id)) {
      selectedIds.value = selectedIds.value.filter(i => i !== id)
    } else {
      selectedIds.value = [...selectedIds.value, id]
    }
  }

  function toggleAll(items: { id: T }[]) {
    if (items.length === 0) return
    if (isAllSelected(items)) {
      const ids = new Set<T>(items.map(i => i.id))
      selectedIds.value = selectedIds.value.filter(id => !ids.has(id))
    } else {
      const merged = new Set<T>([...selectedIds.value, ...items.map(i => i.id)])
      selectedIds.value = [...merged]
    }
  }

  function isSelected(id: T): boolean {
    return selectedIds.value.includes(id)
  }

  function isAllSelected(items: { id: T }[]): boolean {
    return items.length > 0 && items.every(i => selectedIds.value.includes(i.id))
  }

  function isSomeSelected(items: { id: T }[]): boolean {
    return items.some(i => selectedIds.value.includes(i.id)) && !isAllSelected(items)
  }

  function clear() {
    selectedIds.value = []
  }

  const hasSelection = computed(() => selectedIds.value.length > 0)
  const selectedCount = computed(() => selectedIds.value.length)

  return {
    selectedIds,
    toggleItem,
    toggleAll,
    isSelected,
    isAllSelected,
    isSomeSelected,
    hasSelection,
    selectedCount,
    clear
  }
}

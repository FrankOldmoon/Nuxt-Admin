import { describe, it, expect } from 'vitest'
import { useCrudSelection } from '../../app/composables/useCrudSelection'

const items = [{ id: 1 }, { id: 2 }, { id: 3 }]

describe('useCrudSelection', () => {
  it('has no selection initially', () => {
    const s = useCrudSelection()
    expect(s.selectedIds.value).toEqual([])
    expect(s.hasSelection.value).toBe(false)
    expect(s.selectedCount.value).toBe(0)
    expect(s.isAllSelected(items)).toBe(false)
    expect(s.isSomeSelected(items)).toBe(false)
  })

  it('toggleItem selects/deselects one at a time', () => {
    const s = useCrudSelection()
    s.toggleItem(1)
    expect(s.isSelected(1)).toBe(true)
    expect(s.hasSelection.value).toBe(true)
    s.toggleItem(1)
    expect(s.isSelected(1)).toBe(false)
    expect(s.selectedCount.value).toBe(0)
  })

  it('toggleAll selects all, and a second call deselects the current page', () => {
    const s = useCrudSelection()
    s.toggleAll(items)
    expect(s.isAllSelected(items)).toBe(true)
    expect(s.selectedCount.value).toBe(3)
    s.toggleAll(items)
    expect(s.selectedIds.value).toEqual([])
  })

  it('toggleAll with an empty array does not change state', () => {
    const s = useCrudSelection()
    s.toggleItem(9)
    s.toggleAll([])
    expect(s.selectedIds.value).toEqual([9])
  })

  it('isSomeSelected is true when partially selected', () => {
    const s = useCrudSelection()
    s.toggleItem(1)
    expect(s.isSomeSelected(items)).toBe(true)
    expect(s.isAllSelected(items)).toBe(false)
  })

  it('clear resets the selection', () => {
    const s = useCrudSelection()
    s.toggleAll(items)
    s.clear()
    expect(s.selectedIds.value).toEqual([])
    expect(s.hasSelection.value).toBe(false)
  })
})
import { describe, it, expect } from 'vitest'
import { flatFromMenu, menuFromFlat } from '../../../app/composables/useMenuEditor'
import type { DashboardMenuItem } from '../../../app/types/dashboard'

describe('flatFromMenu', () => {
  it('converts flat menu items to flat nodes with depth', () => {
    const menu: DashboardMenuItem[] = [
      { table: 'users', label: 'Users', icon: 'i-lucide-users', order: 10 },
      { table: 'roles', label: 'Roles', icon: 'i-lucide-shield', order: 20 }
    ]
    const nodes = flatFromMenu(menu)
    expect(nodes).toHaveLength(2)
    expect(nodes[0].url).toBe('/dashboard/users')
    expect(nodes[0].depth).toBe(0)
    expect(nodes[0].parentId).toBeNull()
    expect(nodes[1].url).toBe('/dashboard/roles')
    expect(nodes[1].depth).toBe(0)
  })

  it('uses url field when present instead of constructing from table', () => {
    const menu: DashboardMenuItem[] = [
      { table: 'users', label: 'Users', icon: 'i-lucide-users', order: 10, url: '/custom/users' }
    ]
    const nodes = flatFromMenu(menu)
    expect(nodes[0].url).toBe('/custom/users')
  })

  it('handles parentId for hierarchical menu', () => {
    const menu: DashboardMenuItem[] = [
      { table: 'settings', label: 'Settings', icon: 'i-lucide-settings', order: 10 },
      { table: 'site', label: 'Site', icon: 'i-lucide-globe', order: 20, parentId: 'id-0' }
    ]
    const nodes = flatFromMenu(menu)
    expect(nodes[0].depth).toBe(0)
    expect(nodes[1].depth).toBe(0) // parentId is string-based, not yet mapped to internal keys
  })

  it('handles empty menu', () => {
    expect(flatFromMenu([])).toHaveLength(0)
  })
})

describe('menuFromFlat', () => {
  it('converts flat nodes back to menu items', () => {
    const nodes = flatFromMenu([
      { table: 'users', label: 'Users', icon: 'i-lucide-users', order: 10 },
      { table: 'roles', label: 'Roles', icon: 'i-lucide-shield', order: 20 }
    ])
    const items = menuFromFlat(nodes)
    expect(items).toHaveLength(2)
    expect(items[0].table).toBe('users')
    expect(items[0].label).toBe('Users')
    expect(items[0].url).toBe('/dashboard/users')
    expect(items[0].order).toBe(10)
    expect(items[0].parentId).toBeNull()
    expect(items[1].table).toBe('roles')
  })

  it('preserves custom URLs', () => {
    const nodes = flatFromMenu([
      { table: 'custom', label: 'Custom', icon: 'i-lucide-link', order: 10, url: 'https://example.com' }
    ])
    const items = menuFromFlat(nodes)
    expect(items[0].table).toBe('https://example.com')
    expect(items[0].url).toBe('https://example.com')
  })

  it('handles empty nodes', () => {
    expect(menuFromFlat([])).toHaveLength(0)
  })
})
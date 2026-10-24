import { describe, expect, it } from 'vitest'
import { TOOLS, toolAvailableIn, toolRegionScope, toolRegions } from '../../../../modules/tools/shared/tools.manifest'
import { detectToolRegion, isCardVisibleInRegion, isMainlandTimezone } from '../../../../modules/tools/server/utils/region'

describe('detectToolRegion', () => {
  it('honours an explicit override', () => {
    expect(detectToolRegion({ forced: 'cn' })).toBe('cn')
    expect(detectToolRegion({ forced: 'GLOBAL' })).toBe('global')
    expect(detectToolRegion({ forced: 'auto', timezone: 'Asia/Shanghai' })).toBe('cn')
  })

  it('uses the server timezone when auto-detecting', () => {
    expect(isMainlandTimezone('Asia/Shanghai')).toBe(true)
    expect(isMainlandTimezone('Asia/Urumqi')).toBe(true)
    expect(isMainlandTimezone('Asia/Hong_Kong')).toBe(false)
    expect(detectToolRegion({ timezone: 'Asia/Shanghai' })).toBe('cn')
    expect(detectToolRegion({ timezone: 'UTC' })).toBe('global')
    expect(detectToolRegion({ timezone: 'America/New_York' })).toBe('global')
  })
})

describe('isCardVisibleInRegion', () => {
  it('shows every card tagged all, only the matching card otherwise', () => {
    expect(isCardVisibleInRegion('all', 'cn')).toBe(true)
    expect(isCardVisibleInRegion('all', 'global')).toBe(true)
    expect(isCardVisibleInRegion('cn', 'cn')).toBe(true)
    expect(isCardVisibleInRegion('cn', 'global')).toBe(false)
    expect(isCardVisibleInRegion('global', 'cn')).toBe(false)
    expect(isCardVisibleInRegion('global', 'global')).toBe(true)
  })
})

describe('tool region metadata', () => {
  it('marks the China-only downloaders', () => {
    for (const id of ['bili', 'xhs', 'music']) {
      const tool = TOOLS.find(item => item.id === id)!
      expect(toolRegionScope(tool)).toBe('cn')
      expect(toolAvailableIn(tool, 'cn')).toBe(true)
      expect(toolAvailableIn(tool, 'global')).toBe(false)
    }
  })

  it('keeps browser-local tools available in both versions', () => {
    const tool = TOOLS.find(item => item.id === 'pdf-organize')!
    expect(toolRegionScope(tool)).toBe('all')
    expect(toolAvailableIn(tool, 'cn')).toBe(true)
    expect(toolAvailableIn(tool, 'global')).toBe(true)
  })

  it('supports global-only cards for future tools', () => {
    const globalOnly = { ...TOOLS[0]!, regions: ['global' as const] }
    expect(toolRegionScope(globalOnly)).toBe('global')
    expect(toolAvailableIn(globalOnly, 'global')).toBe(true)
    expect(toolAvailableIn(globalOnly, 'cn')).toBe(false)
  })

  it('ships the international edition extras as global-only', () => {
    for (const id of ['youtube', 'citation', 'readability']) {
      const tool = TOOLS.find(item => item.id === id)!
      expect(tool).toBeDefined()
      expect(toolRegionScope(tool)).toBe('global')
      expect(toolAvailableIn(tool, 'cn')).toBe(false)
    }
  })

  it('keeps every resource card external and pinned to one edition', () => {
    const resources = TOOLS.filter(tool => tool.group === 'resources')
    expect(resources.length).toBeGreaterThan(20)
    for (const tool of resources) {
      expect(tool.runtime).toBe('external')
      expect(tool.externalHref).toMatch(/^https:\/\//)
      expect(tool.regions).toHaveLength(1)
      expect(toolRegions(tool)).toHaveLength(1)
    }
    expect(resources.some(tool => tool.regions?.[0] === 'cn')).toBe(true)
    expect(resources.some(tool => tool.regions?.[0] === 'global')).toBe(true)
  })

  it('marks the new classroom kit tools for the right editions', () => {
    const universal = ['seat-chart', 'scoreboard', 'noise-meter', 'wheel-spinner', 'buzz-in', 'scroll-text', 'latex-editor', 'report-comments']
    for (const id of universal) {
      expect(toolAvailableIn(TOOLS.find(tool => tool.id === id)!, 'cn')).toBe(true)
      expect(toolAvailableIn(TOOLS.find(tool => tool.id === id)!, 'global')).toBe(true)
    }
    for (const id of ['multiplication-table', 'exam-countdown', 'hanzi-copybook']) {
      expect(toolAvailableIn(TOOLS.find(tool => tool.id === id)!, 'cn')).toBe(true)
      expect(toolAvailableIn(TOOLS.find(tool => tool.id === id)!, 'global')).toBe(false)
    }
    for (const id of ['voice-level', 'word-search', 'bingo-cards']) {
      expect(toolAvailableIn(TOOLS.find(tool => tool.id === id)!, 'global')).toBe(true)
      expect(toolAvailableIn(TOOLS.find(tool => tool.id === id)!, 'cn')).toBe(false)
    }
  })
})

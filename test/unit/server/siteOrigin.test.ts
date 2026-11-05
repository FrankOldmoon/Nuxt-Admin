import { describe, expect, it } from 'vitest'
import { resolveSiteOriginValue } from '../../../server/utils/siteOrigin'

describe('resolveSiteOriginValue', () => {
  it('prefers a configured canonical origin and removes trailing slashes', () => {
    expect(resolveSiteOriginValue('https://workbao.cn/', 'https://tools.yunshuling.com'))
      .toBe('https://workbao.cn')
  })

  it('trims whitespace around the configured origin', () => {
    expect(resolveSiteOriginValue('  http://localhost:3000///  ', 'https://fallback.example'))
      .toBe('http://localhost:3000')
  })

  it('falls back when the configured value is blank', () => {
    expect(resolveSiteOriginValue('   ', 'https://fallback.example/'))
      .toBe('https://fallback.example')
  })

  it('falls back when the configured value is not an absolute http(s) origin', () => {
    expect(resolveSiteOriginValue('workbao.cn', 'https://fallback.example'))
      .toBe('https://fallback.example')
  })
})

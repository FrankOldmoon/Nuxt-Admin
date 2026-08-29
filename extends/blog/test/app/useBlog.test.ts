import { describe, it, expect } from 'vitest'
import { blogReadingTime, formatBlogDate, resolveBlogCover } from '../../app/composables/useBlog'

describe('blogReadingTime', () => {
  it('returns 1 for empty/null/undefined content', () => {
    expect(blogReadingTime('')).toBe(1)
    expect(blogReadingTime('   ')).toBe(1)
    expect(blogReadingTime(null)).toBe(1)
    expect(blogReadingTime(undefined)).toBe(1)
  })

  it('estimates ~250 words per minute for CJK text', () => {
    // ~500 CJK chars → ~125 words → 1 min
    const text = '文'.repeat(500)
    expect(blogReadingTime(text)).toBe(1)
    // ~1000 CJK chars → ~250 words → 1 min
    const text2 = '文'.repeat(1000)
    expect(blogReadingTime(text2)).toBe(1)
    // ~1500 CJK chars → ~375 words → 2 min
    const text3 = '文'.repeat(1500)
    expect(blogReadingTime(text3)).toBe(2)
  })
})

describe('formatBlogDate', () => {
  it('returns empty string for null/undefined', () => {
    expect(formatBlogDate(null)).toBe('')
    expect(formatBlogDate('')).toBe('')
  })

  it('formats a valid ISO date string', () => {
    const result = formatBlogDate('2026-03-15T00:00:00.000Z')
    expect(result).toMatch(/Mar 15, 2026/i)
  })
})

describe('resolveBlogCover', () => {
  it('passes through external URLs', () => {
    expect(resolveBlogCover('post-1', 'https://example.com/img.png', 800, 400))
      .toBe('https://example.com/img.png')
    expect(resolveBlogCover('post-1', '/images/cover.jpg', 800, 400))
      .toBe('/images/cover.jpg')
    expect(resolveBlogCover('post-1', 'data:image/png;base64,abc', 800, 400))
      .toBe('data:image/png;base64,abc')
  })

  it('resolves uploaded file paths', () => {
    expect(resolveBlogCover('post-1', 'abc123/path/to/img.webp', 800, 400))
      .toBe('/api/files/serve/abc123/path/to/img.webp')
  })

  it('falls back to picsum placeholder when no value', () => {
    expect(resolveBlogCover('my-post', null, 800, 400))
      .toBe('https://picsum.photos/seed/my-post/800/400')
    expect(resolveBlogCover('my-post', undefined, 800, 400))
      .toBe('https://picsum.photos/seed/my-post/800/400')
    expect(resolveBlogCover('my-post', '', 800, 400))
      .toBe('https://picsum.photos/seed/my-post/800/400')
  })
})
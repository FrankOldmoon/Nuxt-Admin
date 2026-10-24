import { describe, expect, it } from 'vitest'
import { normalizeYouTubeInput } from '../../../../modules/tools/server/utils/downloader/engines/youtube'

describe('normalizeYouTubeInput', () => {
  it('accepts a bare 11-character video id', () => {
    expect(normalizeYouTubeInput('dQw4w9WgXcQ')).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ')
  })

  it('normalizes watch, shorts and live links', () => {
    expect(normalizeYouTubeInput('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s&si=tracking')).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=30s'
    )
    expect(normalizeYouTubeInput('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    )
    expect(normalizeYouTubeInput('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
    )
  })

  it('keeps a playlist id from youtu.be links', () => {
    expect(normalizeYouTubeInput('https://youtu.be/dQw4w9WgXcQ?list=PL1234567890')).toBe(
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PL1234567890'
    )
  })

  it('rejects other hosts and malformed values', () => {
    expect(normalizeYouTubeInput('https://vimeo.com/12345')).toBeNull()
    expect(normalizeYouTubeInput('https://www.youtube.com/feed/subscriptions')).toBeNull()
    expect(normalizeYouTubeInput('')).toBeNull()
    expect(normalizeYouTubeInput('not a link')).toBeNull()
  })
})

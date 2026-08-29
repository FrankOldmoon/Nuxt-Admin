import { describe, it, expect } from 'vitest'
import { formatBytes, shortHash, isAuthError, formatTime, waitFor } from '../../../app/utils/index'

describe('formatBytes', () => {
  it('0 bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
  })

  it('B / KB / MB / GB conversion', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024)).toBe('1 KB')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(formatBytes(1024 * 1024)).toBe('1 MB')
    expect(formatBytes(1024 * 1024 * 1024)).toBe('1 GB')
  })
})

describe('shortHash', () => {
  it('truncates long hashes to 8...4', () => {
    const h = 'a'.repeat(64)
    expect(shortHash(h)).toBe(`${'a'.repeat(8)}…${'a'.repeat(4)}`)
    expect(shortHash(h)).toHaveLength(13)
  })

  it('returns short strings unchanged', () => {
    expect(shortHash('abc')).toBe('abc')
    expect(shortHash('123456')).toBe('123456')
  })
})

describe('isAuthError', () => {
  it('classifies a payload with statusCode and message as an auth error', () => {
    expect(isAuthError({ statusCode: 401, statusMessage: 'Unauthorized', message: 'x' })).toBe(true)
  })

  it('missing fields are not an auth error', () => {
    expect(isAuthError({ statusCode: 401 })).toBe(false)
    expect(isAuthError({ message: 'x' })).toBe(false)
    expect(isAuthError(null)).toBe(false)
    expect(isAuthError('x')).toBe(false)
  })
})

describe('formatTime', () => {
  it('converts a timestamp to a local string', () => {
    const ts = new Date('2026-01-01T00:00:00').getTime()
    expect(formatTime(ts)).toBe(new Date(ts).toLocaleString())
  })
})

describe('waitFor', () => {
  it('resolves after the given number of milliseconds', async () => {
    const start = Date.now()
    await waitFor(20)
    expect(Date.now() - start).toBeGreaterThanOrEqual(15)
  })
})
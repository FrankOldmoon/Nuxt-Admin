import { describe, it, expect } from 'vitest'
import { extractErrorMessage, isApiAuthError } from '../../../app/utils/network'

describe('extractErrorMessage', () => {
  it('prefers data.message', () => {
    expect(extractErrorMessage({ data: { message: 'inner msg' }, message: 'outer' })).toBe('inner msg')
  })

  it('falls back to the top-level message', () => {
    expect(extractErrorMessage({ message: 'top msg' })).toBe('top msg')
  })

  it('falls back to statusMessage', () => {
    expect(extractErrorMessage({ statusMessage: 'Not Found' })).toBe('Not Found')
  })

  it('uses the default fallback when no info is available', () => {
    expect(extractErrorMessage('boom')).toBe('Request failed')
    expect(extractErrorMessage(null)).toBe('Request failed')
    expect(extractErrorMessage({})).toBe('Request failed')
  })

  it('accepts a custom fallback', () => {
    expect(extractErrorMessage('boom', 'fallback')).toBe('fallback')
  })

  it('converts numbers/strings to string as-is', () => {
    expect(extractErrorMessage({ message: 12345 })).toBe('12345')
  })
})

describe('isApiAuthError', () => {
  it('treats 401 and 403 as auth errors', () => {
    expect(isApiAuthError({ statusCode: 401 })).toBe(true)
    expect(isApiAuthError({ statusCode: 403 })).toBe(true)
  })

  it('other status codes are not auth errors', () => {
    expect(isApiAuthError({ statusCode: 500 })).toBe(false)
    expect(isApiAuthError({ statusCode: 404 })).toBe(false)
  })

  it('non-object inputs return false', () => {
    expect(isApiAuthError(null)).toBe(false)
    expect(isApiAuthError('error')).toBe(false)
    expect(isApiAuthError(undefined)).toBe(false)
  })
})
import { describe, expect, it } from 'vitest'
import { isOriginAllowed } from '../../../server/utils/originPolicy'

describe('origin policy', () => {
  it('allows requests without an Origin header', () => {
    expect(isOriginAllowed({ host: 'localhost:3000', protocol: 'http' })).toBe(true)
  })

  it('allows the same host and rejects cross-site origins', () => {
    const base = { host: 'localhost:3000', protocol: 'http' }
    expect(isOriginAllowed({ ...base, origin: 'http://localhost:3000' })).toBe(true)
    expect(isOriginAllowed({ ...base, origin: 'https://evil.example' })).toBe(false)
  })

  it('honours the configured canonical site URL', () => {
    expect(isOriginAllowed({
      origin: 'https://app.example.com',
      host: 'internal:3000',
      protocol: 'http',
      siteUrl: 'https://app.example.com'
    })).toBe(true)
  })

  it('rejects malformed origins', () => {
    expect(isOriginAllowed({ origin: 'not-a-url', host: 'localhost:3000' })).toBe(false)
  })
})

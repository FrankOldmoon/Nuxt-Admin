import { describe, it, expect, vi } from 'vitest'
import { setSessionCookie, clearSessionCookie, readSessionToken, SESSION_COOKIE_NAME } from '../../../server/utils/session'

const { setCookie, deleteCookie, getCookie } = vi.hoisted(() => ({
  setCookie: vi.fn(),
  deleteCookie: vi.fn(),
  getCookie: vi.fn()
}))
vi.stubGlobal('setCookie', setCookie)
vi.stubGlobal('deleteCookie', deleteCookie)
vi.stubGlobal('getCookie', getCookie)

/**
 * Minimal H3Event stand-in. `setSessionCookie` calls h3's
 * `getRequestProtocol`, which reads `event.node.req.headers`, so an empty
 * object is not enough.
 */
function fakeEvent(headers: Record<string, string> = {}): never {
  return { node: { req: { headers, connection: {} } } } as never
}

describe('setSessionCookie', () => {
  it('writes the httpOnly + lax session cookie', () => {
    const event = fakeEvent()
    setSessionCookie(event, 'tok123')
    expect(setCookie).toHaveBeenCalledWith(event, 'session', 'tok123', {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: 60 * 60 * 24 * 7
    })
  })

  it('sets Secure only when the request arrived over HTTPS', () => {
    const event = fakeEvent({ 'x-forwarded-proto': 'https' })
    setSessionCookie(event, 'tok123')
    expect(setCookie).toHaveBeenLastCalledWith(event, 'session', 'tok123', expect.objectContaining({ secure: true }))
  })
})

describe('clearSessionCookie', () => {
  it('deletes the session cookie', () => {
    const event = fakeEvent()
    clearSessionCookie(event)
    expect(deleteCookie).toHaveBeenCalledWith(event, 'session', { path: '/' })
  })
})

describe('readSessionToken', () => {
  it('reads the token from the cookie', () => {
    const event = fakeEvent()
    getCookie.mockReturnValue('tok')
    expect(readSessionToken(event)).toBe('tok')
    expect(getCookie).toHaveBeenCalledWith(event, 'session')
  })
})

it('SESSION_COOKIE_NAME is "session"', () => {
  expect(SESSION_COOKIE_NAME).toBe('session')
})

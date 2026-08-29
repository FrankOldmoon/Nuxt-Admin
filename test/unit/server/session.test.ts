import { describe, it, expect, vi } from 'vitest'

const { setCookie, deleteCookie, getCookie } = vi.hoisted(() => ({
  setCookie: vi.fn(),
  deleteCookie: vi.fn(),
  getCookie: vi.fn()
}))
vi.stubGlobal('setCookie', setCookie)
vi.stubGlobal('deleteCookie', deleteCookie)
vi.stubGlobal('getCookie', getCookie)

import { setSessionCookie, clearSessionCookie, readSessionToken, SESSION_COOKIE_NAME } from '../../../server/utils/session'

describe('setSessionCookie', () => {
  it('writes the httpOnly + lax session cookie', () => {
    const event = {} as never
    setSessionCookie(event, 'tok123')
    expect(setCookie).toHaveBeenCalledWith(event, 'session', 'tok123', {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      path: '/',
      maxAge: 60 * 60 * 24 * 7
    })
  })
})

describe('clearSessionCookie', () => {
  it('deletes the session cookie', () => {
    const event = {} as never
    clearSessionCookie(event)
    expect(deleteCookie).toHaveBeenCalledWith(event, 'session', { path: '/' })
  })
})

describe('readSessionToken', () => {
  it('reads the token from the cookie', () => {
    getCookie.mockReturnValue('tok')
    expect(readSessionToken({} as never)).toBe('tok')
    expect(getCookie).toHaveBeenCalledWith({}, 'session')
  })
})

it('SESSION_COOKIE_NAME is "session"', () => {
  expect(SESSION_COOKIE_NAME).toBe('session')
})
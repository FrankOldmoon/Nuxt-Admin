import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

const { stateMap, mockFetch, mockNavigate } = vi.hoisted(() => ({
  stateMap: new Map<string, { value: unknown }>(),
  mockFetch: vi.fn(),
  mockNavigate: vi.fn()
}))

mockNuxtImport('useState', () => (key: string, init?: unknown) => {
  if (!stateMap.has(key)) {
    stateMap.set(key, ref(typeof init === 'function' ? (init as () => unknown)() : init))
  }
  return stateMap.get(key)!
})
mockNuxtImport('useRequestFetch', () => () => mockFetch)
mockNuxtImport('$fetch', () => mockFetch)
mockNuxtImport('navigateTo', () => mockNavigate)

import { useAuth } from '~/composables/useAuth'

const adminUser = {
  id: 1, username: 'admin', email: 'admin@example.com', name: null, telephone: null,
  avatarPath: null, isActive: true, role: { id: 1, name: 'admin', description: null },
  emailVerifiedAt: null, gender: null, birthday: null, lastLoginAt: null, lastLoginIp: null,
  deletedAt: null, createdAt: '2026-01-01', updatedAt: '2026-01-01'
}
const normalUser = { ...adminUser, id: 2, username: 'bob', role: { id: 2, name: 'user', description: null } }

describe('useAuth', () => {
  beforeEach(() => {
    mockFetch.mockReset()
    mockNavigate.mockReset()
    const user = stateMap.get('auth:user')
    if (user) user.value = null
    const loading = stateMap.get('auth:loading')
    if (loading) loading.value = false
  })

  it('is logged out initially', () => {
    const auth = useAuth()
    expect(auth.user.value).toBeNull()
    expect(auth.isLoggedIn.value).toBe(false)
    expect(auth.isAdmin.value).toBe(false)
  })

  it('login sets the user on success', async () => {
    mockFetch.mockResolvedValue({ user: adminUser })
    const auth = useAuth()
    const u = await auth.login('admin', 'Admin@123')
    expect(u.id).toBe(1)
    expect(auth.user.value?.username).toBe('admin')
    expect(auth.isLoggedIn.value).toBe(true)
    expect(auth.isAdmin.value).toBe(true)
    expect(mockFetch).toHaveBeenCalledWith('/api/auth/login', { method: 'POST', body: { identifier: 'admin', password: 'Admin@123' } })
  })

  it('login throws and resets loading on failure', async () => {
    mockFetch.mockRejectedValue(new Error('bad'))
    const auth = useAuth()
    await expect(auth.login('x', 'y')).rejects.toThrow('bad')
    expect(auth.loading.value).toBe(false)
  })

  it('register calls the register endpoint', async () => {
    mockFetch.mockResolvedValue({ user: normalUser })
    const auth = useAuth()
    await auth.register('bob', 'bob@example.com', 'Password1')
    expect(mockFetch).toHaveBeenCalledWith('/api/auth/register', {
      method: 'POST',
      body: { username: 'bob', email: 'bob@example.com', password: 'Password1' }
    })
  })

  it('logout clears the user and navigates home', async () => {
    mockFetch.mockResolvedValue({ ok: true })
    const auth = useAuth()
    auth.user.value = adminUser
    await auth.logout()
    expect(mockFetch).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' })
    expect(auth.user.value).toBeNull()
    expect(mockNavigate).toHaveBeenCalledWith('/')
  })

  it('forgotPassword returns the dev token', async () => {
    mockFetch.mockResolvedValue({ devToken: 'tok', devResetUrl: 'http://x/reset' })
    const auth = useAuth()
    const res = await auth.forgotPassword('a@example.com')
    expect(res.devToken).toBe('tok')
    expect(mockFetch).toHaveBeenCalledWith('/api/auth/forgot-password', {
      method: 'POST',
      body: { email: 'a@example.com' }
    })
  })

  it('resetPassword sets the user', async () => {
    mockFetch.mockResolvedValue({ user: adminUser })
    const auth = useAuth()
    const u = await auth.resetPassword('tok', 'NewPass1')
    expect(u?.username).toBe('admin')
  })

  it('fetchUser fetches the user successfully (via useRequestFetch)', async () => {
    mockFetch.mockResolvedValue({ user: adminUser })
    const auth = useAuth()
    const u = await auth.fetchUser()
    expect(u?.id).toBe(1)
    expect((mockFetch.mock.calls[0] as any[])[0]).toBe('/api/auth/me')
  })

  it('fetchUser returns null on failure', async () => {
    mockFetch.mockRejectedValue(new Error('401'))
    const auth = useAuth()
    expect(await auth.fetchUser()).toBeNull()
    expect(auth.user.value).toBeNull()
  })

  it('isAdmin is false for a regular user', () => {
    const auth = useAuth()
    auth.user.value = normalUser
    expect(auth.isAdmin.value).toBe(false)
  })
})
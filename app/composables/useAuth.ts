import type { PublicUser } from '~/types/auth'

export function useAuth() {
  const user = useState<PublicUser | null>('auth:user', () => null)
  const loading = useState<boolean>('auth:loading', () => false)

  const isLoggedIn = computed(() => !!user.value)
  const isAdmin = computed(() => user.value?.role?.name === 'admin')
  // Whether the user has any dashboard access: admin('*') or a non-empty role permissions list
  const canAccessDashboard = computed(() => {
    const perms = user.value?.role?.permissions ?? []
    return isAdmin.value || (Array.isArray(perms) && (perms.includes('*') || perms.length > 0))
  })

  async function fetchUser(): Promise<PublicUser | null> {
    try {
      // cRequest (via useRequestFetch) forwards cookies during SSR so /api/auth/me can read the session
      const data = await cRequest<{ user: PublicUser }>('/api/auth/me')
      user.value = data.user
      if (import.meta.dev) {
        console.log('[auth] session user:', data.user)
      }
      return data.user
    } catch {
      user.value = null
      return null
    }
  }

  async function login(identifier: string, password: string, captchaId?: string, captchaText?: string): Promise<PublicUser> {
    loading.value = true
    try {
      const data = await $fetch<{ user: PublicUser }>('/api/auth/login', {
        method: 'POST',
        body: { identifier, password, captchaId, captchaText }
      })
      user.value = data.user
      return data.user
    } finally {
      loading.value = false
    }
  }

  async function register(username: string, email: string, password: string): Promise<PublicUser> {
    loading.value = true
    try {
      const data = await $fetch<{ user: PublicUser }>('/api/auth/register', {
        method: 'POST',
        body: { username, email, password }
      })
      user.value = data.user
      return data.user
    } finally {
      loading.value = false
    }
  }

  async function logout(): Promise<void> {
    await $fetch('/api/auth/logout', { method: 'POST' })
    user.value = null
    await navigateTo('/')
  }

  async function forgotPassword(email: string): Promise<{ devResetUrl?: string, devToken?: string }> {
    const data = await $fetch<{ devResetUrl?: string, devToken?: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: { email }
    })
    return data
  }

  async function resetPassword(token: string, password: string): Promise<PublicUser | null> {
    const data = await $fetch<{ user: PublicUser | null }>('/api/auth/reset-password', {
      method: 'POST',
      body: { token, password }
    })
    user.value = data.user
    return data.user
  }

  return {
    user,
    loading,
    isLoggedIn,
    isAdmin,
    canAccessDashboard,
    fetchUser,
    login,
    register,
    logout,
    forgotPassword,
    resetPassword
  }
}

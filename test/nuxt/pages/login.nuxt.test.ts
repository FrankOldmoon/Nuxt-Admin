import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { describe, it, expect } from 'vitest'
import { mountSuspended } from '@nuxt/test-utils/runtime'
import LoginPage from '~/pages/login.vue'
import AuthForm from '~/components/auth/form.vue'

mockNuxtImport('useI18n', () => () => ({ t: (k: string) => k }))
mockNuxtImport('useRoute', () => () => ({ query: {} }))
mockNuxtImport('useAuth', () => () => ({
  user: { value: null }, loading: { value: false },
  isLoggedIn: { value: false }, isAdmin: { value: false }, fetchUser: async () => null
}))

describe('login page', () => {
  it('renders a login card containing the login form', async () => {
    const wrapper = await mountSuspended(LoginPage)
    expect(wrapper.findComponent(AuthForm).exists()).toBe(true)
  })

  it('renders the form in login mode', async () => {
    const wrapper = await mountSuspended(LoginPage)
    const form = wrapper.findComponent(AuthForm)
    expect(form.props('mode')).toBe('login')
  })
})
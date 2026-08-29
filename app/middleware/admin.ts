export default defineNuxtRouteMiddleware(async (to) => {
  const { user, isAdmin, canAccessDashboard, fetchUser } = useAuth()

  if (user.value === null) {
    const nuxtApp = useNuxtApp()
    if (!nuxtApp.payload.data.__authChecked) {
      await fetchUser()
      nuxtApp.payload.data.__authChecked = true
    }
  }

  if (!user.value) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }
  // admin has all permissions; other roles must have dashboard access (non-empty permissions)
  if (!isAdmin.value && !canAccessDashboard.value) {
    return navigateTo('/')
  }
})
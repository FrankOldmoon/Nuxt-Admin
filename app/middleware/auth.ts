export default defineNuxtRouteMiddleware(async (to) => {
  const { user, fetchUser } = useAuth()

  // Ensure user is loaded once
  if (user.value === null) {
    // Distinguish "checked" from "not checked"
    const nuxtApp = useNuxtApp()
    if (!nuxtApp.payload.data.__authChecked) {
      await fetchUser()
      nuxtApp.payload.data.__authChecked = true
    }
  }

  if (!user.value) {
    return navigateTo(`/login?redirect=${encodeURIComponent(to.fullPath)}`)
  }
})

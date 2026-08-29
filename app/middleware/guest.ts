// Redirect already-authenticated users away from guest-only pages (login/register/forgot-password)
export default defineNuxtRouteMiddleware(async () => {
  const { user, fetchUser } = useAuth()

  // Ensure auth state is loaded (SSR or client) before checking
  if (user.value === null) {
    const nuxtApp = useNuxtApp()
    if (!nuxtApp.payload.data.__authChecked) {
      await fetchUser()
      nuxtApp.payload.data.__authChecked = true
    }
  }

  if (user.value) {
    return navigateTo('/')
  }
})

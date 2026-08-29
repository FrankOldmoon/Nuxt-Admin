// Redirect already-authenticated users away from guest-only pages (login/register/forgot-password)
export default defineNuxtRouteMiddleware(() => {
  const { user } = useAuth()
  if (user.value) {
    return navigateTo('/')
  }
})

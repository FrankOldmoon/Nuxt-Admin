/**
 * Client-side SPA pageview sync for the analytics scripts injected in app.vue.
 *
 * gtag.js (`gtag('config', …)`) and Baidu Tongji (`hm.js`) only track the initial
 * page load on their own — client-side route changes would be invisible. This
 * plugin forwards every navigation after the first one (the initial load is
 * already counted by the libraries themselves).
 */
export default defineNuxtPlugin(() => {
  const router = useRouter()
  const { trackEvent, trackBaiduPageview } = useAnalytics()

  let firstNavigation = true
  router.afterEach((to, _from, failure) => {
    if (firstNavigation) {
      firstNavigation = false
      return
    }
    // Aborted/redirected navigations must not produce a pageview
    if (failure) return
    trackEvent('page_view', { page_path: to.fullPath, page_title: document.title })
    trackBaiduPageview(to.fullPath)
  })
})

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
    _hmt?: Array<unknown[]>
  }
}

/**
 * Analytics helpers for Google (Analytics / Ads) and Baidu Tongji (百度统计).
 *
 * The scripts themselves are injected in `app/app.vue` from the `analytics.*`
 * public configs — when an ID is empty the corresponding network is disabled
 * and every helper below becomes a no-op.
 */
export function useAnalytics() {
  /** Send a generic gtag event (GA4 event or Google Ads conversion). */
  function trackEvent(name: string, params?: Record<string, unknown>): void {
    if (import.meta.server || typeof window.gtag !== 'function') return
    window.gtag(name, params ?? {})
  }

  /**
   * Fire a Google Ads conversion.
   * @param sendTo `AW-XXXXXXXXX/label` (from Google Ads → Goals → Conversions)
   */
  function trackGoogleAdsConversion(sendTo: string, params?: Record<string, unknown>): void {
    trackEvent('conversion', { send_to: sendTo, ...params })
  }

  /** Push a pageview to Baidu Tongji (useful for SPA client-side navigation). */
  function trackBaiduPageview(path: string): void {
    if (import.meta.server || !Array.isArray(window._hmt)) return
    window._hmt.push(['_trackPageview', path])
  }

  return { trackEvent, trackGoogleAdsConversion, trackBaiduPageview }
}

/**
 * cRequest: an SSR-aware $fetch wrapper.
 *
 * Uses Nuxt's `useRequestFetch` so that server-side rendering forwards the
 * request cookies (e.g. the session token) to the API. On the client it behaves
 * like a normal `$fetch`. Use this instead of raw `$fetch` whenever you need the
 * current user's session during SSR.
 *
 * For initial page data prefer `useFetch` / `useAsyncData` (also SSR-friendly);
 * use `cRequest` for imperative calls (form submits, mutations, refreshes).
 */

// Loose option type to stay compatible with both ofetch and Nuxt's typed $fetch.
type RequestOptions = Record<string, unknown>

export function cRequest<T = unknown>(url: string, options?: RequestOptions): Promise<T> {
  const $fetch = useRequestFetch()
  // Nuxt's typed $fetch infers Nitro route shapes; bypass for generic API calls.
  return ($fetch as unknown as (u: string, o?: RequestOptions) => Promise<T>)(url, options)
}

// --- Convenience verbs ---

export function cGet<T = unknown>(url: string, query?: Record<string, unknown>): Promise<T> {
  return cRequest<T>(url, { method: 'GET', query })
}

export function cPost<T = unknown>(url: string, body?: Record<string, unknown> | null): Promise<T> {
  return cRequest<T>(url, { method: 'POST', body })
}

export function cPut<T = unknown>(url: string, body?: Record<string, unknown> | null): Promise<T> {
  return cRequest<T>(url, { method: 'PUT', body })
}

export function cDelete<T = unknown>(url: string): Promise<T> {
  return cRequest<T>(url, { method: 'DELETE' })
}

// --- Error helpers ---

export interface ApiError {
  statusCode?: number
  statusMessage?: string
  message?: string
  data?: { message?: string }
}

/** Extract a human-readable message from a fetch error, with a fallback. */
export function extractErrorMessage(e: unknown, fallback = 'Request failed'): string {
  if (e && typeof e === 'object') {
    const obj = e as ApiError
    if (obj.data?.message) return String(obj.data.message)
    if (obj.message) return String(obj.message)
    if (obj.statusMessage) return String(obj.statusMessage)
  }
  return fallback
}

/** Returns true if the error is an auth failure (401/403) from the API. */
export function isApiAuthError(e: unknown): boolean {
  if (e && typeof e === 'object') {
    const obj = e as ApiError
    return obj.statusCode === 401 || obj.statusCode === 403
  }
  return false
}

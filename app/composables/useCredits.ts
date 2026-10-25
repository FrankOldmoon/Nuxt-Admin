import { ref } from 'vue'

/**
 * Client-side credit balance, shared by every module.
 *
 * The number always comes from `/api/credits/me`; modules call `refresh()` after
 * a metered action (or use `spend` on their own endpoint and push the balance
 * back with `setBalance`) so the header badge stays truthful without polling.
 */
const balance = ref<number | null>(null)
let inflight: Promise<void> | null = null

export async function refreshCredits(): Promise<void> {
  if (!import.meta.client) return
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const data = await $fetch<{ balance: number }>('/api/credits/me')
      balance.value = Number(data.balance) || 0
    } catch {
      // Not signed in (401) or the endpoint is unavailable: keep the last value.
    } finally {
      inflight = null
    }
  })()
  return inflight
}

export function setCreditBalance(value: number): void {
  if (Number.isFinite(value)) balance.value = Math.max(0, Math.floor(value))
}

export function resetCredits(): void {
  balance.value = null
}

export function useCredits() {
  return { balance, refresh: refreshCredits, setBalance: setCreditBalance, reset: resetCredits }
}

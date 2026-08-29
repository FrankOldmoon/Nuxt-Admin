export const formatTime = (time: number) => {
  return new Date(time).toLocaleString()
}

export const waitFor = async (ms: number) => {
  await new Promise(resolve => setTimeout(resolve, ms))
}

// --- Auth helpers (moved from types/auth.ts to avoid runtime value-import path issues) ---
export interface AuthErrorShape {
  statusCode: number
  statusMessage: string
  message: string
}
export function isAuthError(e: unknown): e is AuthErrorShape {
  return !!e && typeof e === 'object' && 'statusCode' in e && 'message' in e
}

// --- File/display helpers (moved from types/file.ts to avoid runtime value-import path issues) ---
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}
export function shortHash(hash: string): string {
  return hash.length > 12 ? `${hash.slice(0, 8)}…${hash.slice(-4)}` : hash
}

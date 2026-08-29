export interface FileRecord {
  id: number
  userId: number
  filename: string
  originalName: string
  hash: string
  mimeType: string | null
  size: number
  path: string
  storage: string
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface Role {
  id: number
  name: string
  description: string | null
}

// NOTE: `formatBytes` / `shortHash` have moved to `app/utils/index.ts` to avoid
// runtime module-resolution issues for value imports. The helpers are now
// auto-imported by Nuxt — no import statement is needed in components/pages.

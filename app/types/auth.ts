export interface Role {
  id: number
  name: string
  description: string | null
  /** Admin table names this role may access; '*' means all */
  permissions?: string[] | null
}

export interface PublicUser {
  id: number
  username: string
  name: string | null
  email: string
  telephone: string | null
  avatarPath: string | null
  isActive: boolean
  role: Role | null
  emailVerifiedAt: string | null
  gender: string | null
  birthday: string | null
  lastLoginAt: string | null
  lastLoginIp: string | null
  deletedAt: string | null
  createdAt: string
  updatedAt: string
}

// NOTE: `AuthError` / `isAuthError` have moved to `app/utils/index.ts` to avoid
// runtime module-resolution issues for value imports. The helper is now
// auto-imported by Nuxt — no import statement is needed in components/pages.

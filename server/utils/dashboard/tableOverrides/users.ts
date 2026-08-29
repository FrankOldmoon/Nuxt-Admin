// Users table — full-table CRUD takeover.
//
// Registered as a `TableCrudHandler` (see server/utils/dashboard/tableOverrides.ts)
// so `/api/dashboard/data/users/*` dispatch here instead of the generic
// metadata-driven CRUD.  Keeps the richer business logic (RBAC guardrails,
// duplicate checks, role join, batch import) that a plain generic CRUD can't
// express, while the shared `[table]` handlers stay untouched.

import { createError, getQuery, getRouterParam, readBody } from 'h3'
import type { H3Event } from 'h3'
import { requireAdmin } from '~~/server/utils/auth'
import { parsePagination, buildPagination } from '~~/server/utils/pagination'
import {
  listUsersPaged, findUserById, findUserByEmail, findUserByUsername,
  findRoleById, findRoleByName, createUser, updateUserProfile,
  updateUserPassword, setUserActive, setUserRole, softDeleteUsers,
  restoreUsers, permanentDeleteUsers, toPublicUser,
} from '~~/server/utils/users'
import type { PublicUser, RoleRow, UserFilters } from '~~/server/utils/users'
import type { TableCrudHandler } from '../tableOverrides'

const USERNAME_RE = /^[a-zA-Z0-9_]{3,50}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const DEFAULT_PASSWORD = 'abc123'

async function resolveRole(user: { roleId: number }): Promise<RoleRow | null> {
  return await findRoleById(user.roleId)
}

// ---- CSV parser (batch import) ----
interface ImportRow {
  username: string
  name?: string
  email: string
  password?: string
}
interface ImportError {
  row: number
  username: string
  error: string
}
function parseCsvLine(line: string): string[] {
  const fields: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === undefined) break
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        cur += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      fields.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  fields.push(cur)
  return fields.map(f => f.trim())
}
function parseCsv(text: string): ImportRow[] {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim().length > 0)
  const first = lines[0]
  if (!first) return []
  const headers = parseCsvLine(first).map(h => h.toLowerCase())
  const idx = (name: string) => headers.indexOf(name)
  return lines.slice(1).map((line) => {
    const cols = parseCsvLine(line)
    const get = (name: string) => {
      const i = idx(name)
      const v = i >= 0 ? cols[i] : undefined
      return v ?? ''
    }
    return { username: get('username'), name: get('name') || undefined, email: get('email'), password: get('password') || undefined }
  })
}

const handler: TableCrudHandler = {
  table: 'users',

  async list(event: H3Event) {
    await requireAdmin(event)
    const { page, pageSize, offset, limit } = parsePagination(event)
    const q = getQuery(event)
    const trashed = q.trashed === 'true'
    const filters: UserFilters = {}
    if (typeof q.search === 'string' && q.search) filters.search = q.search
    if (typeof q.role === 'string' && q.role) filters.role = q.role
    if (typeof q.isActive === 'string' && (q.isActive === 'true' || q.isActive === 'false')) filters.isActive = q.isActive
    if (typeof q.gender === 'string' && q.gender) filters.gender = q.gender
    if (typeof q.emailVerified === 'string' && (q.emailVerified === 'true' || q.emailVerified === 'false')) filters.emailVerified = q.emailVerified
    const sort = (typeof q.sort === 'string' && q.sort)
      ? { field: q.sort, order: q.order === 'desc' ? 'desc' as const : 'asc' as const }
      : undefined
    const { rows, total } = await listUsersPaged(offset, limit, trashed, filters, sort)
    const roleCache = new Map<number, RoleRow | null>()
    const items: PublicUser[] = []
    for (const u of rows) {
      let role = roleCache.get(u.roleId)
      if (role === undefined) {
        role = await findRoleById(u.roleId)
        roleCache.set(u.roleId, role)
      }
      items.push(toPublicUser(u, role))
    }
    return { items, pagination: buildPagination(page, pageSize, total) }
  },

  async getOne(event: H3Event) {
    await requireAdmin(event)
    const id = Number(getRouterParam(event, 'id'))
    if (!id) throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Invalid user id' })
    const user = await findUserById(id)
    if (!user) throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'User not found' })
    return { item: toPublicUser(user, await resolveRole(user)) }
  },

  async create(event: H3Event) {
    await requireAdmin(event)
    const body = await readBody<{
      username?: string
      name?: string | null
      email?: string
      telephone?: string | null
      password?: string
      roleId?: number
      isActive?: boolean
    }>(event)

    const username = body?.username?.trim()
    const name = body?.name === null || body?.name === '' ? null : body?.name?.trim()
    const email = body?.email?.trim().toLowerCase()
    const telephone = body?.telephone === null || body?.telephone === '' ? null : body?.telephone?.trim()
    const password = body?.password

    if (!username || !USERNAME_RE.test(username)) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Username must be 3-50 chars (letters, digits, underscore)' })
    }
    if (!email || !EMAIL_RE.test(email)) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Invalid email' })
    }
    if (!password || password.length < 8) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Password must be at least 8 characters' })
    }
    if (await findUserByUsername(username)) {
      throw createError({ statusCode: 409, statusMessage: 'Conflict', message: 'Username already taken' })
    }
    if (await findUserByEmail(email)) {
      throw createError({ statusCode: 409, statusMessage: 'Conflict', message: 'Email already registered' })
    }

    let roleId = body?.roleId
    if (!roleId) {
      const userRole = await findRoleByName('user')
      if (!userRole) throw createError({ statusCode: 500, statusMessage: 'Internal Server Error', message: 'Default role not found' })
      roleId = userRole.id
    } else {
      const r = await findRoleById(roleId)
      if (!r) throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Invalid role id' })
    }

    const user = await createUser({ username, name, email, telephone, password, roleId })
    const role = await findRoleById(roleId)
    void role
    return { item: toPublicUser(user, role) }
  },

  async update(event: H3Event) {
    const ctx = await requireAdmin(event)
    const id = Number(getRouterParam(event, 'id'))
    if (!id) throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Invalid user id' })
    const existing = await findUserById(id)
    if (!existing) throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'User not found' })

    const body = await readBody<{
      username?: string
      name?: string | null
      email?: string
      telephone?: string | null
      password?: string
      isActive?: boolean
      roleId?: number
    }>(event)

    if (id === ctx.user.id && body.isActive === false) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'You cannot disable your own account' })
    }

    const username = body.username?.trim()
    const name = body.name === null || body.name === '' ? null : body.name?.trim()
    const email = body.email?.trim().toLowerCase()
    const telephone = body.telephone === null || body.telephone === '' ? null : body.telephone?.trim()
    if (username !== undefined && !USERNAME_RE.test(username)) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Username must be 3-50 chars (letters, digits, underscore)' })
    }
    if (email !== undefined && !EMAIL_RE.test(email)) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Invalid email' })
    }
    if (username && username !== existing.username) {
      if (await findUserByUsername(username)) {
        throw createError({ statusCode: 409, statusMessage: 'Conflict', message: 'Username already taken' })
      }
    }
    if (email && email !== existing.email) {
      if (await findUserByEmail(email)) {
        throw createError({ statusCode: 409, statusMessage: 'Conflict', message: 'Email already registered' })
      }
    }
    if (username !== undefined || email !== undefined || name !== undefined || telephone !== undefined) {
      await updateUserProfile(id, { username, name, email, telephone })
    }
    if (body.password !== undefined) {
      if (body.password.length < 8) {
        throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Password must be at least 8 characters' })
      }
      await updateUserPassword(id, body.password)
    }
    if (body.isActive !== undefined) {
      await setUserActive(id, body.isActive)
    }
    if (body.roleId !== undefined) {
      const role = await findRoleById(body.roleId)
      if (!role) throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Invalid role id' })
      await setUserRole(id, body.roleId)
      void role
    }

    const updated = await findUserById(id)
    return { item: updated ? toPublicUser(updated, await resolveRole(updated)) : null }
  },

  async batch(event: H3Event) {
    const ctx = await requireAdmin(event)
    const body = await readBody<{ action?: string, ids?: number[] }>(event)
    const action = body?.action
    const ids = Array.isArray(body?.ids) ? body.ids : []
    if (ids.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'ids array is required' })
    }
    switch (action) {
      case 'soft-delete': {
        const safeIds = ids.filter(id => id !== ctx.user.id)
        if (safeIds.length === 0) {
          throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'You cannot delete your own account' })
        }
        return { ok: true, action, affected: await softDeleteUsers(safeIds) }
      }
      case 'restore':
        return { ok: true, action, affected: await restoreUsers(ids) }
      case 'permanent-delete': {
        const safeIds = ids.filter(id => id !== ctx.user.id)
        if (safeIds.length === 0) {
          throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'You cannot delete your own account' })
        }
        return { ok: true, action, affected: await permanentDeleteUsers(safeIds) }
      }
      default:
        throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Invalid action. Use: soft-delete, restore, or permanent-delete' })
    }
  },

  async import(event: H3Event) {
    await requireAdmin(event)
    const body = await readBody<{ csv?: string, users?: ImportRow[] }>(event)
    let rows: ImportRow[]
    if (body?.csv) {
      rows = parseCsv(body.csv)
    } else if (Array.isArray(body?.users)) {
      rows = body.users
    } else {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Provide "csv" string or "users" array' })
    }
    if (rows.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'No rows to import' })
    }
    if (rows.length > 500) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Max 500 rows per import' })
    }

    const userRole = await findRoleByName('user')
    if (!userRole) {
      throw createError({ statusCode: 500, statusMessage: 'Internal Server Error', message: 'Default role not found' })
    }
    const defaultRoleId = userRole.id
    const seenUsernames = new Set<string>()
    const seenEmails = new Set<string>()
    const errors: ImportError[] = []
    const created: ReturnType<typeof toPublicUser>[] = []

    let rowNum = 0
    for (const row of rows) {
      rowNum++
      const username = (row.username ?? '').trim()
      const name = row.name?.trim() || null
      const email = (row.email ?? '').trim().toLowerCase()
      const userPassword = (row.password ?? '').trim()
      const password = userPassword || DEFAULT_PASSWORD
      try {
        if (!username || !USERNAME_RE.test(username)) {
          throw new Error('Username must be 3-50 chars (letters, digits, underscore)')
        }
        if (!email || !EMAIL_RE.test(email)) {
          throw new Error('Invalid email')
        }
        if (userPassword && password.length < 8) {
          throw new Error('Password must be at least 8 characters')
        }
        if (seenUsernames.has(username.toLowerCase())) {
          throw new Error('Duplicate username in this batch')
        }
        if (seenEmails.has(email)) {
          throw new Error('Duplicate email in this batch')
        }
        if (await findUserByUsername(username)) {
          throw new Error('Username already taken')
        }
        if (await findUserByEmail(email)) {
          throw new Error('Email already registered')
        }
        const user = await createUser({ username, name, email, password, roleId: defaultRoleId })
        seenUsernames.add(username.toLowerCase())
        seenEmails.add(email)
        created.push(toPublicUser(user, await findRoleById(defaultRoleId)))
      } catch (e: unknown) {
        errors.push({ row: rowNum, username, error: e instanceof Error ? e.message : String(e) })
      }
    }
    return { total: rows.length, succeeded: created.length, failed: errors.length, errors, users: created }
  }
}

export default handler
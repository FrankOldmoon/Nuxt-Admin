import { eq, or, count, asc, desc, inArray, isNull, isNotNull, ilike, and } from 'drizzle-orm'
import type { PgColumn } from 'drizzle-orm/pg-core'
import { db } from './db'
import { users, roles } from '../database/schema'
import { hashPassword, verifyPassword } from './password'

export type UserRow = typeof users.$inferSelect
export type RoleRow = typeof roles.$inferSelect

export async function findUserById(id: number): Promise<UserRow | null> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1)
  return row ?? null
}

export async function findUserByUsernameOrEmail(identifier: string): Promise<UserRow | null> {
  // Email stored lowercased at registration; normalize any email-looking identifier to lowercase.
  // Username lookups stay as-is (case-sensitive PK).
  const looksLikeEmail = identifier.includes('@')
  const normalized = looksLikeEmail ? identifier.toLowerCase() : identifier
  const [row] = await db.select().from(users)
    .where(or(eq(users.username, identifier), eq(users.email, normalized)))
    .limit(1)
  return row ?? null
}

export async function findUserByEmail(email: string): Promise<UserRow | null> {
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1)
  return row ?? null
}

export async function findUserByUsername(username: string): Promise<UserRow | null> {
  const [row] = await db.select().from(users).where(eq(users.username, username)).limit(1)
  return row ?? null
}

export async function findRoleById(id: number): Promise<RoleRow | null> {
  const [row] = await db.select().from(roles).where(eq(roles.id, id)).limit(1)
  return row ?? null
}

export async function findRoleByName(name: string): Promise<RoleRow | null> {
  const [row] = await db.select().from(roles).where(eq(roles.name, name)).limit(1)
  return row ?? null
}

export async function createUser(input: {
  username: string
  email: string
  password: string
  roleId: number
  name?: string | null
  telephone?: string | null
}): Promise<UserRow> {
  const passwordHash = hashPassword(input.password)
  const [row] = await db.insert(users).values({
    username: input.username,
    name: input.name ?? null,
    email: input.email,
    telephone: input.telephone ?? null,
    passwordHash,
    roleId: input.roleId
  }).returning()
  if (!row) throw new Error('Failed to create user')
  return row
}

export async function updateUserPassword(userId: number, newPassword: string): Promise<void> {
  const passwordHash = hashPassword(newPassword)
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, userId))
}

export async function updateUserProfile(userId: number, input: {
  username?: string
  name?: string | null
  email?: string
  telephone?: string | null
  avatarPath?: string | null
  gender?: string | null
  birthday?: string | null
}): Promise<UserRow | null> {
  const sets: Partial<typeof users.$inferInsert> = {}
  if (input.username !== undefined) sets.username = input.username
  if (input.name !== undefined) sets.name = input.name
  if (input.email !== undefined) sets.email = input.email.toLowerCase()
  if (input.telephone !== undefined) sets.telephone = input.telephone
  if (input.avatarPath !== undefined) sets.avatarPath = input.avatarPath
  if (input.gender !== undefined) sets.gender = input.gender
  if (input.birthday !== undefined) sets.birthday = input.birthday
  if (Object.keys(sets).length === 0) {
    return await findUserById(userId)
  }
  sets.updatedAt = new Date()
  const [row] = await db.update(users).set(sets).where(eq(users.id, userId)).returning()
  return row ?? null
}

/** Mark a user's email as verified by setting emailVerifiedAt to now */
export async function markEmailVerified(userId: number): Promise<UserRow | null> {
  const [row] = await db.update(users)
    .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning()
  return row ?? null
}

/** Mark a user's email as unverified (emailVerifiedAt = null) */
export async function markEmailUnverified(userId: number): Promise<UserRow | null> {
  const [row] = await db.update(users)
    .set({ emailVerifiedAt: null, updatedAt: new Date() })
    .where(eq(users.id, userId))
    .returning()
  return row ?? null
}

/** Update last login timestamp and IP for a user */
export async function updateLastLogin(userId: number, ip: string | null): Promise<void> {
  await db.update(users)
    .set({ lastLoginAt: new Date(), lastLoginIp: ip, updatedAt: new Date() })
    .where(eq(users.id, userId))
}

export function checkPassword(plaintext: string, stored: string): boolean {
  return verifyPassword(plaintext, stored)
}

// Sanitize user for public responses (strip password hash, internal fields)
export function toPublicUser(user: UserRow, role?: RoleRow | null) {
  return {
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    telephone: user.telephone,
    avatarPath: user.avatarPath,
    isActive: user.isActive,
    roleId: user.roleId,
    role: role ? { id: role.id, name: role.name, description: role.description, permissions: role.permissions } : null,
    emailVerifiedAt: user.emailVerifiedAt,
    gender: user.gender,
    birthday: user.birthday ?? null,
    lastLoginAt: user.lastLoginAt,
    lastLoginIp: user.lastLoginIp,
    deletedAt: user.deletedAt,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  }
}

export type PublicUser = ReturnType<typeof toPublicUser>

// --- Admin: list / delete / status / role ---

export async function listAllUsers(): Promise<UserRow[]> {
  return await db.select().from(users).orderBy(asc(users.id))
}

export interface UserFilters {
  search?: string
  role?: string
  isActive?: string
  gender?: string
  emailVerified?: string
}

export async function listUsersPaged(offset: number, limit: number, trashed = false, filters?: UserFilters, sort?: { field: string; order: 'asc' | 'desc' }): Promise<{ rows: UserRow[], total: number }> {
  const conds = [trashed ? isNotNull(users.deletedAt) : isNull(users.deletedAt)]
  if (filters?.search) {
    const pat = `%${filters.search}%`
    conds.push(or(ilike(users.username, pat), ilike(users.email, pat))!)
  }
  if (filters?.isActive === 'true') conds.push(eq(users.isActive, true))
  else if (filters?.isActive === 'false') conds.push(eq(users.isActive, false))
  if (filters?.gender) conds.push(eq(users.gender, filters.gender))
  if (filters?.emailVerified === 'true') conds.push(isNotNull(users.emailVerifiedAt))
  else if (filters?.emailVerified === 'false') conds.push(isNull(users.emailVerifiedAt))
  if (filters?.role) {
    const role = await findRoleByName(filters.role)
    if (role) conds.push(eq(users.roleId, role.id))
  }
  const where = and(...conds)

  // Whitelist of sortable columns (key → Drizzle column)
  const sortableColumns: Record<string, PgColumn> = {
    id: users.id,
    username: users.username,
    name: users.name,
    telephone: users.telephone,
    email: users.email,
    roleId: users.roleId,
    isActive: users.isActive,
    createdAt: users.createdAt,
    deletedAt: users.deletedAt,
  }
  const orderByClauses = []
  const sortCol = sort ? sortableColumns[sort.field] : undefined
  if (sort && sortCol) {
    orderByClauses.push(sort.order === 'desc' ? desc(sortCol) : asc(sortCol))
  }
  orderByClauses.push(desc(users.id)) // stable tiebreaker

  const rows = await db.select().from(users).where(where).orderBy(...orderByClauses).limit(limit).offset(offset)
  const [countRow] = await db.select({ value: count() }).from(users).where(where)
  return { rows, total: Number(countRow?.value ?? 0) }
}

export async function deleteUserById(userId: number): Promise<boolean> {
  const result = await db.delete(users).where(eq(users.id, userId)).returning({ id: users.id })
  return result.length > 0
}

export async function softDeleteUsers(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0
  const result = await db.update(users).set({ deletedAt: new Date(), updatedAt: new Date() }).where(inArray(users.id, ids)).returning({ id: users.id })
  return result.length
}

export async function restoreUsers(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0
  const result = await db.update(users).set({ deletedAt: null, updatedAt: new Date() }).where(inArray(users.id, ids)).returning({ id: users.id })
  return result.length
}

export async function permanentDeleteUsers(ids: number[]): Promise<number> {
  if (ids.length === 0) return 0
  const result = await db.delete(users).where(inArray(users.id, ids)).returning({ id: users.id })
  return result.length
}

export async function setUserActive(userId: number, isActive: boolean): Promise<UserRow | null> {
  const [row] = await db.update(users).set({ isActive, updatedAt: new Date() }).where(eq(users.id, userId)).returning()
  return row ?? null
}

export async function setUserRole(userId: number, roleId: number): Promise<UserRow | null> {
  const [row] = await db.update(users).set({ roleId, updatedAt: new Date() }).where(eq(users.id, userId)).returning()
  return row ?? null
}

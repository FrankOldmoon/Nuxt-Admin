import { createError } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/database'
import { wxUsers } from '~~/server/database/schema'
import { wxCode2Session, createWxSession, purgeExpiredWxSessions, toPublicWxUser } from '~~/server/utils/wx'

// POST /api/wx/login — Mini-program login (Plan A: separate wx_users table, account auto-created on first login)
// Frontend wx.login() gets a code → this endpoint exchanges it for the openid → upsert wx_users → issue a Bearer token.
// Optional nickname/avatarUrl (values from the avatar-nickname filling capability) are updated together on login.
export default defineEventHandler(async (event) => {
  const body = await readBody<{ code?: string, nickname?: string, avatarUrl?: string }>(event)
  const code = body?.code?.trim()
  if (!code) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'code is required' })
  }

  const session = await wxCode2Session(code)

  const [existing] = await db.select().from(wxUsers).where(eq(wxUsers.openid, session.openid)).limit(1)

  let user
  let isNew = false
  if (existing) {
    // Existing user: update sessionKey / lastLoginAt; only overwrite nickname/avatar when provided
    const set: Record<string, unknown> = {
      sessionKey: session.sessionKey ?? null,
      lastLoginAt: new Date(),
      updatedAt: new Date()
    }
    if (session.unionid) set.unionid = session.unionid
    if (body?.nickname) set.nickname = body.nickname.slice(0, 100)
    if (body?.avatarUrl) set.avatarUrl = body.avatarUrl.slice(0, 500)
    const [updated] = await db.update(wxUsers).set(set).where(eq(wxUsers.id, existing.id)).returning()
    user = updated
  } else {
    const [created] = await db.insert(wxUsers).values({
      openid: session.openid,
      unionid: session.unionid ?? null,
      sessionKey: session.sessionKey ?? null,
      nickname: body?.nickname?.slice(0, 100) ?? null,
      avatarUrl: body?.avatarUrl?.slice(0, 500) ?? null,
      lastLoginAt: new Date()
    }).returning()
    user = created
    isNew = true
    console.log('[wx] new mini-program user created:', user.id, '| openid:', user.openid)
  }

  if (!user) {
    throw createError({ statusCode: 500, statusMessage: 'Internal Server Error', message: 'Failed to upsert wx user' })
  }

  // Best-effort cleanup of expired sessions (failure does not affect login)
  await purgeExpiredWxSessions().catch(e => console.warn('[wx] purge expired sessions failed:', e))

  const token = await createWxSession(user.id)
  return { token, isNew, user: toPublicWxUser(user) }
})

import { createError } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/database'
import { wxUsers } from '~~/server/database/schema'
import { wxCode2Session, createWxSession, purgeExpiredWxSessions, toPublicWxUser } from '~~/server/utils/wx'

// POST /api/wx/login — 小程序登录（方案A：独立 wx_users，首次自动建号）
// 前端 wx.login() 拿 code → 本接口换 openid → upsert wx_users → 签发 Bearer token。
// 可选传 nickname/avatarUrl（头像昵称填写能力拿到的值），登录时一并更新。
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
    // 已有用户：更新 sessionKey / lastLoginAt，仅在传值时覆盖昵称头像
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

  // 顺手清理过期会话（best-effort，失败不影响登录）
  await purgeExpiredWxSessions().catch(e => console.warn('[wx] purge expired sessions failed:', e))

  const token = await createWxSession(user.id)
  return { token, isNew, user: toPublicWxUser(user) }
})

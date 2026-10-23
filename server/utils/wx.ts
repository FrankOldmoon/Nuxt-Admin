import { createHash, randomBytes } from 'node:crypto'
import { eq, lt } from 'drizzle-orm'
import { createError, getHeader, type H3Event } from 'h3'
import { db } from './db'
import { wxUsers, wxSessions, type WxUser } from '../database/schema'
import { getConfigValue } from './configs'

// WeChat Mini Program foundation:
// - stable_token fetch + in-memory cache (expires 5 minutes early)
// - code2session (wx.login code → openid/session_key)
// - Mini-program login state: wx_sessions table + Authorization: Bearer <token>
// Config: wx.appid / wx.secret / wx.sessionTtlDays (editable via dashboard configs)

const WX_API_BASE = 'https://api.weixin.qq.com'

// --- config ---

async function getWxAppIdSecret(): Promise<{ appid: string, secret: string }> {
  const appid = await getConfigValue<string>('wx.appid', '')
  const secret = await getConfigValue<string>('wx.secret', '')
  if (!appid || !secret) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Internal Server Error',
      message: 'Missing config: wx.appid / wx.secret (set them in dashboard configs)'
    })
  }
  return { appid, secret }
}

// --- access_token (stable_token) cache ---

let tokenCache: { token: string, expiresAt: number } | null = null

export async function getWxAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token
  }
  const { appid, secret } = await getWxAppIdSecret()
  const res = await $fetch<{ access_token?: string, expires_in?: number, errcode?: number, errmsg?: string }>(
    `${WX_API_BASE}/cgi-bin/stable_token`,
    { method: 'POST', body: { grant_type: 'client_credential', appid, secret } }
  )
  if (!res.access_token) {
    console.error('[wx] get stable_token failed:', res)
    throw createError({
      statusCode: 502,
      statusMessage: 'Bad Gateway',
      message: `WeChat token error: ${res.errmsg ?? 'unknown'}`
    })
  }
  // stable_token requires no manual refresh, but we cache it in memory to avoid hitting the WeChat API on every request
  const expiresIn = (res.expires_in ?? 7200) - 300 // expire 5 minutes early
  tokenCache = { token: res.access_token, expiresAt: Date.now() + expiresIn * 1000 }
  console.log('[wx] access_token refreshed, expires_in:', res.expires_in)
  return res.access_token
}

// --- code2session ---

export interface WxCode2SessionResult {
  openid: string
  sessionKey?: string
  unionid?: string
}

export async function wxCode2Session(code: string): Promise<WxCode2SessionResult> {
  const { appid, secret } = await getWxAppIdSecret()
  const res = await $fetch<{
    openid?: string
    session_key?: string
    unionid?: string
    errcode?: number
    errmsg?: string
  }>(`${WX_API_BASE}/sns/jscode2session`, {
    method: 'GET',
    query: { appid, secret, js_code: code, grant_type: 'authorization_code' }
  })
  if (!res.openid) {
    console.error('[wx] code2session failed:', res)
    throw createError({
      statusCode: 502,
      statusMessage: 'Bad Gateway',
      message: `WeChat login error: ${res.errmsg ?? 'unknown'} (code ${res.errcode ?? '?'})`
    })
  }
  return { openid: res.openid, sessionKey: res.session_key, unionid: res.unionid }
}

// --- JSON API call with access_token (errcode-aware) ---

export async function wxApiPost<T = Record<string, unknown>>(path: string, body?: unknown): Promise<T> {
  const token = await getWxAccessToken()
  const sep = path.includes('?') ? '&' : '?'
  const res = await $fetch<T>(`${WX_API_BASE}${path}${sep}access_token=${token}`, {
    method: 'POST',
    body
  })
  return res
}

// --- mini-program sessions ---

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function createWxSession(wxUserId: number): Promise<string> {
  const token = randomBytes(32).toString('hex')
  const ttlDays = Math.max(1, await getConfigValue<number>('wx.sessionTtlDays', 30))
  await db.insert(wxSessions).values({
    wxUserId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000)
  })
  return token
}

export async function getWxUserByToken(token: string | undefined): Promise<WxUser | null> {
  if (!token) return null
  const tokenHash = hashToken(token)
  const [row] = await db
    .select({ wxUserId: wxSessions.wxUserId, expiresAt: wxSessions.expiresAt })
    .from(wxSessions)
    .where(eq(wxSessions.tokenHash, tokenHash))
    .limit(1)
  if (!row) return null
  if (row.expiresAt.getTime() < Date.now()) {
    await db.delete(wxSessions).where(eq(wxSessions.tokenHash, tokenHash))
    return null
  }
  const [user] = await db.select().from(wxUsers).where(eq(wxUsers.id, row.wxUserId)).limit(1)
  return user ?? null
}

/**
 * Mini-program auth guard. Reads the Bearer token from the `Authorization`
 * header (fallback: `x-wx-token`) and resolves the wx_users row.
 */
export async function requireWxUser(event: H3Event): Promise<WxUser> {
  const authHeader = getHeader(event, 'authorization') || ''
  const token = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : (getHeader(event, 'x-wx-token') || '')
  const user = await getWxUserByToken(token)
  if (!user) {
    throw createError({
      statusCode: 401,
      statusMessage: 'Unauthorized',
      message: 'WeChat login required (call /api/wx/login first)'
    })
  }
  return user
}

// Cleanup of expired mini-program sessions (best-effort, called on login)
export async function purgeExpiredWxSessions(): Promise<void> {
  await db.delete(wxSessions).where(lt(wxSessions.expiresAt, new Date()))
}

// Public shape returned to the mini-program client
export function toPublicWxUser(user: WxUser) {
  return {
    id: user.id,
    openid: user.openid,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
    phoneNumber: user.phoneNumber,
    countryCode: user.countryCode,
    userId: user.userId,
    createdAt: user.createdAt
  }
}

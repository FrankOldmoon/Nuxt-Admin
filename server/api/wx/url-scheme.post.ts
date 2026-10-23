import { createError } from 'h3'
import { wxApiPost } from '~~/server/utils/wx'

// POST /api/wx/url-scheme — Generate a mini-program URL Scheme (launch the mini-program from SMS/email/external browser)
// body: { path?: string, query?: string, isExpire?: boolean, expireType?: 0|1, expireInterval?: number, expireTime?: number }
// Returns { openlink } (in the form weixin://dl/business/?t=xxx).
// Docs: https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/qrcode-link/url-scheme/generateScheme.html
export default defineEventHandler(async (event) => {
  await requireUser(event)

  const body = await readBody<{
    path?: string
    query?: string
    isExpire?: boolean
    expireType?: 0 | 1
    expireInterval?: number
    expireTime?: number
  }>(event)

  const jumpWxa: Record<string, unknown> = {
    path: body?.path || '', // empty string = default home page
    query: body?.query || ''
  }
  if (body?.isExpire) {
    jumpWxa.is_expire = true
    jumpWxa.expire_type = body.expireType ?? 1 // 0=expire at a given time, 1=expire after N days
    if (jumpWxa.expire_type === 0 && body.expireTime) jumpWxa.expire_time = body.expireTime
    if (jumpWxa.expire_type === 1 && body.expireInterval) jumpWxa.expire_interval = body.expireInterval
  }

  const res = await wxApiPost<{ errcode?: number, errmsg?: string, openlink?: string }>('/wxa/generatescheme', {
    jump_wxa: jumpWxa
  })

  if (!res.openlink) {
    console.error('[wx] generatescheme failed:', res)
    throw createError({
      statusCode: 502,
      statusMessage: 'Bad Gateway',
      message: `WeChat scheme error: ${res.errmsg ?? 'unknown'} (code ${res.errcode ?? '?'})`
    })
  }

  console.log('[wx] url scheme generated:', res.openlink)
  return { openlink: res.openlink }
})

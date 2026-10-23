import { createError } from 'h3'
import { wxApiPost } from '~~/server/utils/wx'

// POST /api/wx/url-scheme — 生成小程序 URL Scheme（短信/邮件/外部浏览器唤起小程序）
// body: { path?: string, query?: string, isExpire?: boolean, expireType?: 0|1, expireInterval?: number, expireTime?: number }
// 返回 { openlink }（weixin://dl/business/?t=xxx 形式）。
// 文档: https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/qrcode-link/url-scheme/generateScheme.html
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
    path: body?.path || '', // 空串 = 默认首页
    query: body?.query || ''
  }
  if (body?.isExpire) {
    jumpWxa.is_expire = true
    jumpWxa.expire_type = body.expireType ?? 1 // 0=失效时间 1=失效间隔天数
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

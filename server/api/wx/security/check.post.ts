import { createError } from 'h3'
import { wxApiPost } from '~~/server/utils/wx'

// POST /api/wx/security/check — Content security check (msgSecCheck / imgSecCheck)
// body: { type: 'text'|'image', content?: string, imageBase64?: string }
// - text:  /wxa/msg_sec_check (openid optional, auto-filled on the userId path)
// - image: /wxa/img_sec_check (binary body, image ≤1M)
// Dual auth: both mini-program users (Bearer wx token) and logged-in admin users can call it.
// Docs: https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/security/security-check/

interface WxUserLike { openid: string }

async function resolveCaller(event: Parameters<typeof requireWxUser>[0]): Promise<WxUserLike> {
  try {
    return await requireWxUser(event)
  } catch {
    await requireUser(event)
    return { openid: '' } // No openid for admin callers; openid is an optional param for msg_sec_check
  }
}

export default defineEventHandler(async (event) => {
  const caller = await resolveCaller(event)

  const body = await readBody<{ type?: 'text' | 'image', content?: string, imageBase64?: string }>(event)
  const type = body?.type || 'text'

  if (type === 'text') {
    const content = body?.content?.trim()
    if (!content) {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'content is required for text check' })
    }
    const res = await wxApiPost<{ errcode?: number, errmsg?: string, result?: { suggest?: string, label?: number } }>(
      '/wxa/msg_sec_check',
      {
        version: 2,
        scene: 2, // 2=comment/post content
        openid: caller.openid || undefined,
        content
      }
    )
    const suggest = res.result?.suggest ?? (res.errcode === 0 ? 'pass' : 'risky')
    console.log('[wx] msg_sec_check suggest:', suggest, '| label:', res.result?.label, '| errcode:', res.errcode)
    return { pass: suggest === 'pass', suggest, label: res.result?.label ?? null, errcode: res.errcode ?? 0, errmsg: res.errmsg ?? 'ok' }
  }

  // image check
  const imageBase64 = body?.imageBase64?.trim()
  if (!imageBase64) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'imageBase64 is required for image check' })
  }
  const buffer = Buffer.from(imageBase64, 'base64')
  if (buffer.length === 0 || buffer.length > 1024 * 1024) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'image must be 1B ~ 1MB' })
  }
  const token = await getWxAccessToken()
  const res = await $fetch<{ errcode?: number, errmsg?: string }>('https://api.weixin.qq.com/wxa/img_sec_check', {
    method: 'POST',
    query: { access_token: token },
    headers: { 'Content-Type': 'application/octet-stream' },
    body: buffer
  })
  console.log('[wx] img_sec_check errcode:', res.errcode)
  // errcode 0 = pass; 87014 = content violation
  return { pass: res.errcode === 0, suggest: res.errcode === 0 ? 'pass' : 'risky', errcode: res.errcode ?? 0, errmsg: res.errmsg ?? 'ok' }
})

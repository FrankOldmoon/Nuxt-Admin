import { createError, setResponseHeader } from 'h3'
import { getWxAccessToken } from '~~/server/utils/wx'

// POST /api/wx/wxacode — 生成小程序码（getwxacodeunlimit，数量不限）
// body: { scene: string (≤32字符), page?: string, width?: number, checkPath?: boolean, envVersion?: 'release'|'trial'|'develop' }
// 返回：image/jpeg 二进制（直接 <img src> 可用）。
// 文档: https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/qrcode-link/qr-code/getUnlimitedQRCode.html
export default defineEventHandler(async (event) => {
  await requireUser(event)

  const body = await readBody<{
    scene?: string
    page?: string
    width?: number
    checkPath?: boolean
    envVersion?: 'release' | 'trial' | 'develop'
  }>(event)

  const scene = body?.scene?.trim()
  if (!scene) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'scene is required (max 32 chars)' })
  }
  if (scene.length > 32) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'scene must be <= 32 chars' })
  }

  const token = await getWxAccessToken()
  const res = await $fetch.raw<ArrayBuffer>(`https://api.weixin.qq.com/wxa/getwxacodeunlimit?access_token=${token}`, {
    method: 'POST',
    body: {
      scene,
      page: body?.page || undefined,
      width: body?.width || 430,
      check_path: body?.checkPath ?? true,
      env_version: body?.envVersion || 'release'
    },
    responseType: 'arrayBuffer'
  })

  const contentType = res.headers.get('content-type') || ''
  const buffer = Buffer.from(res._data as ArrayBuffer)

  // 微信出错时返回 JSON（content-type: application/json）
  if (contentType.includes('application/json') || (!contentType.startsWith('image/') && buffer[0] === 0x7b)) {
    let msg = 'unknown wxacode error'
    try {
      const parsed = JSON.parse(buffer.toString('utf8'))
      msg = `${parsed.errmsg ?? msg} (code ${parsed.errcode ?? '?'})`
    } catch { /* keep default */ }
    console.error('[wx] getwxacodeunlimit failed:', msg)
    throw createError({ statusCode: 502, statusMessage: 'Bad Gateway', message: `WeChat wxacode error: ${msg}` })
  }

  console.log('[wx] wxacode generated, scene:', scene, '| bytes:', buffer.length)
  setResponseHeader(event, 'content-type', 'image/jpeg')
  setResponseHeader(event, 'cache-control', 'public, max-age=86400')
  return buffer
})

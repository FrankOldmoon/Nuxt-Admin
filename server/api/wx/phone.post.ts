import { createError } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/database'
import { wxUsers } from '~~/server/database/schema'
import { requireWxUser, wxApiPost } from '~~/server/utils/wx'

// POST /api/wx/phone — 微信小程序手机号获取（wx 登录态版）
// 前端 <button open-type="getPhoneNumber"> 授权后拿到一次性 code（5 分钟有效），
// 本接口用 code 向微信服务器换取真实手机号，并写回 wx_users。
// 需要 Authorization: Bearer <token>（先调 /api/wx/login）。
// 文档: https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/user-info/phone-number/phonenumber.getUserPhoneNumber.html

export default defineEventHandler(async (event) => {
  const wxUser = await requireWxUser(event)

  const body = await readBody<{ code?: string }>(event)
  const code = body?.code?.trim()
  if (!code) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'code is required' })
  }

  const phoneRes = await wxApiPost<{
    errcode?: number
    errmsg?: string
    phone_info?: { phoneNumber: string, purePhoneNumber: string, countryCode: string }
  }>('/wxa/business/getuserphonenumber', { code })

  if (!phoneRes.phone_info) {
    console.error('[wx] get phone failed:', phoneRes)
    throw createError({
      statusCode: 502,
      statusMessage: 'Bad Gateway',
      message: `WeChat phone error: ${phoneRes.errmsg ?? 'unknown'}`
    })
  }

  // 写回 wx_users，方便后台直接看到用户的手机号
  const [updated] = await db.update(wxUsers)
    .set({
      phoneNumber: phoneRes.phone_info.purePhoneNumber,
      countryCode: phoneRes.phone_info.countryCode,
      updatedAt: new Date()
    })
    .where(eq(wxUsers.id, wxUser.id))
    .returning()

  console.log('[wx] phone resolved for wxUser', wxUser.id, ':', phoneRes.phone_info.phoneNumber, '| country:', phoneRes.phone_info.countryCode)
  return {
    phoneNumber: phoneRes.phone_info.phoneNumber,
    purePhoneNumber: phoneRes.phone_info.purePhoneNumber,
    countryCode: phoneRes.phone_info.countryCode,
    user: updated ? { id: updated.id, phoneNumber: updated.phoneNumber } : undefined
  }
})

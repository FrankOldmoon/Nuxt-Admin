import { createError } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/database'
import { wxUsers } from '~~/server/database/schema'
import { requireWxUser, wxApiPost } from '~~/server/utils/wx'

// POST /api/wx/phone — Get WeChat mini-program phone number (wx login-state version)
// The frontend obtains a one-time code (valid for 5 minutes) after <button open-type="getPhoneNumber"> authorization;
// this endpoint exchanges the code with the WeChat server for the real phone number and writes it back to wx_users.
// Requires Authorization: Bearer <token> (call /api/wx/login first).
// Docs: https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/user-info/phone-number/phonenumber.getUserPhoneNumber.html

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

  // Write back to wx_users so the admin side can directly see the user's phone number
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

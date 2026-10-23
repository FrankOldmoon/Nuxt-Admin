import { createError } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/database'
import { wxUsers } from '~~/server/database/schema'
import { wxApiPost } from '~~/server/utils/wx'

// POST /api/wx/subscribe-message — Send a mini-program subscribe message (admin operation)
// body: { openid?: string, wxUserId?: number, templateId: string, data: Record<string, {value: string}>, page?: string, miniprogramState?: 'developer'|'trial'|'formal' }
// Provide either openid or wxUserId; when wxUserId is given, the openid is looked up from the table automatically.
// Docs: https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/mp-message-management/subscribe-message/sendMessage.html
export default defineEventHandler(async (event) => {
  await requireAdmin(event)

  const body = await readBody<{
    openid?: string
    wxUserId?: number
    templateId?: string
    data?: Record<string, { value: string }>
    page?: string
    miniprogramState?: 'developer' | 'trial' | 'formal'
  }>(event)

  const templateId = body?.templateId?.trim()
  if (!templateId || !body?.data || Object.keys(body.data).length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'templateId and data are required' })
  }

  // Resolve target openid
  let openid = body.openid?.trim() || ''
  if (!openid && body.wxUserId) {
    const [wxUser] = await db.select().from(wxUsers).where(eq(wxUsers.id, body.wxUserId)).limit(1)
    if (!wxUser) {
      throw createError({ statusCode: 404, statusMessage: 'Not Found', message: `wx_user ${body.wxUserId} not found` })
    }
    openid = wxUser.openid
  }
  if (!openid) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'openid or wxUserId is required' })
  }

  const res = await wxApiPost<{ errcode?: number, errmsg?: string }>('/cgi-bin/message/subscribe/send', {
    touser: openid,
    template_id: templateId,
    page: body.page || undefined,
    data: body.data,
    miniprogram_state: body.miniprogramState || 'formal'
  })

  // 43101: user refused / not subscribed to this template — common; return it for the caller to handle
  console.log('[wx] subscribe/send openid:', openid, '| template:', templateId, '| errcode:', res.errcode)
  return {
    ok: res.errcode === 0 || res.errcode === undefined,
    errcode: res.errcode ?? 0,
    errmsg: res.errmsg ?? 'ok',
    hint: res.errcode === 43101 ? '用户未订阅该模板或已拒绝接收' : undefined
  }
})

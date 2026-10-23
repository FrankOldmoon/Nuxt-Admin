import { createError } from 'h3'
import { eq } from 'drizzle-orm'
import { db } from '~~/server/database'
import { wxUsers } from '~~/server/database/schema'
import { wxApiPost } from '~~/server/utils/wx'

// POST /api/wx/subscribe-message — 发送小程序订阅消息（后台 admin 操作）
// body: { openid?: string, wxUserId?: number, templateId: string, data: Record<string, {value: string}>, page?: string, miniprogramState?: 'developer'|'trial'|'formal' }
// openid 与 wxUserId 二选一；给 wxUserId 时自动查表取 openid。
// 文档: https://developers.weixin.qq.com/miniprogram/dev/OpenApiDoc/mp-message-management/subscribe-message/sendMessage.html
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

  // 43101: 用户拒绝/未订阅该模板 — 常见，返回给调用方自行处理
  console.log('[wx] subscribe/send openid:', openid, '| template:', templateId, '| errcode:', res.errcode)
  return {
    ok: res.errcode === 0 || res.errcode === undefined,
    errcode: res.errcode ?? 0,
    errmsg: res.errmsg ?? 'ok',
    hint: res.errcode === 43101 ? '用户未订阅该模板或已拒绝接收' : undefined
  }
})

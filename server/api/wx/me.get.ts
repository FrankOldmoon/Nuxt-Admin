import { requireWxUser, toPublicWxUser } from '~~/server/utils/wx'

// GET /api/wx/me — 当前小程序登录用户（Authorization: Bearer <token>）
export default defineEventHandler(async (event) => {
  const user = await requireWxUser(event)
  return { user: toPublicWxUser(user) }
})

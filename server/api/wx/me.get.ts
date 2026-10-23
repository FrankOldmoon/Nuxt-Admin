import { requireWxUser, toPublicWxUser } from '~~/server/utils/wx'

// GET /api/wx/me — Current logged-in mini-program user (Authorization: Bearer <token>)
export default defineEventHandler(async (event) => {
  const user = await requireWxUser(event)
  return { user: toPublicWxUser(user) }
})

export default defineEventHandler(async (event) => {
  const ctx = await requireUser(event)
  const count = await markAllNotificationsRead(ctx.user.id)
  return { count }
})

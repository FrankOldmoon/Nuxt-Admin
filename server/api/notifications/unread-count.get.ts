export default defineEventHandler(async (event) => {
  const ctx = await requireUser(event)
  const count = await countUnreadNotifications(ctx.user.id)
  return { count }
})

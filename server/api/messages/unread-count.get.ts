export default defineEventHandler(async (event) => {
  const ctx = await requireUser(event)
  const count = await countUnreadMessages(ctx.user.id)
  return { count }
})

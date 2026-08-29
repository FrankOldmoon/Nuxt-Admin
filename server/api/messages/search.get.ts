export default defineEventHandler(async (event) => {
  const ctx = await requireUser(event)
  const q = getQuery(event)
  const query = typeof q.q === 'string' ? q.q.trim() : ''
  if (!query) return { users: [] }
  const users = await searchUsers(ctx.user.id, query)
  return { users }
})

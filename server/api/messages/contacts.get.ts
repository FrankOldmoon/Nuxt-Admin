export default defineEventHandler(async (event) => {
  const ctx = await requireUser(event)
  const contacts = await getContactList(ctx.user.id)
  // Set online status from the WebSocket registry
  for (const c of contacts) {
    c.online = isUserOnline(c.id)
  }
  return { contacts }
})

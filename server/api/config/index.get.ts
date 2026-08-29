// All configs — admin only
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const configs = await getAllConfigs()
  return { configs }
})

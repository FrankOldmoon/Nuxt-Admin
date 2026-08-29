import { createError } from 'h3'

interface UpdateItem {
  key: string
  value: string
  type?: string
  description?: string
}

// Update configs — admin only.
// Body: { configs: Array<{ key, value, type?, description? }> }
//   or  { key, value, type?, description? }
export default defineEventHandler(async (event) => {
  await requireAdmin(event)
  const body = await readBody<{ configs?: UpdateItem[] } & UpdateItem>(event)

  const items: UpdateItem[] = Array.isArray(body?.configs) && body.configs.length
    ? body.configs
    : (body?.key ? [body] : [])

  if (items.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'No configs provided' })
  }

  for (const item of items) {
    if (!item.key || typeof item.value !== 'string') {
      throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: `Invalid entry for key "${item.key}"` })
    }
    await upsertConfig({
      key: item.key,
      value: item.value,
      type: item.type,
      description: item.description
    })
  }

  const configs = await getAllConfigs()
  return { configs }
})

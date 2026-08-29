// Public site configs (no auth). Used by frontend to render site title, upload limits, etc.
export default defineEventHandler(async () => {
  const all = await getAllConfigs()
  const publicConfigs: Record<string, string> = {}
  for (const row of all) {
    // Expose site.* and upload.* to the frontend (no secrets here);
    // security.captchaEnabled drives whether the frontend shows the captcha (not sensitive)
    if (
      row.key.startsWith('site.') ||
      row.key.startsWith('upload.') ||
      row.key === 'security.captchaEnabled'
    ) {
      publicConfigs[row.key] = row.value
    }
  }
  return { configs: publicConfigs }
})

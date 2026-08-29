// GET /api/auth/captcha — stateless captcha (HMAC-signed SVG) for the login page.
import { generateCaptcha } from '~~/server/utils/captcha'

export default defineEventHandler(async () => {
  return generateCaptcha()
})

// Stateless captcha: HMAC signature + expiry timestamp, no server-side storage needed.
// id format: `base36(issue timestamp).first 32 of hmac`; on verify we recompute the HMAC and check freshness.
import { createHmac, timingSafeEqual } from 'node:crypto'
import { getConfigValue } from './configs'

const CAPTCHA_TTL_MS = 5 * 60 * 1000 // valid for 5 minutes
const DEFAULT_SECRET = 'nuxt-admin-captcha-dev-secret-change-me'

// Remove easily-confused characters (0/O/1/I/l)
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
const WIDTH = 120
const HEIGHT = 40

export interface CaptchaChallenge {
  id: string
  svg: string
}

async function getCaptchaSecret(): Promise<string> {
  const fromConfig = await getConfigValue<string>('security.captchaSecret', '')
  return fromConfig || process.env.NUXT_CAPTCHA_SECRET || DEFAULT_SECRET
}

function hmac(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('hex')
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function renderCaptchaSvg(text: string): string {
  const chars = [...text]
  const parts = chars
    .map((ch, i) => {
      const x = 12 + i * 26 + Math.round(Math.random() * 6)
      const y = 22 + Math.round(Math.random() * 10)
      const rot = Math.round((Math.random() * 40 - 20) * 10) / 10
      const color = `hsl(${Math.floor(Math.random() * 360)}, 60%, 38%)`
      return `<text x="${x}" y="${y}" transform="rotate(${rot} ${x} ${y})" font-family="Arial, sans-serif" font-size="24" font-weight="bold" fill="${color}">${escapeXml(ch)}</text>`
    })
    .join('')
  const noise = Array.from({ length: 4 }, () => {
    const x1 = Math.floor(Math.random() * WIDTH)
    const y1 = Math.floor(Math.random() * HEIGHT)
    const x2 = Math.floor(Math.random() * WIDTH)
    const y2 = Math.floor(Math.random() * HEIGHT)
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(120,120,120,0.45)" stroke-width="1"/>`
  }).join('')
  const dots = Array.from({ length: 12 }, () => {
    const x = Math.floor(Math.random() * WIDTH)
    const y = Math.floor(Math.random() * HEIGHT)
    return `<circle cx="${x}" cy="${y}" r="1" fill="rgba(120,120,120,0.5)"/>`
  }).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}"><rect width="${WIDTH}" height="${HEIGHT}" fill="#f3f4f6" rx="4"/>${noise}${dots}${parts}</svg>`
}

export async function generateCaptcha(): Promise<CaptchaChallenge> {
  const secret = await getCaptchaSecret()
  // Keep the challenge lowercase so the displayed characters are unambiguous and
  // verification is case-insensitive (user may type uppercase letters).
  const text = Array.from({ length: 4 }, () => CHARSET[Math.floor(Math.random() * CHARSET.length)]!).join('').toLowerCase()
  const ts = Date.now()
  const id = `${ts.toString(36)}.${hmac(secret, `${ts}:${text}`).slice(0, 32)}`
  return { id, svg: renderCaptchaSvg(text) }
}

export async function verifyCaptcha(id: string | undefined, text: string | undefined): Promise<boolean> {
  if (!id || !text) return false
  const secret = await getCaptchaSecret()
  const parts = id.split('.')
  if (parts.length !== 2) return false
  const ts = Number.parseInt(parts[0]!, 36)
  if (!Number.isFinite(ts)) return false
  const now = Date.now()
  if (now - ts > CAPTCHA_TTL_MS || ts > now + CAPTCHA_TTL_MS) return false
  // Case-insensitive match: users may type lowercase letters as uppercase and vice versa.
  const expected = hmac(secret, `${ts}:${text.toLowerCase()}`).slice(0, 32)
  const actual = parts[1]!
  if (expected.length !== actual.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
}

// Stateless captcha: HMAC signature + expiry timestamp, no server-side storage needed.
// id format: `base36(issue timestamp).first 32 of hmac`; on verify we recompute the HMAC and check freshness.
//
// Characters are rendered as vector paths from a tiny 5×7 bitmap font, never as
// `<text>` nodes: a text node puts the answer in the DOM, where any script can
// read it, which would make the challenge worthless against bots.
import { createHmac, timingSafeEqual } from 'node:crypto'
import { getConfigValue } from './configs'

const CAPTCHA_TTL_MS = 5 * 60 * 1000 // valid for 5 minutes
const DEFAULT_SECRET = 'nuxt-admin-captcha-dev-secret-change-me'

// Remove easily-confused characters (0/O/1/I/l)
const CHARSET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
const WIDTH = 120
const HEIGHT = 40

/** 5×7 dot-matrix glyphs for every character the challenge can contain. */
const GLYPHS: Record<string, string[]> = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  F: ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
  G: ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.###.'],
  H: ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  J: ['...##', '....#', '....#', '....#', '....#', '#...#', '.###.'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  Q: ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  Y: ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
  Z: ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  3: ['#####', '...#.', '..#..', '...#.', '....#', '#...#', '.###.'],
  4: ['...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.'],
  7: ['#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...'],
  8: ['.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..']
}

export interface CaptchaChallenge {
  id: string
  svg: string
  /** Dev only: lets the login form type the challenge for the developer. */
  devText?: string
}

async function getCaptchaSecret(): Promise<string> {
  const fromConfig = await getConfigValue<string>('security.captchaSecret', '')
  return fromConfig || process.env.NUXT_CAPTCHA_SECRET || DEFAULT_SECRET
}

function hmac(secret: string, data: string): string {
  return createHmac('sha256', secret).update(data).digest('hex')
}

/** One glyph as a single path of tiny squares (5×7 cells). */
function glyphPath(char: string, originX: number, originY: number, cell: number): string {
  const rows = GLYPHS[char] ?? GLYPHS['?'] ?? []
  const segments: string[] = []
  rows.forEach((row, y) => {
    [...row].forEach((pixel, x) => {
      if (pixel !== '#') return
      const px = originX + x * cell
      const py = originY + y * cell
      // A tiny inset keeps the dots visually separate without extra shapes.
      segments.push(`M${px.toFixed(1)} ${py.toFixed(1)}h${(cell - 0.35).toFixed(2)}v${(cell - 0.35).toFixed(2)}h-${(cell - 0.35).toFixed(2)}z`)
    })
  })
  return segments.join('')
}

function renderCaptchaSvg(text: string): string {
  const chars = [...text.toUpperCase()]
  const parts = chars
    .map((ch, i) => {
      const cell = 3 + Math.random() * 0.5
      const glyphWidth = 5 * cell
      const glyphHeight = 7 * cell
      const x = 10 + i * 27 + Math.round(Math.random() * 5)
      const y = 6 + Math.round(Math.random() * 8)
      const rot = Math.round((Math.random() * 30 - 15) * 10) / 10
      const pivotX = (x + glyphWidth / 2).toFixed(1)
      const pivotY = (y + glyphHeight / 2).toFixed(1)
      const color = `hsl(${Math.floor(Math.random() * 360)}, 62%, 34%)`
      return `<g transform="rotate(${rot} ${pivotX} ${pivotY})"><path fill="${color}" d="${glyphPath(ch, x, y, cell)}"/></g>`
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
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="captcha"><rect width="${WIDTH}" height="${HEIGHT}" fill="#f3f4f6" rx="4"/>${noise}${dots}${parts}</svg>`
}

export async function generateCaptcha(): Promise<CaptchaChallenge> {
  const secret = await getCaptchaSecret()
  // Keep the challenge lowercase so the displayed characters are unambiguous and
  // verification is case-insensitive (user may type uppercase letters).
  const text = Array.from({ length: 4 }, () => CHARSET[Math.floor(Math.random() * CHARSET.length)]!).join('').toLowerCase()
  const ts = Date.now()
  const id = `${ts.toString(36)}.${hmac(secret, `${ts}:${text}`).slice(0, 32)}`
  const svg = renderCaptchaSvg(text)
  // The answer may only travel to the client in development, where it saves the
  // developer from squinting at the image. Compiled out of production builds.
  return import.meta.dev ? { id, svg, devText: text } : { id, svg }
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

import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'

// scrypt-based hash with random salt, stored as "salt:hash"
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

// Verify a plaintext password against a stored "salt:hash" string.
// Uses crypto.timingSafeEqual for constant-time comparison to prevent timing attacks.
export function verifyPassword(password: string, stored: string): boolean {
  // Validate stored format upfront: expect "salt:hash" split once, hash should be 128 hex chars
  const sepIdx = stored.indexOf(':')
  if (sepIdx < 0) return false
  const salt = stored.slice(0, sepIdx)
  const hash = stored.slice(sepIdx + 1)
  if (!salt || hash.length !== 128) return false

  const candidate = scryptSync(password, salt, 64)
  // Pad candidate to same length as expected hash (should always match, but guard anyway)
  const expected = Buffer.from(hash, 'hex')
  if (candidate.length !== expected.length) {
    // Compare with dummy buffer of same length to avoid leaking length via timing
    const dummy = Buffer.alloc(expected.length, 0)
    timingSafeEqual(dummy, expected)
    return false
  }
  return timingSafeEqual(candidate, expected)
}

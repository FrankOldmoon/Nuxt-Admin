import {
  createTypedToken,
  verifyTypedToken,
  consumeTypedToken,
  purgeExpiredTokens,
  purgeUserTypedTokens
} from './tokens'

const DEFAULT_TTL_MINUTES = 30

export interface PasswordResetPayload {
  uid: number
}

// Create a password reset token. Persists a SHA-256 hash in the tokens table.
export async function createPasswordResetToken(userId: number, ttlMinutes = DEFAULT_TTL_MINUTES): Promise<string> {
  const { token } = await createTypedToken(userId, 'password_reset', ttlMinutes)
  return token
}

// Verify a password reset token. Returns the user id if valid.
export async function verifyPasswordResetToken(token: string): Promise<PasswordResetPayload | null> {
  const uid = await verifyTypedToken(token, 'password_reset')
  return uid ? { uid } : null
}

// Consume (delete) a password reset token after use.
export async function consumePasswordResetToken(token: string): Promise<void> {
  await consumeTypedToken(token, 'password_reset')
}

// Cleanup expired tokens of all types (session, password_reset, email_verify).
// Called opportunistically during forgot-password requests.
export async function purgeExpiredPasswordResetTokens(): Promise<void> {
  await purgeExpiredTokens()
}

// Remove all password reset tokens for a user (e.g. before issuing a fresh one).
export async function purgeUserPasswordResetTokens(userId: number): Promise<void> {
  await purgeUserTypedTokens(userId, 'password_reset')
}

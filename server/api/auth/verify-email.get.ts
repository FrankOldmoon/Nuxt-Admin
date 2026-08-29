import { createError, sendRedirect } from 'h3'

export default defineEventHandler(async (event) => {
  const token = getQuery(event).token?.toString() || ''
  if (!token) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: 'Token is required' })
  }

  const payload = await verifyEmailVerificationToken(token)
  if (!payload) {
    // Redirect to profile with an error flag so the frontend can show a message
    return sendRedirect(event, '/profile?verify=invalid')
  }

  await markEmailVerified(payload.uid)
  await consumeEmailVerificationToken(token)

  return sendRedirect(event, '/profile?verify=success')
})

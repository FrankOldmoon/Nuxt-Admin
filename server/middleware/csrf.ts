import { createError, getHeader, getRequestHost, getRequestProtocol } from 'h3'
import { isOriginAllowed } from '../utils/originPolicy'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export default defineEventHandler((event) => {
  const method = (event.method || 'GET').toUpperCase()
  if (SAFE_METHODS.has(method)) return

  const forwardedHost = getHeader(event, 'x-forwarded-host')?.split(',')[0]?.trim()
  const origin = getHeader(event, 'origin')
  const allowed = isOriginAllowed({
    origin,
    host: forwardedHost || getRequestHost(event),
    protocol: getRequestProtocol(event),
    siteUrl: process.env.NUXT_PUBLIC_SITE_URL
  })

  if (!allowed) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'Cross-site request rejected' })
  }
})

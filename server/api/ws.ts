import type { WSPeer } from '~~/server/utils/wsRegistry'

const MAX_MESSAGE_LENGTH = 2000 // Max characters for a single private message
const MAX_MESSAGES_PER_MINUTE = 60 // Per-user send throttle
// In-memory simple throttle (same caveats as single-node rate limiter)
const sendBuckets = new Map<number, number[]>()
const SEND_WINDOW = 60_000

function underSendRateLimit(userId: number): boolean {
  const now = Date.now()
  const timestamps = sendBuckets.get(userId) ?? []
  const valid = timestamps.filter((t) => now - t < SEND_WINDOW)
  if (valid.length >= MAX_MESSAGES_PER_MINUTE) {
    sendBuckets.set(userId, valid)
    return false
  }
  valid.push(now)
  sendBuckets.set(userId, valid)
  return true
}
function cleanSendBuckets() {
  const now = Date.now()
  for (const [uid, ts] of sendBuckets) {
    if (ts.every((t) => now - t >= SEND_WINDOW)) sendBuckets.delete(uid)
  }
}
setInterval(cleanSendBuckets, SEND_WINDOW).unref?.()

async function broadcastPresence(userId: number, online: boolean): Promise<void> {
  const contactIds = await getContactUserIds(userId)
  for (const cid of contactIds) {
    sendToUser(cid, { type: 'presence:update', data: { userId, online } })
  }
}

function parseSessionToken(cookieHeader: string | null): string | undefined {
  if (!cookieHeader) return undefined
  const cookies = cookieHeader.split(';').map(c => c.trim())
  for (const cookie of cookies) {
    const idx = cookie.indexOf('=')
    if (idx === -1) continue
    const name = cookie.substring(0, idx)
    if (name === SESSION_COOKIE_NAME) return cookie.substring(idx + 1)
  }
  return undefined
}

function isValidUserId(n: number): n is number {
  return Number.isInteger(n) && n > 0
}

export default defineWebSocketHandler({
  async upgrade(request) {
    const cookieHeader = request.headers.get('cookie')
    const token = parseSessionToken(cookieHeader)
    const userId = await verifySessionToken(token)
    if (!userId) {
      throw new Response('Unauthorized', { status: 401 })
    }
    const user = await findUserById(userId)
    if (!user || !user.isActive || user.deletedAt) {
      throw new Response('Forbidden', { status: 403 })
    }
    const role = await findRoleById(user.roleId)
    request.context.userId = userId
    request.context.username = user.username
    request.context.role = role?.name ?? 'user'
  },

  async open(peer) {
    const ctx = peer.context as { userId?: number }
    const userId = ctx?.userId
    if (!userId) {
      peer.close(4001, 'No user context')
      return
    }

    registerPeer(userId, peer as unknown as WSPeer)

    const [unreadNotifs, unreadMsgs] = await Promise.all([
      countUnreadNotifications(userId),
      countUnreadMessages(userId)
    ])
    peer.send(JSON.stringify({
      type: 'connected',
      data: { userId, unreadNotifications: unreadNotifs, unreadMessages: unreadMsgs }
    }))

    await broadcastPresence(userId, true).catch(() => {})
  },

  async message(peer, message) {
    const ctx = peer.context as { userId?: number }
    const userId = ctx?.userId
    if (!userId) return

    // Validate raw text size before parsing to prevent oversized payload DoS
    const rawText = message.text()
    if (rawText.length > MAX_MESSAGE_LENGTH * 2 + 500) {
      peer.send(JSON.stringify({ type: 'error', data: { message: 'Payload too large' } }))
      return
    }

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(rawText)
    } catch {
      peer.send(JSON.stringify({ type: 'error', data: { message: 'Invalid JSON' } }))
      return
    }

    const type = parsed.type as string
    const data = (parsed.data ?? {}) as Record<string, unknown>

    switch (type) {
      case 'notification:markRead': {
        const notificationId = Number(data.notificationId)
        if (!isValidUserId(notificationId)) return
        await markNotificationRead(notificationId, userId)
        peer.send(JSON.stringify({ type: 'notification:markedRead', data: { notificationId } }))
        const unread = await countUnreadNotifications(userId)
        peer.send(JSON.stringify({ type: 'notification:unreadCount', data: { count: unread } }))
        break
      }
      case 'notification:markAllRead': {
        const count = await markAllNotificationsRead(userId)
        peer.send(JSON.stringify({ type: 'notification:allMarkedRead', data: { count } }))
        peer.send(JSON.stringify({ type: 'notification:unreadCount', data: { count: 0 } }))
        break
      }
      case 'message:send': {
        const receiverId = Number(data.receiverId)
        const content = String(data.content ?? '').trim()
        if (!isValidUserId(receiverId)) {
          peer.send(JSON.stringify({ type: 'error', data: { message: 'Invalid receiver' } }))
          return
        }
        if (!content) {
          peer.send(JSON.stringify({ type: 'error', data: { message: 'Empty message' } }))
          return
        }
        if (content.length > MAX_MESSAGE_LENGTH) {
          peer.send(JSON.stringify({ type: 'error', data: { message: `Message too long (max ${MAX_MESSAGE_LENGTH} chars)` } }))
          return
        }
        if (receiverId === userId) {
          peer.send(JSON.stringify({ type: 'error', data: { message: 'Cannot message yourself' } }))
          return
        }
        if (!underSendRateLimit(userId)) {
          peer.send(JSON.stringify({ type: 'error', data: { message: 'Rate limited' } }))
          return
        }
        // Validate receiver exists and is active
        const receiver = await findUserById(receiverId)
        if (!receiver || !receiver.isActive || receiver.deletedAt) {
          peer.send(JSON.stringify({ type: 'error', data: { message: 'Receiver unavailable' } }))
          return
        }
        const msg = await sendPrivateMessage({ senderId: userId, receiverId, content })
        peer.send(JSON.stringify({
          type: 'message:sent',
          data: {
            id: msg.id,
            senderId: msg.senderId,
            receiverId: msg.receiverId,
            content: msg.content,
            readAt: msg.readAt,
            createdAt: msg.createdAt
          }
        }))
        const unread = await countUnreadMessages(userId)
        peer.send(JSON.stringify({ type: 'message:unreadCount', data: { count: unread } }))
        break
      }
      case 'message:markRead': {
        const peerId = Number(data.peerId)
        if (!isValidUserId(peerId)) return
        const count = await markMessagesRead(userId, peerId)
        peer.send(JSON.stringify({ type: 'message:markedRead', data: { peerId, count } }))
        const unread = await countUnreadMessages(userId)
        peer.send(JSON.stringify({ type: 'message:unreadCount', data: { count: unread } }))
        break
      }
      default:
        peer.send(JSON.stringify({ type: 'error', data: { message: `Unknown type: ${type}` } }))
    }
  },

  close(peer) {
    const ctx = peer.context as { userId?: number }
    const userId = ctx?.userId
    if (userId) {
      unregisterPeer(userId, peer as unknown as WSPeer)
      if (!isUserOnline(userId)) {
        broadcastPresence(userId, false).catch(() => {})
      }
    }
  },

  error(peer, error) {
    const ctx = peer.context as { userId?: number }
    const userId = ctx?.userId
    if (userId) {
      unregisterPeer(userId, peer as unknown as WSPeer)
      // Mirror close behavior — also broadcast offline when error causes disconnect
      if (!isUserOnline(userId)) {
        broadcastPresence(userId, false).catch(() => {})
      }
    }
    if (import.meta.dev) {
      console.error('[ws] error:', error)
    }
  }
})

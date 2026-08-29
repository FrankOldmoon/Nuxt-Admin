import { describe, it, expect, vi, beforeEach } from 'vitest'

// server/api/ws.ts relies on Nuxt server auto-imports (defineWebSocketHandler,
// verifySessionToken, findUserById, registerPeer, etc.); in the plain node test
// environment these are injected as mocks via globalThis; defineWebSocketHandler
// captures the handler definition.
const h = vi.hoisted(() => {
  const g = globalThis as Record<string, unknown>
  const captured: Record<string, unknown> = {}
  g.defineWebSocketHandler = (opts: Record<string, unknown>) => {
    Object.assign(captured, opts)
    return opts
  }
  g.SESSION_COOKIE_NAME = 'session'
  const mocks = {
    verifySessionToken: vi.fn(),
    findUserById: vi.fn(),
    findRoleById: vi.fn(),
    registerPeer: vi.fn(),
    unregisterPeer: vi.fn(),
    isUserOnline: vi.fn(() => false),
    sendToUser: vi.fn(),
    getContactUserIds: vi.fn(async () => [] as number[]),
    countUnreadNotifications: vi.fn(async () => 0),
    markNotificationRead: vi.fn(async () => {}),
    markAllNotificationsRead: vi.fn(async () => 0),
    countUnreadMessages: vi.fn(async () => 0),
    markMessagesRead: vi.fn(async () => 0),
    sendPrivateMessage: vi.fn()
  }
  Object.assign(g, mocks)
  return { captured, ...mocks }
})

import wsHandler from '../../../server/api/ws'

const handler = (typeof wsHandler?.upgrade === 'function' ? wsHandler : h.captured) as {
  upgrade: (request: any) => Promise<void>
  open: (peer: any) => Promise<void>
  message: (peer: any, message: any) => Promise<void>
  close: (peer: any) => void
  error: (peer: any, error: Error) => void
}

const activeUser = {
  id: 5, username: 'alice', email: 'a@x.com', passwordHash: 'h', roleId: 2,
  isActive: true, deletedAt: null, emailVerifiedAt: null, name: 'Alice', telephone: null,
  avatarPath: null, gender: null, birthday: null, lastLoginAt: null, lastLoginIp: null,
  createdAt: new Date(), updatedAt: new Date()
}
const adminRole = { id: 1, name: 'admin', description: null }

function makeRequest(cookie: string | null) {
  return {
    headers: { get: (name: string) => (name === 'cookie' ? cookie : null) },
    context: {} as Record<string, unknown>
  }
}

function makePeer(userId?: number) {
  return {
    context: userId === undefined ? {} : { userId },
    send: vi.fn(),
    close: vi.fn()
  }
}

function makeMessage(raw: string) {
  return { text: () => raw }
}

function sent(peer: any) {
  return peer.send.mock.calls.map((c: unknown[]) => JSON.parse(c[0] as string))
}

beforeEach(() => {
  for (const fn of [
    h.verifySessionToken, h.findUserById, h.findRoleById,
    h.registerPeer, h.unregisterPeer, h.isUserOnline, h.sendToUser,
    h.getContactUserIds, h.countUnreadNotifications, h.markNotificationRead,
    h.markAllNotificationsRead, h.countUnreadMessages, h.markMessagesRead,
    h.sendPrivateMessage
  ]) {
    fn.mockReset()
  }
  h.isUserOnline.mockImplementation(() => false)
  h.getContactUserIds.mockImplementation(async () => [])
  h.countUnreadNotifications.mockImplementation(async () => 0)
  h.markNotificationRead.mockImplementation(async () => {})
  h.markAllNotificationsRead.mockImplementation(async () => 0)
  h.countUnreadMessages.mockImplementation(async () => 0)
  h.markMessagesRead.mockImplementation(async () => 0)
  h.verifySessionToken.mockImplementation(async () => null)
  h.findUserById.mockImplementation(async () => activeUser)
})

describe('upgrade connection auth', () => {
  it('throws 401 without a cookie header', async () => {
    const err = await handler.upgrade(makeRequest(null)).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(Response)
    expect((err as Response).status).toBe(401)
  })

  it('throws 401 for an invalid session token', async () => {
    h.verifySessionToken.mockImplementation(async () => null)
    const err = await handler.upgrade(makeRequest('session=bad')).catch((e: unknown) => e)
    expect((err as Response).status).toBe(401)
  })

  it('correctly resolves the session token among multiple cookies', async () => {
    h.verifySessionToken.mockImplementation(async (t?: string) => (t === 'tok123' ? 5 : null))
    const req = makeRequest('other=1; session=tok123; lang=zh')
    await handler.upgrade(req)
    expect(h.verifySessionToken).toHaveBeenCalledWith('tok123')
    expect(req.context.userId).toBe(5)
  })

  it('throws 403 when the user does not exist', async () => {
    h.verifySessionToken.mockImplementation(async () => 5)
    h.findUserById.mockImplementation(async () => null)
    const err = await handler.upgrade(makeRequest('session=t')).catch((e: unknown) => e)
    expect((err as Response).status).toBe(403)
  })

  it('throws 403 when the user is disabled or deleted', async () => {
    h.verifySessionToken.mockImplementation(async () => 5)
    h.findUserById.mockImplementation(async () => ({ ...activeUser, isActive: false }))
    const err1 = await handler.upgrade(makeRequest('session=t')).catch((e: unknown) => e)
    expect((err1 as Response).status).toBe(403)
    h.findUserById.mockImplementation(async () => ({ ...activeUser, deletedAt: new Date() }))
    const err2 = await handler.upgrade(makeRequest('session=t')).catch((e: unknown) => e)
    expect((err2 as Response).status).toBe(403)
  })

  it('writes userId/username/role into the context after authentication', async () => {
    h.verifySessionToken.mockImplementation(async () => 5)
    h.findRoleById.mockImplementation(async () => adminRole)
    const req = makeRequest('session=t')
    await handler.upgrade(req)
    expect(req.context.userId).toBe(5)
    expect(req.context.username).toBe('alice')
    expect(req.context.role).toBe('admin')
  })

  it('defaults to the user role when the role query is empty', async () => {
    h.verifySessionToken.mockImplementation(async () => 5)
    h.findRoleById.mockImplementation(async () => null)
    const req = makeRequest('session=t')
    await handler.upgrade(req)
    expect(req.context.role).toBe('user')
  })
})

describe('open connection establishment', () => {
  it('closes with 4001 without a userId context', async () => {
    const peer = makePeer()
    await handler.open(peer)
    expect(peer.close).toHaveBeenCalledWith(4001, 'No user context')
    expect(peer.send).not.toHaveBeenCalled()
  })

  it('registers the peer and pushes a connected message with unread counts', async () => {
    h.countUnreadNotifications.mockImplementation(async () => 3)
    h.countUnreadMessages.mockImplementation(async () => 2)
    const peer = makePeer(5)
    await handler.open(peer)
    expect(h.registerPeer).toHaveBeenCalledWith(5, peer)
    const msgs = sent(peer)
    expect(msgs[0]).toEqual({
      type: 'connected',
      data: { userId: 5, unreadNotifications: 3, unreadMessages: 2 }
    })
  })

  it('broadcasts presence:update to contacts after going online', async () => {
    h.getContactUserIds.mockImplementation(async () => [2, 3])
    const peer = makePeer(5)
    await handler.open(peer)
    expect(h.getContactUserIds).toHaveBeenCalledWith(5)
    expect(h.sendToUser).toHaveBeenCalledTimes(2)
    expect(h.sendToUser).toHaveBeenCalledWith(2, { type: 'presence:update', data: { userId: 5, online: true } })
    expect(h.sendToUser).toHaveBeenCalledWith(3, { type: 'presence:update', data: { userId: 5, online: true } })
  })
})

describe('message generic validation', () => {
  it('ignores messages from an unauthenticated peer', async () => {
    const peer = makePeer()
    await handler.message(peer, makeMessage('{"type":"message:send","data":{}}'))
    expect(peer.send).not.toHaveBeenCalled()
  })

  it('rejects an oversized payload', async () => {
    const peer = makePeer(5)
    await handler.message(peer, makeMessage('a'.repeat(4501)))
    const msgs = sent(peer)
    expect(msgs[0]).toEqual({ type: 'error', data: { message: 'Payload too large' } })
  })

  it('errors on invalid JSON', async () => {
    const peer = makePeer(5)
    await handler.message(peer, makeMessage('not-json'))
    const msgs = sent(peer)
    expect(msgs[0]).toEqual({ type: 'error', data: { message: 'Invalid JSON' } })
  })

  it('errors on an unknown type', async () => {
    const peer = makePeer(5)
    await handler.message(peer, makeMessage(JSON.stringify({ type: 'foo' })))
    const msgs = sent(peer)
    expect(msgs[0]).toEqual({ type: 'error', data: { message: 'Unknown type: foo' } })
  })
})

describe('notification:markRead', () => {
  it('marks a valid notification read and pushes the result and unread count', async () => {
    h.countUnreadNotifications.mockImplementation(async () => 4)
    const peer = makePeer(5)
    await handler.message(peer, makeMessage(JSON.stringify({
      type: 'notification:markRead', data: { notificationId: 7 }
    })))
    expect(h.markNotificationRead).toHaveBeenCalledWith(7, 5)
    const msgs = sent(peer)
    expect(msgs[0]).toEqual({ type: 'notification:markedRead', data: { notificationId: 7 } })
    expect(msgs[1]).toEqual({ type: 'notification:unreadCount', data: { count: 4 } })
  })

  it('silently ignores an invalid notification id', async () => {
    const peer = makePeer(5)
    await handler.message(peer, makeMessage(JSON.stringify({
      type: 'notification:markRead', data: { notificationId: 'abc' }
    })))
    expect(h.markNotificationRead).not.toHaveBeenCalled()
    expect(peer.send).not.toHaveBeenCalled()
  })
})

describe('notification:markAllRead', () => {
  it('marks all read and pushes the count plus 0 unread', async () => {
    h.markAllNotificationsRead.mockImplementation(async () => 9)
    const peer = makePeer(5)
    await handler.message(peer, makeMessage(JSON.stringify({
      type: 'notification:markAllRead'
    })))
    expect(h.markAllNotificationsRead).toHaveBeenCalledWith(5)
    const msgs = sent(peer)
    expect(msgs[0]).toEqual({ type: 'notification:allMarkedRead', data: { count: 9 } })
    expect(msgs[1]).toEqual({ type: 'notification:unreadCount', data: { count: 0 } })
  })
})

describe('message:send private message', () => {
  const sentMsg = { id: 11, senderId: 5, receiverId: 2, content: 'hi', readAt: null, createdAt: new Date('2026-01-01T00:00:00Z') }

  function setupOk() {
    h.findUserById.mockImplementation(async (id: number) =>
      id === 5 ? activeUser : { ...activeUser, id: 2, username: 'bob' })
    h.sendPrivateMessage.mockImplementation(async () => sentMsg)
    h.countUnreadMessages.mockImplementation(async () => 1)
  }

  it('errors on an invalid receiver id', async () => {
    const peer = makePeer(5)
    await handler.message(peer, makeMessage(JSON.stringify({
      type: 'message:send', data: { receiverId: 0, content: 'hi' }
    })))
    expect(sent(peer)[0]).toEqual({ type: 'error', data: { message: 'Invalid receiver' } })
  })

  it('errors on empty content', async () => {
    const peer = makePeer(5)
    await handler.message(peer, makeMessage(JSON.stringify({
      type: 'message:send', data: { receiverId: 2, content: '   ' }
    })))
    expect(sent(peer)[0]).toEqual({ type: 'error', data: { message: 'Empty message' } })
  })

  it('errors when exceeding 2000 characters', async () => {
    const peer = makePeer(5)
    await handler.message(peer, makeMessage(JSON.stringify({
      type: 'message:send', data: { receiverId: 2, content: 'x'.repeat(2001) }
    })))
    expect(sent(peer)[0]).toEqual({ type: 'error', data: { message: 'Message too long (max 2000 chars)' } })
  })

  it('rejects messaging yourself', async () => {
    const peer = makePeer(5)
    await handler.message(peer, makeMessage(JSON.stringify({
      type: 'message:send', data: { receiverId: 5, content: 'hi' }
    })))
    expect(sent(peer)[0]).toEqual({ type: 'error', data: { message: 'Cannot message yourself' } })
  })

  it('errors when the receiver does not exist or is unavailable', async () => {
    h.findUserById.mockImplementation(async (id: number) =>
      id === 5 ? activeUser : null)
    const peer = makePeer(5)
    await handler.message(peer, makeMessage(JSON.stringify({
      type: 'message:send', data: { receiverId: 2, content: 'hi' }
    })))
    expect(sent(peer)[0]).toEqual({ type: 'error', data: { message: 'Receiver unavailable' } })

    h.findUserById.mockImplementation(async (id: number) =>
      id === 5 ? activeUser : { ...activeUser, id: 2, isActive: false })
    const peer2 = makePeer(5)
    await handler.message(peer2, makeMessage(JSON.stringify({
      type: 'message:send', data: { receiverId: 2, content: 'hi' }
    })))
    expect(sent(peer2)[0]).toEqual({ type: 'error', data: { message: 'Receiver unavailable' } })
  })

  it('sends the message:sent receipt and pushes the unread count on success', async () => {
    setupOk()
    const peer = makePeer(5)
    await handler.message(peer, makeMessage(JSON.stringify({
      type: 'message:send', data: { receiverId: 2, content: ' hi ' }
    })))
    expect(h.sendPrivateMessage).toHaveBeenCalledWith({ senderId: 5, receiverId: 2, content: 'hi' })
    const msgs = sent(peer)
    expect(msgs[0]).toMatchObject({ type: 'message:sent', data: { id: 11, receiverId: 2, content: 'hi' } })
    expect(msgs[1]).toEqual({ type: 'message:unreadCount', data: { count: 1 } })
  })

  it('triggers rate limiting above 60 messages per minute', async () => {
    setupOk()
    const peer = makePeer(88)
    const raw = JSON.stringify({ type: 'message:send', data: { receiverId: 2, content: 'hi' } })
    for (let i = 0; i < 60; i++) {
      await handler.message(peer, makeMessage(raw))
    }
    expect(h.sendPrivateMessage).toHaveBeenCalledTimes(60)
    await handler.message(peer, makeMessage(raw))
    const last = sent(peer).at(-1)
    expect(last).toEqual({ type: 'error', data: { message: 'Rate limited' } })
  })
})

describe('message:markRead conversation read', () => {
  it('marks the conversation read and pushes count and unread', async () => {
    h.markMessagesRead.mockImplementation(async () => 3)
    h.countUnreadMessages.mockImplementation(async () => 6)
    const peer = makePeer(5)
    await handler.message(peer, makeMessage(JSON.stringify({
      type: 'message:markRead', data: { peerId: 2 }
    })))
    expect(h.markMessagesRead).toHaveBeenCalledWith(5, 2)
    const msgs = sent(peer)
    expect(msgs[0]).toEqual({ type: 'message:markedRead', data: { peerId: 2, count: 3 } })
    expect(msgs[1]).toEqual({ type: 'message:unreadCount', data: { count: 6 } })
  })

  it('silently ignores an invalid peerId', async () => {
    const peer = makePeer(5)
    await handler.message(peer, makeMessage(JSON.stringify({
      type: 'message:markRead', data: { peerId: -1 }
    })))
    expect(h.markMessagesRead).not.toHaveBeenCalled()
    expect(peer.send).not.toHaveBeenCalled()
  })
})

describe('close/error connection teardown', () => {
  it('close unregisters the peer and broadcasts offline when the user is offline', async () => {
    h.getContactUserIds.mockImplementation(async () => [2])
    const peer = makePeer(5)
    handler.close(peer)
    expect(h.unregisterPeer).toHaveBeenCalledWith(5, peer)
    // broadcastPresence is async, so wait for the microtask queue to drain
    await new Promise((r) => setTimeout(r, 0))
    expect(h.sendToUser).toHaveBeenCalledWith(2, { type: 'presence:update', data: { userId: 5, online: false } })
  })

  it('does not broadcast offline on close when other connections remain', async () => {
    h.isUserOnline.mockImplementation(() => true)
    const peer = makePeer(5)
    handler.close(peer)
    await new Promise((r) => setTimeout(r, 0))
    expect(h.unregisterPeer).toHaveBeenCalledWith(5, peer)
    expect(h.sendToUser).not.toHaveBeenCalled()
  })

  it('close without userId does no cleanup', async () => {
    const peer = makePeer()
    handler.close(peer)
    expect(h.unregisterPeer).not.toHaveBeenCalled()
  })

  it('error also unregisters the peer and broadcasts offline', async () => {
    h.getContactUserIds.mockImplementation(async () => [2])
    const peer = makePeer(5)
    handler.error(peer, new Error('boom'))
    expect(h.unregisterPeer).toHaveBeenCalledWith(5, peer)
    await new Promise((r) => setTimeout(r, 0))
    expect(h.sendToUser).toHaveBeenCalledWith(2, { type: 'presence:update', data: { userId: 5, online: false } })
  })
})

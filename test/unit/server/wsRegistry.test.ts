import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  registerPeer,
  unregisterPeer,
  isUserOnline,
  sendToUser,
  broadcastToAll,
  getOnlineUserIds,
  type WSPeer
} from '../../../server/utils/wsRegistry'

function makePeer(id: string): WSPeer {
  return {
    id,
    send: vi.fn(),
    context: {},
    request: {} as never,
    close: vi.fn()
  }
}

function makeBrokenPeer(id: string): WSPeer {
  return {
    id,
    send: () => { throw new Error('peer closed') },
    context: {},
    request: {} as never,
    close: vi.fn()
  }
}

// Record registered peers and clean them up after each test so cases don't interfere
const registered: Array<[number, WSPeer]> = []
function reg(userId: number, peer: WSPeer) {
  registerPeer(userId, peer)
  registered.push([userId, peer])
}

afterEach(() => {
  for (const [uid, peer] of registered) unregisterPeer(uid, peer)
  registered.length = 0
})

describe('registerPeer / isUserOnline', () => {
  it('an unregistered user is offline', () => {
    expect(isUserOnline(1)).toBe(false)
  })

  it('a registered user is online', () => {
    reg(1, makePeer('p1'))
    expect(isUserOnline(1)).toBe(true)
  })

  it('a user with multiple peers (multi-tab) only goes offline after the last one is unregistered', () => {
    const a = makePeer('a')
    const b = makePeer('b')
    reg(2, a)
    reg(2, b)
    expect(isUserOnline(2)).toBe(true)
    unregisterPeer(2, a)
    expect(isUserOnline(2)).toBe(true)
    unregisterPeer(2, b)
    expect(isUserOnline(2)).toBe(false)
  })
})

describe('unregisterPeer', () => {
  it('unregistering an unknown user or unregistered peer does not throw', () => {
    expect(() => unregisterPeer(999, makePeer('x'))).not.toThrow()
  })

  it('after unregistering, the user is not in the online list', () => {
    const p = makePeer('p')
    reg(3, p)
    unregisterPeer(3, p)
    expect(getOnlineUserIds()).not.toContain(3)
  })
})

describe('sendToUser', () => {
  it('returns 0 for an offline user', () => {
    expect(sendToUser(42, { type: 'x' })).toBe(0)
  })

  it('sends a JSON message to all the user peers and returns the reachable count', () => {
    const a = makePeer('a')
    const b = makePeer('b')
    reg(5, a)
    reg(5, b)
    const payload = { type: 'message:new', data: { id: 1 } }
    expect(sendToUser(5, payload)).toBe(2)
    expect(a.send).toHaveBeenCalledWith(JSON.stringify(payload))
    expect(b.send).toHaveBeenCalledWith(JSON.stringify(payload))
  })

  it('failed peers are removed and not counted toward the reachable count', () => {
    const broken = makeBrokenPeer('broken')
    const good = makePeer('good')
    reg(6, broken)
    reg(6, good)
    const n = sendToUser(6, { type: 'x' })
    expect(n).toBe(1)
    expect(good.send).toHaveBeenCalledTimes(1)
    // broken has been removed, so a re-send only reaches good
    expect(sendToUser(6, { type: 'x' })).toBe(1)
    expect(good.send).toHaveBeenCalledTimes(2)
  })

  it('when all peers fail, the registry clears the user', () => {
    const broken = makeBrokenPeer('b1')
    reg(7, broken)
    expect(sendToUser(7, { type: 'x' })).toBe(0)
    expect(isUserOnline(7)).toBe(false)
    expect(getOnlineUserIds()).not.toContain(7)
  })
})

describe('broadcastToAll', () => {
  it('returns 0 when there are no connections', () => {
    expect(broadcastToAll({ type: 'x' })).toBe(0)
  })

  it('broadcasts to all peers of all online users and returns the total', () => {
    const u1a = makePeer('u1a')
    const u1b = makePeer('u1b')
    const u2a = makePeer('u2a')
    reg(1, u1a)
    reg(1, u1b)
    reg(2, u2a)
    const payload = { type: 'notification:new' }
    expect(broadcastToAll(payload)).toBe(3)
    expect(u1a.send).toHaveBeenCalledWith(JSON.stringify(payload))
    expect(u1b.send).toHaveBeenCalledWith(JSON.stringify(payload))
    expect(u2a.send).toHaveBeenCalledWith(JSON.stringify(payload))
  })

  it('failed peers are removed during broadcast', () => {
    const broken = makeBrokenPeer('broken')
    const good = makePeer('good')
    reg(8, broken)
    reg(8, good)
    expect(broadcastToAll({ type: 'x' })).toBe(1)
    // broken has been removed, so later send only reaches good
    expect(broadcastToAll({ type: 'x' })).toBe(1)
  })
})

describe('getOnlineUserIds', () => {
  it('returns all online user IDs', () => {
    reg(11, makePeer('a'))
    reg(12, makePeer('b'))
    const ids = getOnlineUserIds()
    expect(ids).toContain(11)
    expect(ids).toContain(12)
  })
})

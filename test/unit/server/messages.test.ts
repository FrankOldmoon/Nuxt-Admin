import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildChain } from '../../helpers/db'

const h = vi.hoisted(() => {
  const sendToUser = vi.fn()
  const db = {
    select: vi.fn(),
    selectDistinct: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  }
  return { sendToUser, db }
})

vi.mock('../../../server/utils/db', () => ({ db: h.db, schema: {}, pool: {} }))
vi.mock('../../../server/utils/wsRegistry', () => ({
  sendToUser: h.sendToUser,
  broadcastToAll: vi.fn(),
  getOnlineUserIds: vi.fn(() => []),
  registerPeer: vi.fn(),
  unregisterPeer: vi.fn(),
  isUserOnline: vi.fn(() => false)
}))
vi.mock('../../../server/utils/users', () => ({
  findUserById: vi.fn(),
  toPublicUser: vi.fn(),
  findRoleById: vi.fn()
}))

import {
  sendPrivateMessage,
  getContactList,
  getMessageHistory,
  markMessagesRead,
  countUnreadMessages,
  searchUsers,
  getContactUserIds
} from '../../../server/utils/messages'

let selectResults: unknown[] = []
let selectDistinctResults: unknown[] = []
let insertResult: unknown[] = []
let insertValues: any[] = []
let updateResult: unknown[] = []
let updateSets: any[] = []

beforeEach(() => {
  selectResults = []
  selectDistinctResults = []
  insertResult = []
  insertValues = []
  updateResult = []
  updateSets = []
  h.sendToUser.mockReset()
  h.db.select.mockReset().mockImplementation(() => buildChain(selectResults.shift() ?? []))
  h.db.selectDistinct.mockReset().mockImplementation(() => buildChain(selectDistinctResults.shift() ?? []))
  h.db.insert.mockReset().mockImplementation(() => ({
    values: (v: any) => {
      insertValues.push(v)
      return buildChain(insertResult)
    }
  }) as any)
  h.db.update.mockReset().mockImplementation(() => ({
    set: (s: any) => {
      updateSets.push(s)
      return buildChain(updateResult)
    }
  }) as any)
  h.db.delete.mockReset().mockImplementation(() => buildChain([]))
})

describe('sendPrivateMessage', () => {
  it('inserts a message and pushes it to both sender and receiver over WebSocket', async () => {
    const row = {
      id: 10, senderId: 1, receiverId: 2, content: 'hi',
      readAt: null, createdAt: new Date('2026-01-01T00:00:00Z')
    }
    insertResult = [row]
    const result = await sendPrivateMessage({ senderId: 1, receiverId: 2, content: 'hi' })
    expect(result).toEqual(row)
    expect(insertValues[0]).toEqual({ senderId: 1, receiverId: 2, content: 'hi' })
    expect(h.sendToUser).toHaveBeenCalledTimes(2)
    expect(h.sendToUser).toHaveBeenNthCalledWith(1, 2, {
      type: 'message:new',
      data: { id: 10, senderId: 1, receiverId: 2, content: 'hi', readAt: null, createdAt: row.createdAt }
    })
    expect(h.sendToUser).toHaveBeenNthCalledWith(2, 1, {
      type: 'message:sent',
      data: { id: 10, senderId: 1, receiverId: 2, content: 'hi', readAt: null, createdAt: row.createdAt }
    })
  })

  it('throws without pushing when insert fails (no row returned)', async () => {
    insertResult = []
    await expect(sendPrivateMessage({ senderId: 1, receiverId: 2, content: 'x' }))
      .rejects.toThrow('Failed to send message')
    expect(h.sendToUser).not.toHaveBeenCalled()
  })
})

describe('getContactList', () => {
  it('returns contacts ordered by latest message time desc, with unread counts and direction flags', async () => {
    const t1 = new Date('2026-01-01T00:00:00Z')
    const t2 = new Date('2026-02-01T00:00:00Z')
    selectResults = [
      // contact list (sorted by username: alice first, bob second)
      [
        { id: 2, username: 'bob', name: null, avatarPath: null },
        { id: 3, username: 'alice', name: 'Alice', avatarPath: '/a.png' }
      ],
      // bob's latest message (I sent to bob -> lastMessageFromMe=true)
      [{ content: 'hi bob', senderId: 1, createdAt: t1 }],
      // bob's unread count
      [{ value: 2 }],
      // alice's latest message (alice sent to me -> lastMessageFromMe=false)
      [{ content: 'hi alice', senderId: 3, createdAt: t2 }],
      // alice's unread count
      [{ value: 0 }]
    ]
    const contacts = await getContactList(1)
    expect(contacts).toHaveLength(2)
    // alice's newer message (t2 > t1) is listed first
    expect(contacts[0]).toMatchObject({
      id: 3, username: 'alice', unreadCount: 0,
      lastMessageContent: 'hi alice', lastMessageAt: t2, lastMessageFromMe: false,
      online: false
    })
    expect(contacts[1]).toMatchObject({
      id: 2, username: 'bob', unreadCount: 2,
      lastMessageContent: 'hi bob', lastMessageAt: t1, lastMessageFromMe: true
    })
  })

  it('contacts without a latest message go last with a null preview', async () => {
    selectResults = [
      [{ id: 2, username: 'bob', name: null, avatarPath: null }],
      [],            // bob has no latest message
      [{ value: 3 }]  // bob's unread count
    ]
    const contacts = await getContactList(1)
    expect(contacts).toHaveLength(1)
    expect(contacts[0]).toMatchObject({
      lastMessageContent: null,
      lastMessageAt: null,
      lastMessageFromMe: false,
      unreadCount: 3
    })
  })

  it('returns an empty array when there are no contacts', async () => {
    selectResults = [[]]
    expect(await getContactList(1)).toEqual([])
  })
})

describe('getMessageHistory', () => {
  it('returns mapped message rows and the total', async () => {
    const t = new Date('2026-01-01T00:00:00Z')
    selectResults = [
      [{ id: 10, senderId: 1, receiverId: 2, content: 'a', readAt: null, createdAt: t, extra: 'ignored' }],
      [{ value: 7 }]
    ]
    const { rows, total } = await getMessageHistory(1, 2, 0, 20)
    expect(rows).toEqual([{ id: 10, senderId: 1, receiverId: 2, content: 'a', readAt: null, createdAt: t }])
    expect(total).toBe(7)
  })

  it('total is 0 when the count row is missing', async () => {
    selectResults = [[], []]
    const { rows, total } = await getMessageHistory(1, 2, 0, 20)
    expect(rows).toEqual([])
    expect(total).toBe(0)
  })
})

describe('markMessagesRead', () => {
  it('marks as read, notifies the sender, and returns the count', async () => {
    updateResult = [{ id: 10 }, { id: 11 }]
    const n = await markMessagesRead(1, 2)
    expect(n).toBe(2)
    expect(updateSets[0].readAt).toBeInstanceOf(Date)
    expect(h.sendToUser).toHaveBeenCalledWith(2, {
      type: 'message:read',
      data: { peerId: 1, readCount: 2 }
    })
  })

  it('returns 0 without pushing when there are no unread messages', async () => {
    updateResult = []
    expect(await markMessagesRead(1, 2)).toBe(0)
    expect(h.sendToUser).not.toHaveBeenCalled()
  })
})

describe('countUnreadMessages', () => {
  it('returns the unread count', async () => {
    selectResults = [[{ value: 5 }]]
    expect(await countUnreadMessages(1)).toBe(5)
  })

  it('returns 0 when there are no records', async () => {
    selectResults = [[]]
    expect(await countUnreadMessages(1)).toBe(0)
  })
})

describe('searchUsers', () => {
  it('returns matching user rows', async () => {
    const rows = [{ id: 3, username: 'alice', name: 'Alice', avatarPath: null, email: 'a@x.com' }]
    selectResults = [rows]
    expect(await searchUsers(1, 'ali')).toEqual(rows)
  })
})

describe('getContactUserIds', () => {
  it('merges contact IDs from both directions and dedupes', async () => {
    selectDistinctResults = [
      [{ id: 2 }, { id: 3 }],  // receivers I've messaged
      [{ id: 2 }, { id: 4 }]   // senders who messaged me
    ]
    expect(await getContactUserIds(1)).toEqual([2, 3, 4])
  })

  it('returns an empty array when there are no messages', async () => {
    selectDistinctResults = [[], []]
    expect(await getContactUserIds(1)).toEqual([])
  })
})

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildChain } from '../../helpers/db'

const h = vi.hoisted(() => {
  const sendToUser = vi.fn()
  const broadcastToAll = vi.fn()
  const db = {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
    delete: vi.fn()
  }
  return { sendToUser, broadcastToAll, db }
})

vi.mock('../../../server/utils/db', () => ({ db: h.db, schema: {}, pool: {} }))
vi.mock('../../../server/utils/wsRegistry', () => ({
  sendToUser: h.sendToUser,
  broadcastToAll: h.broadcastToAll,
  getOnlineUserIds: vi.fn(() => []),
  registerPeer: vi.fn(),
  unregisterPeer: vi.fn(),
  isUserOnline: vi.fn(() => false)
}))

import {
  createNotification,
  listNotificationsPaged,
  markNotificationRead,
  markAllNotificationsRead,
  countUnreadNotifications,
  deleteNotification,
  getNotificationCreator
} from '../../../server/utils/notifications'

const notificationRow = {
  id: 1,
  title: 'Maintenance notice',
  content: 'Outage maintenance tonight',
  createdBy: 9,
  targetUserIds: null,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z')
}

let selectResults: unknown[] = []
let insertResult: unknown[] = []
let insertValues: any[] = []
let deleteResult: unknown[] = []

beforeEach(() => {
  selectResults = []
  insertResult = []
  insertValues = []
  deleteResult = []
  h.sendToUser.mockReset()
  h.broadcastToAll.mockReset()
  h.db.select.mockReset().mockImplementation(() => buildChain(selectResults.shift() ?? []))
  h.db.insert.mockReset().mockImplementation(() => ({
    values: (v: any) => {
      insertValues.push(v)
      return buildChain(insertResult)
    }
  }) as any)
  h.db.update.mockReset().mockImplementation(() => buildChain([]))
  h.db.delete.mockReset().mockImplementation(() => buildChain(deleteResult))
})

describe('createNotification', () => {
  it('pushes targeted notifications to each target user without broadcasting', async () => {
    insertResult = [{ ...notificationRow, targetUserIds: [1, 2] }]
    const row = await createNotification({
      title: 'Maintenance notice', content: 'Outage maintenance tonight', createdBy: 9, targetUserIds: [1, 2]
    })
    expect(row.targetUserIds).toEqual([1, 2])
    expect(insertValues[0]).toMatchObject({
      title: 'Maintenance notice', content: 'Outage maintenance tonight', createdBy: 9, targetUserIds: [1, 2]
    })
    expect(h.sendToUser).toHaveBeenCalledTimes(2)
    expect(h.sendToUser).toHaveBeenNthCalledWith(1, 1, expect.objectContaining({ type: 'notification:new' }))
    expect(h.sendToUser).toHaveBeenNthCalledWith(2, 2, expect.objectContaining({ type: 'notification:new' }))
    expect(h.broadcastToAll).not.toHaveBeenCalled()
  })

  it('stores null and broadcasts when the target array is empty', async () => {
    insertResult = [notificationRow]
    await createNotification({
      title: 'Maintenance notice', content: 'Outage maintenance tonight', createdBy: 9, targetUserIds: []
    })
    expect(insertValues[0].targetUserIds).toBeNull()
    expect(h.broadcastToAll).toHaveBeenCalledTimes(1)
    expect(h.broadcastToAll).toHaveBeenCalledWith(expect.objectContaining({ type: 'notification:new' }))
    expect(h.sendToUser).not.toHaveBeenCalled()
  })

  it('broadcasts to everyone when no target is given', async () => {
    insertResult = [notificationRow]
    await createNotification({ title: 't', content: 'c', createdBy: 9 })
    expect(insertValues[0].targetUserIds).toBeNull()
    expect(h.broadcastToAll).toHaveBeenCalledTimes(1)
  })

  it('throws without pushing when insert returns no row', async () => {
    insertResult = []
    await expect(createNotification({ title: 't', content: 'c', createdBy: 9 }))
      .rejects.toThrow('Failed to create notification')
    expect(h.broadcastToAll).not.toHaveBeenCalled()
  })
})

describe('listNotificationsPaged', () => {
  it('returns rows with read state and the total', async () => {
    const rows = [{ ...notificationRow, read: true }]
    selectResults = [rows, [{ value: 9 }]]
    const result = await listNotificationsPaged(5, 0, 20)
    expect(result.rows).toEqual(rows)
    expect(result.total).toBe(9)
  })

  it('returns an empty list and 0 when there is no data', async () => {
    selectResults = [[], []]
    const result = await listNotificationsPaged(5, 0, 20)
    expect(result.rows).toEqual([])
    expect(result.total).toBe(0)
  })
})

describe('markNotificationRead', () => {
  it('writes a read record (ignores idempotent conflicts)', async () => {
    await markNotificationRead(1, 5)
    expect(h.db.insert).toHaveBeenCalledTimes(1)
    expect(insertValues[0]).toEqual({ notificationId: 1, userId: 5 })
  })
})

describe('markAllNotificationsRead', () => {
  it('returns 0 without writing when there are no unread notifications', async () => {
    selectResults = [[]]
    expect(await markAllNotificationsRead(5)).toBe(0)
    expect(h.db.insert).not.toHaveBeenCalled()
  })

  it('marks all unread notifications read and returns the count', async () => {
    selectResults = [[{ id: 1 }, { id: 2 }, { id: 3 }]]
    insertResult = []
    const n = await markAllNotificationsRead(5)
    expect(n).toBe(3)
    expect(insertValues[0]).toEqual([
      { notificationId: 1, userId: 5 },
      { notificationId: 2, userId: 5 },
      { notificationId: 3, userId: 5 }
    ])
  })
})

describe('countUnreadNotifications', () => {
  it('returns the unread count', async () => {
    selectResults = [[{ value: 4 }]]
    expect(await countUnreadNotifications(5)).toBe(4)
  })

  it('returns 0 when there are no unread', async () => {
    selectResults = [[]]
    expect(await countUnreadNotifications(5)).toBe(0)
  })
})

describe('deleteNotification', () => {
  it('deletes successfully and returns true', async () => {
    deleteResult = [{ id: 1 }]
    expect(await deleteNotification(1)).toBe(true)
  })

  it('returns false when the notification does not exist', async () => {
    deleteResult = []
    expect(await deleteNotification(999)).toBe(false)
  })
})

describe('getNotificationCreator', () => {
  it('returns the creator info', async () => {
    const creator = { notificationId: 1, userId: 9, username: 'admin', name: 'Admin' }
    selectResults = [[creator]]
    expect(await getNotificationCreator(1)).toEqual(creator)
  })

  it('returns null when not found', async () => {
    selectResults = [[]]
    expect(await getNotificationCreator(999)).toBeNull()
  })
})

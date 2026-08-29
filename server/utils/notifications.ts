import { eq, desc, count, and, isNull, notExists, sql, or } from 'drizzle-orm'
import { db } from './db'
import { notifications, notificationReads, users } from '../database/schema'
import { broadcastToAll, sendToUser } from './wsRegistry'

export type NotificationRow = typeof notifications.$inferSelect

/** Create a notification (admin only). Pushes via WebSocket to targeted users or all. */
export async function createNotification(input: {
  title: string
  content: string
  createdBy: number
  targetUserIds?: number[] | null
}): Promise<NotificationRow> {
  const [row] = await db.insert(notifications).values({
    title: input.title,
    content: input.content,
    createdBy: input.createdBy,
    targetUserIds: input.targetUserIds && input.targetUserIds.length > 0 ? input.targetUserIds : null
  }).returning()
  if (!row) throw new Error('Failed to create notification')

  const payload = {
    type: 'notification:new',
    data: {
      id: row.id,
      title: row.title,
      content: row.content,
      createdBy: row.createdBy,
      createdAt: row.createdAt,
      read: false
    }
  }

  if (row.targetUserIds && row.targetUserIds.length > 0) {
    // Send only to targeted users
    for (const uid of row.targetUserIds) {
      sendToUser(uid, payload)
    }
  } else {
    // Broadcast to all connected users
    broadcastToAll(payload)
  }

  return row
}

/** Visibility filter: notification targets all users OR includes the given userId */
const targetFilter = (userId: number) =>
  or(
    isNull(notifications.targetUserIds),
    sql`${userId} = ANY(${notifications.targetUserIds})`
  )

/** List notifications with pagination, including read status for a given user. */
export async function listNotificationsPaged(
  userId: number,
  offset: number,
  limit: number
): Promise<{ rows: Array<NotificationRow & { read: boolean }>, total: number }> {
  const rows = await db
    .select({
      id: notifications.id,
      title: notifications.title,
      content: notifications.content,
      createdBy: notifications.createdBy,
      targetUserIds: notifications.targetUserIds,
      createdAt: notifications.createdAt,
      updatedAt: notifications.updatedAt,
      deletedAt: notifications.deletedAt,
      read: sql<boolean>`CASE WHEN ${notificationReads.id} IS NULL THEN false ELSE true END`.as('read')
    })
    .from(notifications)
    .leftJoin(
      notificationReads,
      and(
        eq(notificationReads.notificationId, notifications.id),
        eq(notificationReads.userId, userId)
      )
    )
    .where(targetFilter(userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit)
    .offset(offset)

  const [countRow] = await db
    .select({ value: count() })
    .from(notifications)
    .where(targetFilter(userId))
  return { rows, total: Number(countRow?.value ?? 0) }
}

/** Mark a notification as read for a specific user (idempotent). */
export async function markNotificationRead(notificationId: number, userId: number): Promise<void> {
  await db.insert(notificationReads)
    .values({ notificationId, userId })
    .onConflictDoNothing()
}

/** Mark all visible notifications as read for a specific user. */
export async function markAllNotificationsRead(userId: number): Promise<number> {
  const unread = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(
      and(
        targetFilter(userId),
        notExists(
          db.select()
            .from(notificationReads)
            .where(
              and(
                eq(notificationReads.notificationId, notifications.id),
                eq(notificationReads.userId, userId)
              )
            )
        )
      )
    )

  if (unread.length === 0) return 0

  await db.insert(notificationReads)
    .values(unread.map(n => ({ notificationId: n.id, userId })))
    .onConflictDoNothing()

  return unread.length
}

/** Count unread notifications for a user (only visible ones). */
export async function countUnreadNotifications(userId: number): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(notifications)
    .where(
      and(
        targetFilter(userId),
        notExists(
          db.select()
            .from(notificationReads)
            .where(
              and(
                eq(notificationReads.notificationId, notifications.id),
                eq(notificationReads.userId, userId)
              )
            )
        )
      )
    )
  return Number(row?.value ?? 0)
}

/** Delete a notification (admin only). */
export async function deleteNotification(notificationId: number): Promise<boolean> {
  const result = await db.delete(notifications)
    .where(eq(notifications.id, notificationId))
    .returning({ id: notifications.id })
  return result.length > 0
}

/** Get the creator (admin) info for a notification. */
export async function getNotificationCreator(notificationId: number) {
  const [row] = await db
    .select({
      notificationId: notifications.id,
      userId: users.id,
      username: users.username,
      name: users.name
    })
    .from(notifications)
    .innerJoin(users, eq(notifications.createdBy, users.id))
    .where(eq(notifications.id, notificationId))
    .limit(1)
  return row ?? null
}

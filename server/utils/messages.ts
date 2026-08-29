import { eq, desc, count, or, and, ne, isNull, sql } from 'drizzle-orm'
import { db } from './db'
import { privateMessages, users } from '../database/schema'
import { sendToUser } from './wsRegistry'

export type MessageRow = typeof privateMessages.$inferSelect

export interface ContactInfo {
  id: number
  username: string
  name: string | null
  avatarPath: string | null
  lastMessageContent: string | null
  lastMessageAt: Date | null
  lastMessageFromMe: boolean
  unreadCount: number
  online: boolean
}

export interface ChatMessage {
  id: number
  senderId: number
  receiverId: number
  content: string
  readAt: Date | null
  createdAt: Date
}

/** Send a private message from one user to another. Pushes via WebSocket if recipient is online. */
export async function sendPrivateMessage(input: {
  senderId: number
  receiverId: number
  content: string
}): Promise<MessageRow> {
  const [row] = await db.insert(privateMessages).values({
    senderId: input.senderId,
    receiverId: input.receiverId,
    content: input.content
  }).returning()
  if (!row) throw new Error('Failed to send message')

  // Push to the recipient in real-time
  sendToUser(input.receiverId, {
    type: 'message:new',
    data: {
      id: row.id,
      senderId: row.senderId,
      receiverId: row.receiverId,
      content: row.content,
      readAt: row.readAt,
      createdAt: row.createdAt
    }
  })

  // Also echo back to the sender (for multi-tab sync)
  sendToUser(input.senderId, {
    type: 'message:sent',
    data: {
      id: row.id,
      senderId: row.senderId,
      receiverId: row.receiverId,
      content: row.content,
      readAt: row.readAt,
      createdAt: row.createdAt
    }
  })

  return row
}

/**
 * Get the contact list for a user, ordered by most recent message.
 * Each contact includes the last message preview and unread count.
 */
export async function getContactList(userId: number): Promise<ContactInfo[]> {
  // Get all users that have exchanged messages with this user (excluding deleted users)
  const contactRows = await db
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      avatarPath: users.avatarPath
    })
    .from(users)
    .where(
      and(
        ne(users.id, userId),
        isNull(users.deletedAt),
        // User must have exchanged at least one message
        or(
          // User received a message from this contact
          sql`EXISTS (
            SELECT 1 FROM private_messages pm
            WHERE pm.receiver_id = ${userId} AND pm.sender_id = ${users.id}
          )`,
          // User sent a message to this contact
          sql`EXISTS (
            SELECT 1 FROM private_messages pm
            WHERE pm.sender_id = ${userId} AND pm.receiver_id = ${users.id}
          )`
        )
      )
    )
    .orderBy(users.username)

  const contacts: ContactInfo[] = []
  for (const c of contactRows) {
    // Get last message between this pair
    const [lastMsg] = await db
      .select()
      .from(privateMessages)
      .where(
        or(
          and(
            eq(privateMessages.senderId, userId),
            eq(privateMessages.receiverId, c.id)
          ),
          and(
            eq(privateMessages.senderId, c.id),
            eq(privateMessages.receiverId, userId)
          )
        )
      )
      .orderBy(desc(privateMessages.createdAt))
      .limit(1)

    // Count unread messages from this contact
    const [unreadRow] = await db
      .select({ value: count() })
      .from(privateMessages)
      .where(
        and(
          eq(privateMessages.senderId, c.id),
          eq(privateMessages.receiverId, userId),
          isNull(privateMessages.readAt)
        )
      )

    contacts.push({
      id: c.id,
      username: c.username,
      name: c.name,
      avatarPath: c.avatarPath,
      lastMessageContent: lastMsg?.content ?? null,
      lastMessageAt: lastMsg?.createdAt ?? null,
      lastMessageFromMe: lastMsg?.senderId === userId,
      unreadCount: Number(unreadRow?.value ?? 0),
      online: false // Will be set by the caller using wsRegistry
    })
  }

  // Sort by last message time (most recent first)
  contacts.sort((a, b) => {
    if (!a.lastMessageAt && !b.lastMessageAt) return 0
    if (!a.lastMessageAt) return 1
    if (!b.lastMessageAt) return -1
    return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  })

  return contacts
}

/** Get paginated message history between two users (newest first, for display). */
export async function getMessageHistory(
  userId: number,
  peerId: number,
  offset: number,
  limit: number
): Promise<{ rows: ChatMessage[], total: number }> {
  const rows = await db
    .select()
    .from(privateMessages)
    .where(
      or(
        and(
          eq(privateMessages.senderId, userId),
          eq(privateMessages.receiverId, peerId)
        ),
        and(
          eq(privateMessages.senderId, peerId),
          eq(privateMessages.receiverId, userId)
        )
      )
    )
    .orderBy(desc(privateMessages.createdAt))
    .limit(limit)
    .offset(offset)

  const [countRow] = await db
    .select({ value: count() })
    .from(privateMessages)
    .where(
      or(
        and(
          eq(privateMessages.senderId, userId),
          eq(privateMessages.receiverId, peerId)
        ),
        and(
          eq(privateMessages.senderId, peerId),
          eq(privateMessages.receiverId, userId)
        )
      )
    )

  return {
    rows: rows.map(r => ({
      id: r.id,
      senderId: r.senderId,
      receiverId: r.receiverId,
      content: r.content,
      readAt: r.readAt,
      createdAt: r.createdAt
    })),
    total: Number(countRow?.value ?? 0)
  }
}

/** Mark all messages from peerId as read by userId. */
export async function markMessagesRead(userId: number, peerId: number): Promise<number> {
  const result = await db.update(privateMessages)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(privateMessages.senderId, peerId),
        eq(privateMessages.receiverId, userId),
        isNull(privateMessages.readAt)
      )
    )
    .returning({ id: privateMessages.id })

  // Notify the sender that their messages were read
  if (result.length > 0) {
    sendToUser(peerId, {
      type: 'message:read',
      data: { peerId: userId, readCount: result.length }
    })
  }

  return result.length
}

/** Count total unread messages for a user. */
export async function countUnreadMessages(userId: number): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(privateMessages)
    .where(
      and(
        eq(privateMessages.receiverId, userId),
        isNull(privateMessages.readAt)
      )
    )
  return Number(row?.value ?? 0)
}

/** Search for users to start a new conversation (exclude self and deleted users). */
export async function searchUsers(userId: number, query: string, limit = 10) {
  const pattern = `%${query}%`
  const rows = await db
    .select({
      id: users.id,
      username: users.username,
      name: users.name,
      avatarPath: users.avatarPath,
      email: users.email
    })
    .from(users)
    .where(
      and(
        ne(users.id, userId),
        isNull(users.deletedAt),
        eq(users.isActive, true),
        or(
          sql`${users.username} ILIKE ${pattern}`,
          sql`${users.name} ILIKE ${pattern}`,
          sql`${users.email} ILIKE ${pattern}`
        )
      )
    )
    .limit(limit)
    .orderBy(users.username)

  return rows
}

/** Get the user IDs that have exchanged messages with the given user (for presence broadcasts). */
export async function getContactUserIds(userId: number): Promise<number[]> {
  const sent = await db.selectDistinct({ id: privateMessages.receiverId })
    .from(privateMessages)
    .where(eq(privateMessages.senderId, userId))
  const received = await db.selectDistinct({ id: privateMessages.senderId })
    .from(privateMessages)
    .where(eq(privateMessages.receiverId, userId))
  const ids = new Set<number>()
  for (const r of sent) ids.add(r.id)
  for (const r of received) ids.add(r.id)
  return Array.from(ids)
}

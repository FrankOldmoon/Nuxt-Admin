import { pool } from '../database'
import { InMemoryRealtimeBus, createRealtimeBus, type RealtimeBus, type RealtimeEnvelope } from '../core/realtimeBus'
import { broadcastToAll, markRemotePresence, sendToUser } from './wsRegistry'

/**
 * Application-wide realtime fanout. Local peers are always served directly;
 * the bus adds cross-instance delivery when `REALTIME_DRIVER=postgres`
 * (PostgreSQL LISTEN/NOTIFY, no extra service required).
 */
let busPromise: Promise<RealtimeBus> | null = null

function handleEnvelope(envelope: RealtimeEnvelope): void {
  if (envelope.kind === 'user' && envelope.userId) {
    sendToUser(envelope.userId, envelope.data)
    return
  }
  if (envelope.kind === 'all') {
    broadcastToAll(envelope.data)
    return
  }
  if (envelope.kind === 'presence' && envelope.userId) {
    const online = !!(envelope.data as { online?: boolean } | undefined)?.online
    markRemotePresence(envelope.userId, envelope.instanceId, online)
  }
}

async function initBus(): Promise<RealtimeBus> {
  const bus = createRealtimeBus({
    driver: process.env.REALTIME_DRIVER ?? 'memory',
    pool,
    channel: process.env.REALTIME_CHANNEL ?? 'app_realtime'
  })
  // Local peers are already served before publishing; only remote instances
  // need the subscription. In-memory has no remote instances.
  if (!(bus instanceof InMemoryRealtimeBus)) {
    await bus.subscribe(handleEnvelope)
  }
  return bus
}

export function getRealtimeBus(): Promise<RealtimeBus> {
  if (!busPromise) {
    busPromise = initBus().catch((error) => {
      busPromise = null
      console.error('[realtime] failed to initialise bus:', error)
      throw error
    })
  }
  return busPromise
}

/** Deliver locally and fan out to other instances. */
export async function publishToUser(userId: number, data: unknown): Promise<void> {
  sendToUser(userId, data)
  try {
    await (await getRealtimeBus()).publish({ kind: 'user', userId, data })
  } catch {
    // Cross-instance delivery is best-effort; local delivery already happened.
  }
}

/** Deliver to every local peer and broadcast to other instances. */
export async function publishToAll(data: unknown): Promise<void> {
  broadcastToAll(data)
  try {
    await (await getRealtimeBus()).publish({ kind: 'all', data })
  } catch {
    // Best-effort fanout.
  }
}

/**
 * Announce a user's presence to other instances (internal bookkeeping) and to
 * their contacts (client-visible `presence:update`).
 */
export async function announcePresence(
  userId: number,
  online: boolean,
  contactIds: readonly number[]
): Promise<void> {
  try {
    await (await getRealtimeBus()).publish({ kind: 'presence', userId, data: { online } })
  } catch {
    // Presence bookkeeping is best-effort.
  }
  for (const contactId of contactIds) {
    await publishToUser(contactId, { type: 'presence:update', data: { userId, online } })
  }
}

// Minimal Peer interface matching the crossws Peer API (send, id, context, etc.)
// Avoids direct crossws dependency which may not be resolvable as a direct import.
export interface WSPeer {
  id: string
  send(data: string): void
  context: Record<string, unknown>
  request: Request
  close(code?: number, reason?: string): void
}

// In-memory WebSocket connection registry: userId → Set of peers
// A user may have multiple connections (multiple tabs / devices).
const registry = new Map<number, Set<WSPeer>>()

export function registerPeer(userId: number, peer: WSPeer): void {
  let peers = registry.get(userId)
  if (!peers) {
    peers = new Set()
    registry.set(userId, peers)
  }
  peers.add(peer)
}

export function unregisterPeer(userId: number, peer: WSPeer): void {
  const peers = registry.get(userId)
  if (!peers) return
  peers.delete(peer)
  if (peers.size === 0) {
    registry.delete(userId)
  }
}

export function isUserOnline(userId: number): boolean {
  const peers = registry.get(userId)
  return !!peers && peers.size > 0
}

/** Send a JSON message to all peers of a given user. Returns the number of peers reached. */
export function sendToUser(userId: number, data: unknown): number {
  const peers = registry.get(userId)
  if (!peers || peers.size === 0) return 0
  const payload = JSON.stringify(data)
  let count = 0
  for (const peer of peers) {
    try {
      peer.send(payload)
      count++
    } catch {
      // Peer might be closed; remove it
      peers.delete(peer)
    }
  }
  if (peers.size === 0) {
    registry.delete(userId)
  }
  return count
}

/** Broadcast a JSON message to all connected users. Returns the total number of peers reached. */
export function broadcastToAll(data: unknown): number {
  const payload = JSON.stringify(data)
  let count = 0
  for (const [userId, peers] of registry) {
    for (const peer of peers) {
      try {
        peer.send(payload)
        count++
      } catch {
        peers.delete(peer)
      }
    }
    if (peers.size === 0) {
      registry.delete(userId)
    }
  }
  return count
}

/** Get all online user IDs. */
export function getOnlineUserIds(): number[] {
  return Array.from(registry.keys())
}

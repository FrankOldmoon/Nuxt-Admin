import type { Ref } from 'vue'

export interface WSMessage {
  type: string
  data: Record<string, unknown>
}

export interface NotificationData {
  id: number
  title: string
  content: string
  createdBy: number
  createdAt: string
  read: boolean
}

export interface MessageData {
  id: number
  senderId: number
  receiverId: number
  content: string
  readAt: string | null
  createdAt: string
}

type NotificationHandler = (notification: NotificationData) => void
type MessageHandler = (message: MessageData) => void
type ReadHandler = (peerId: number, readCount: number) => void
type CountHandler = (count: number) => void
type PresenceHandler = (userId: number, online: boolean) => void

let ws: WebSocket | null = null
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let reconnectAttempts = 0
const MAX_RECONNECT_DELAY = 30000

// Cached refs (lazily initialized inside useWebSocket to stay in setup context)
let _connected: Ref<boolean> | null = null
let _unreadNotifications: Ref<number> | null = null
let _unreadMessages: Ref<number> | null = null

// Event handler registries (module-level Sets are fine)
const notificationHandlers = new Set<NotificationHandler>()
const messageHandlers = new Set<MessageHandler>()
const messageSentHandlers = new Set<MessageHandler>()
const messageReadHandlers = new Set<ReadHandler>()
const notificationUnreadHandlers = new Set<CountHandler>()
const messageUnreadHandlers = new Set<CountHandler>()
const presenceHandlers = new Set<PresenceHandler>()

function getWsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${protocol}//${window.location.host}/api/ws`
}

function connect() {
  // SSR guard: WebSocket is client-only
  if (import.meta.server) return
  if (typeof window === 'undefined') return
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    return
  }

  try {
    ws = new WebSocket(getWsUrl())
  } catch {
    scheduleReconnect()
    return
  }

  ws.onopen = () => {
    reconnectAttempts = 0
    if (_connected) _connected.value = true
  }

  ws.onmessage = (event) => {
    let msg: WSMessage
    try {
      msg = JSON.parse(event.data)
    } catch {
      return
    }

    switch (msg.type) {
      case 'connected':
        if (_unreadNotifications) _unreadNotifications.value = Number(msg.data.unreadNotifications ?? 0)
        if (_unreadMessages) _unreadMessages.value = Number(msg.data.unreadMessages ?? 0)
        break
      case 'notification:new': {
        const notif = msg.data as unknown as NotificationData
        if (_unreadNotifications) _unreadNotifications.value++
        notificationHandlers.forEach(h => h(notif))
        break
      }
      case 'notification:unreadCount':
        if (_unreadNotifications) _unreadNotifications.value = Number(msg.data.count ?? 0)
        notificationUnreadHandlers.forEach(h => h(_unreadNotifications?.value ?? 0))
        break
      case 'message:new': {
        const m = msg.data as unknown as MessageData
        if (_unreadMessages) _unreadMessages.value++
        messageHandlers.forEach(h => h(m))
        break
      }
      case 'message:sent': {
        const m = msg.data as unknown as MessageData
        messageSentHandlers.forEach(h => h(m))
        break
      }
      case 'message:read': {
        const peerId = Number(msg.data.peerId)
        const readCount = Number(msg.data.readCount)
        messageReadHandlers.forEach(h => h(peerId, readCount))
        break
      }
      case 'message:unreadCount':
        if (_unreadMessages) _unreadMessages.value = Number(msg.data.count ?? 0)
        messageUnreadHandlers.forEach(h => h(_unreadMessages?.value ?? 0))
        break
      case 'presence:update': {
        const uid = Number(msg.data.userId)
        const online = Boolean(msg.data.online)
        presenceHandlers.forEach(h => h(uid, online))
        break
      }
    }
  }

  ws.onclose = () => {
    if (_connected) _connected.value = false
    ws = null
    scheduleReconnect()
  }

  ws.onerror = () => {
    // onclose will handle reconnect
  }
}

function scheduleReconnect() {
  // SSR guard: setTimeout on server leaves dangling timers
  if (import.meta.server) return
  if (reconnectTimer) clearTimeout(reconnectTimer)
  reconnectAttempts++
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY)
  reconnectTimer = setTimeout(() => connect(), delay)
}

function send(type: string, data: Record<string, unknown>) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, data }))
  }
}

function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (ws) {
    ws.onclose = null
    ws.close()
    ws = null
  }
  if (_connected) _connected.value = false
  reconnectAttempts = 0
}

export function useWebSocket() {
  const { isLoggedIn } = useAuth()

  // Initialize refs inside setup context
  if (!_connected) {
    _connected = useState<boolean>('ws:connected', () => false)
    _unreadNotifications = useState<number>('ws:unreadNotifications', () => 0)
    _unreadMessages = useState<number>('ws:unreadMessages', () => 0)
  }

  // Auto-connect when logged in, disconnect when logged out
  // Only run on client; SSR must never trigger WebSocket connection setup
  if (import.meta.client) {
    watch(isLoggedIn, (loggedIn) => {
      if (loggedIn) {
        connect()
      } else {
        disconnect()
      }
    }, { immediate: true })
  }

  function markNotificationRead(notificationId: number) {
    send('notification:markRead', { notificationId })
  }

  function markAllNotificationsRead() {
    send('notification:markAllRead', {})
  }

  function sendMessage(receiverId: number, content: string) {
    send('message:send', { receiverId, content })
  }

  function markMessagesRead(peerId: number) {
    send('message:markRead', { peerId })
  }

  function onNotification(handler: NotificationHandler) {
    notificationHandlers.add(handler)
    onScopeDispose(() => notificationHandlers.delete(handler))
  }

  function onMessage(handler: MessageHandler) {
    messageHandlers.add(handler)
    onScopeDispose(() => messageHandlers.delete(handler))
  }

  function onMessageSent(handler: MessageHandler) {
    messageSentHandlers.add(handler)
    onScopeDispose(() => messageSentHandlers.delete(handler))
  }

  function onMessageRead(handler: ReadHandler) {
    messageReadHandlers.add(handler)
    onScopeDispose(() => messageReadHandlers.delete(handler))
  }

  function onPresence(handler: PresenceHandler) {
    presenceHandlers.add(handler)
    onScopeDispose(() => presenceHandlers.delete(handler))
  }

  return {
    connected: _connected!,
    unreadNotifications: _unreadNotifications!,
    unreadMessages: _unreadMessages!,
    markNotificationRead,
    markAllNotificationsRead,
    sendMessage,
    markMessagesRead,
    onNotification,
    onMessage,
    onMessageSent,
    onMessageRead,
    onPresence
  }
}

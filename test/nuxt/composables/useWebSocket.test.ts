import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ref } from 'vue'

const { stateMap, isLoggedIn, watchCalls } = vi.hoisted(() => ({
  stateMap: new Map<string, { value: unknown }>(),
  isLoggedIn: { value: false } as { value: boolean },
  watchCalls: [] as Array<{ cb: (v: unknown) => void; opts?: { immediate?: boolean } }>
}))

class MockWebSocket {
  static instances: MockWebSocket[] = []
  static OPEN = 1
  static CONNECTING = 0
  readyState = 0
  url = ''
  sent: unknown[] = []
  onopen: (() => void) | null = null
  onmessage: ((e: { data: string }) => void) | null = null
  onclose: (() => void) | null = null
  onerror: (() => void) | null = null
  constructor(url: string) {
    this.url = url
    MockWebSocket.instances.push(this)
  }
  send(data: string) {
    this.sent.push(JSON.parse(data))
  }
  close() {
    this.onclose = null
  }
}

mockNuxtImport('useState', () => (key: string, init?: unknown) => {
  if (!stateMap.has(key)) {
    stateMap.set(key, ref(typeof init === 'function' ? (init as () => unknown)() : init))
  }
  return stateMap.get(key)!
})
mockNuxtImport('useAuth', () => () => ({ isLoggedIn }))
mockNuxtImport('watch', () => (source: unknown, cb: (v: unknown) => void, opts?: { immediate?: boolean }) => {
  watchCalls.push({ cb, opts })
  if (opts?.immediate) cb((source as { value: unknown }).value)
})
mockNuxtImport('onScopeDispose', () => () => {})

import { useWebSocket } from '~/composables/useWebSocket'

beforeEach(() => {
  vi.stubGlobal('WebSocket', MockWebSocket)
  vi.stubGlobal('window', { location: { protocol: 'http:', host: 'localhost:3000' } })
  stateMap.clear()
  isLoggedIn.value = false
  watchCalls.length = 0
  MockWebSocket.instances.length = 0
})

const triggerLogin = () => {
  isLoggedIn.value = true
  watchCalls[watchCalls.length - 1]!.cb(true)
}

describe('useWebSocket', () => {
  it('does not establish a connection when logged out', () => {
    useWebSocket()
    expect(MockWebSocket.instances.length).toBe(0)
  })

  it('establishes a ws connection pointing at /api/ws after login', () => {
    useWebSocket()
    triggerLogin()
    expect(MockWebSocket.instances.length).toBe(1)
    expect(MockWebSocket.instances[0]!.url).toBe('ws://localhost:3000/api/ws')
  })

  it('onopen sets connected to true', () => {
    const ws = useWebSocket()
    expect(ws.connected.value).toBe(false)
    triggerLogin()
    MockWebSocket.instances[0]!.onopen?.()
    expect(ws.connected.value).toBe(true)
  })

  it('on notification:new, fires the handler and increments the unread count', () => {
    const ws = useWebSocket()
    const handler = vi.fn()
    ws.onNotification(handler)
    triggerLogin()
    MockWebSocket.instances[0]!.onmessage?.({
      data: JSON.stringify({ type: 'notification:new', data: { id: 1, title: 'hi' } })
    })
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: 1, title: 'hi' }))
    expect(ws.unreadNotifications.value).toBe(1)
  })

  it('on message:new, fires the handler and increments the unread message count', () => {
    const ws = useWebSocket()
    const handler = vi.fn()
    ws.onMessage(handler)
    triggerLogin()
    MockWebSocket.instances[0]!.onmessage?.({
      data: JSON.stringify({ type: 'message:new', data: { id: 9, senderId: 2, content: 'yo' } })
    })
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: 9, content: 'yo' }))
    expect(ws.unreadMessages.value).toBe(1)
  })

  it('presence:update triggers the presence handler', () => {
    const ws = useWebSocket()
    const handler = vi.fn()
    ws.onPresence(handler)
    triggerLogin()
    MockWebSocket.instances[0]!.onmessage?.({
      data: JSON.stringify({ type: 'presence:update', data: { userId: 7, online: true } })
    })
    expect(handler).toHaveBeenCalledWith(7, true)
  })

  it('sendMessage serializes to a json message', () => {
    const ws = useWebSocket()
    triggerLogin()
    // simulate an open connection (a real WebSocket becomes OPEN after onopen)
    const sock = MockWebSocket.instances[0]!
    sock.readyState = MockWebSocket.OPEN
    ws.sendMessage(42, 'hello')
    expect(sock.sent).toEqual([
      { type: 'message:send', data: { receiverId: 42, content: 'hello' } }
    ])
  })

  it('silently ignores unparseable JSON', () => {
    const ws = useWebSocket()
    triggerLogin()
    expect(() => MockWebSocket.instances[0]!.onmessage?.({ data: 'not-json' })).not.toThrow()
  })

  it('logout triggers disconnect and clears the connection', () => {
    const ws = useWebSocket()
    triggerLogin()
    expect(MockWebSocket.instances.length).toBe(1)
    watchCalls[watchCalls.length - 1]!.cb(false)
    expect(ws.connected.value).toBe(false)
  })
})
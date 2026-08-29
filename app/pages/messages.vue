<script setup lang="ts">
import { useWebSocket, type MessageData } from '~/composables/useWebSocket'

const { t } = useI18n()
const toast = useToast()
const { user } = useAuth()
const { sendMessage, markMessagesRead, onMessage, onMessageSent, onMessageRead, onPresence } = useWebSocket()

definePageMeta({ middleware: 'auth' })
useSeoMeta({ title: () => t('messages.title') })

interface Contact {
  id: number
  username: string
  name: string | null
  avatarPath: string | null
  lastMessageContent: string | null
  lastMessageAt: string | null
  lastMessageFromMe: boolean
  unreadCount: number
  online: boolean
}

interface ChatMsg {
  id: number
  senderId: number
  receiverId: number
  content: string
  readAt: string | null
  createdAt: string
}

// --- Contacts panel ---
// Use useState so data persists across SSR hydration
const contacts = useState<Contact[]>('messages:contacts-data', () => [])
const contactsLoading = ref(false)
const selectedContactId = ref<number | null>(null)

const selectedContact = computed(() =>
  contacts.value.find(c => c.id === selectedContactId.value) ?? null
)

async function loadContacts() {
  contactsLoading.value = true
  try {
    const data = await cGet<{ contacts: Contact[] }>('/api/messages/contacts')
    // Preserve the currently selected contact's online status update
    const prevSelected = selectedContactId.value
    contacts.value = data.contacts
    if (prevSelected && !contacts.value.find(c => c.id === prevSelected)) {
      selectedContactId.value = null
    }
  } catch (e: unknown) {
    toast.add({ title: extractErrorMessage(e, t('messages.errors.loadFailed')), color: 'error' })
  } finally {
    contactsLoading.value = false
  }
}

await useAsyncData('messages:contacts', async () => { await loadContacts(); return null })

// --- User search ---
const searchQuery = ref('')
const searchResults = ref<Array<{ id: number, username: string, name: string | null, avatarPath: string | null }>>([])
const searching = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | null = null

watch(searchQuery, (q) => {
  if (searchTimer) clearTimeout(searchTimer)
  if (!q.trim()) {
    searchResults.value = []
    return
  }
  searchTimer = setTimeout(async () => {
    searching.value = true
    try {
      const data = await cGet<{ users: typeof searchResults.value }>('/api/messages/search', { q: q.trim() })
      searchResults.value = data.users
    } catch {
      searchResults.value = []
    } finally {
      searching.value = false
    }
  }, 300)
})

function startChat(u: { id: number, username: string, name: string | null, avatarPath: string | null }) {
  searchQuery.value = ''
  searchResults.value = []
  // Check if contact already exists
  const existing = contacts.value.find(c => c.id === u.id)
  if (!existing) {
    // Add contact with the user info from search results
    contacts.value.unshift({
      id: u.id,
      username: u.username,
      name: u.name,
      avatarPath: u.avatarPath,
      lastMessageContent: null,
      lastMessageAt: null,
      lastMessageFromMe: false,
      unreadCount: 0,
      online: false
    })
  }
  selectContact(u.id)
}

// --- Chat panel ---
const messages = ref<ChatMsg[]>([])
const messagesLoading = ref(false)
const messageInput = ref('')
const sending = ref(false)
const chatScroll = ref<HTMLElement | null>(null)

async function selectContact(contactId: number) {
  selectedContactId.value = contactId
  messages.value = []
  messagesLoading.value = true
  try {
    const data = await cGet<{ messages: ChatMsg[] }>(`/api/messages/history/${contactId}`, { pageSize: 50 })
    // Reverse to show oldest first
    messages.value = data.messages.reverse()

    // Mark messages from this contact as read
    const contact = contacts.value.find(c => c.id === contactId)
    if (contact && contact.unreadCount > 0) {
      markMessagesRead(contactId)
      contact.unreadCount = 0
    }
  } catch (e: unknown) {
    toast.add({ title: extractErrorMessage(e, t('messages.errors.loadFailed')), color: 'error' })
  } finally {
    messagesLoading.value = false
    // Wait for DOM to render messages, then scroll to bottom
    await nextTick()
    await nextTick()
    scrollToBottom()
  }
}

function scrollToBottom() {
  if (chatScroll.value) {
    chatScroll.value.scrollTop = chatScroll.value.scrollHeight
  }
}

async function send() {
  const content = messageInput.value.trim()
  if (!content || !selectedContactId.value) return
  sending.value = true
  messageInput.value = ''

  // Optimistic: add message immediately
  const tempId = Date.now()
  const optimisticMsg: ChatMsg = {
    id: tempId,
    senderId: user.value?.id ?? 0,
    receiverId: selectedContactId.value,
    content,
    readAt: null,
    createdAt: new Date().toISOString()
  }
  messages.value.push(optimisticMsg)
  await nextTick()
  scrollToBottom()

  // Send via WebSocket
  sendMessage(selectedContactId.value, content)

  // Update contact list preview
  const contact = contacts.value.find(c => c.id === selectedContactId.value)
  if (contact) {
    contact.lastMessageContent = content
    contact.lastMessageAt = optimisticMsg.createdAt
    contact.lastMessageFromMe = true
    // Move to top
    const idx = contacts.value.indexOf(contact)
    if (idx > 0) {
      contacts.value.splice(idx, 1)
      contacts.value.unshift(contact)
    }
  }

  sending.value = false
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    send()
  }
}

// --- Real-time handlers ---
onMessage((msg: MessageData) => {
  // If the message is from the currently selected contact, add it to the chat
  if (msg.senderId === selectedContactId.value) {
    messages.value.push({
      id: msg.id,
      senderId: msg.senderId,
      receiverId: msg.receiverId,
      content: msg.content,
      readAt: msg.readAt,
      createdAt: msg.createdAt
    })
    nextTick(() => scrollToBottom())
    // Mark as read immediately since we're viewing the conversation
    markMessagesRead(msg.senderId)
  }

  // Update contact list
  const contact = contacts.value.find(c => c.id === msg.senderId)
  if (contact) {
    contact.lastMessageContent = msg.content
    contact.lastMessageAt = msg.createdAt
    contact.lastMessageFromMe = false
    if (msg.senderId !== selectedContactId.value) {
      contact.unreadCount++
    }
    // Move to top
    const idx = contacts.value.indexOf(contact)
    if (idx > 0) {
      contacts.value.splice(idx, 1)
      contacts.value.unshift(contact)
    }
  } else {
    // New contact - reload contacts
    loadContacts()
  }
})

onMessageSent((msg: MessageData) => {
  // Replace the optimistic message with the real one
  const idx = messages.value.findIndex(m => m.senderId === msg.senderId && m.receiverId === msg.receiverId && m.content === msg.content && m.id > 1000000000000)
  if (idx >= 0) {
    messages.value[idx] = {
      id: msg.id,
      senderId: msg.senderId,
      receiverId: msg.receiverId,
      content: msg.content,
      readAt: msg.readAt,
      createdAt: msg.createdAt
    }
  }
})

onMessageRead((peerId: number) => {
  // Mark messages sent to peerId as read
  messages.value.forEach(m => {
    if (m.receiverId === peerId && !m.readAt) {
      m.readAt = new Date().toISOString()
    }
  })
})

// Update online status in real-time via WebSocket presence events
onPresence((userId, online) => {
  const contact = contacts.value.find(c => c.id === userId)
  if (contact) {
    contact.online = online
  }
})
</script>

<template>
  <UContainer class="py-6">
    <div class="mb-4 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-highlighted">
          {{ t('messages.title') }}
        </h1>
        <p class="text-muted">
          {{ t('messages.subtitle') }}
        </p>
      </div>
    </div>

    <div
      class="flex gap-4 rounded-lg border border-default bg-default"
      style="height: calc(100vh - 200px)"
    >
      <!-- Left: Contacts panel -->
      <div class="flex w-80 flex-col border-r border-default">
        <!-- Search box -->
        <div class="border-b border-default p-3">
          <UInput
            v-model="searchQuery"
            :placeholder="t('messages.searchUsers')"
            icon="i-lucide-search"
            class="w-full"
            :loading="searching"
          />
          <!-- Search results -->
          <div
            v-if="searchResults.length > 0"
            class="mt-2 max-h-60 overflow-auto rounded border border-default"
          >
            <button
              v-for="u in searchResults"
              :key="u.id"
              class="flex w-full items-center gap-2 border-b border-default p-2 text-left transition hover:bg-elevated last:border-0"
              @click="startChat(u)"
            >
              <UAvatar
                :src="u.avatarPath ? `/api/files/serve/${u.avatarPath}` : undefined"
                :alt="u.username"
                size="sm"
              />
              <div class="min-w-0 flex-1">
                <p class="truncate text-sm font-medium">
                  {{ u.username }}
                </p>
                <p class="truncate text-xs text-muted">
                  {{ u.name || u.username }}
                </p>
              </div>
            </button>
          </div>
        </div>

        <!-- Contact list -->
        <div class="flex-1 overflow-auto">
          <div
            v-if="contactsLoading && contacts.length === 0"
            class="py-8 text-center text-muted"
          >
            {{ t('common.loading') }}
          </div>
          <div
            v-else-if="contacts.length === 0 && !searchQuery"
            class="py-8 text-center text-muted"
          >
            {{ t('messages.noContacts') }}
          </div>
          <button
            v-for="c in contacts"
            :key="c.id"
            class="flex w-full items-center gap-3 border-b border-default p-3 text-left transition hover:bg-elevated"
            :class="selectedContactId === c.id ? 'bg-elevated' : ''"
            @click="selectContact(c.id)"
          >
            <div class="relative">
              <UAvatar
                :src="c.avatarPath ? `/api/files/serve/${c.avatarPath}` : undefined"
                :alt="c.username"
                size="md"
              />
              <span
                v-if="c.online"
                class="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-default bg-success"
              />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between">
                <p class="truncate text-sm font-medium text-highlighted">
                  {{ c.username || t('messages.startChat') }}
                </p>
                <span
                  v-if="c.lastMessageAt"
                  class="ml-2 flex-shrink-0 text-xs text-muted"
                >
                  {{ new Date(c.lastMessageAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
                </span>
              </div>
              <div class="flex items-center justify-between gap-2">
                <p class="truncate text-xs text-muted">
                  <span v-if="c.lastMessageFromMe">You: </span>{{ c.lastMessageContent || '—' }}
                </p>
                <UBadge
                  v-if="c.unreadCount > 0"
                  color="primary"
                  size="sm"
                  :label="String(c.unreadCount)"
                />
              </div>
            </div>
          </button>
        </div>
      </div>

      <!-- Right: Chat panel -->
      <div class="flex flex-1 flex-col">
        <template v-if="selectedContact">
          <!-- Chat header -->
          <div class="flex items-center gap-3 border-b border-default p-3">
            <UAvatar
              :src="selectedContact.avatarPath ? `/api/files/serve/${selectedContact.avatarPath}` : undefined"
              :alt="selectedContact.username"
              size="sm"
            />
            <div class="flex-1">
              <p class="font-medium text-highlighted">
                {{ selectedContact.username || '...' }}
              </p>
              <p class="text-xs text-muted">
                <span :class="selectedContact.online ? 'text-success' : ''">
                  {{ selectedContact.online ? t('messages.online') : t('messages.offline') }}
                </span>
              </p>
            </div>
          </div>

          <!-- Messages -->
          <div
            ref="chatScroll"
            class="flex-1 overflow-auto p-4"
          >
            <div
              v-if="messagesLoading"
              class="py-8 text-center text-muted"
            >
              {{ t('common.loading') }}
            </div>
            <div
              v-else-if="messages.length === 0"
              class="py-8 text-center text-muted"
            >
              {{ t('messages.noMessages') }}
            </div>
            <div
              v-else
              class="space-y-2"
            >
              <div
                v-for="msg in messages"
                :key="msg.id"
                class="flex"
                :class="msg.senderId === user?.id ? 'justify-end' : 'justify-start'"
              >
                <div
                  class="max-w-[70%] rounded-lg px-3 py-2"
                  :class="msg.senderId === user?.id
                    ? 'bg-primary text-inverted'
                    : 'bg-elevated text-default'"
                >
                  <p class="whitespace-pre-wrap break-words text-sm">
                    {{ msg.content }}
                  </p>
                  <p
                    class="mt-1 text-xs opacity-60"
                    :class="msg.senderId === user?.id ? 'text-right' : ''"
                  >
                    {{ new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) }}
                    <span v-if="msg.senderId === user?.id && msg.readAt"> · ✓✓</span>
                  </p>
                </div>
              </div>
            </div>
          </div>

          <!-- Message input -->
          <div class="border-t border-default p-3">
            <div class="flex gap-2">
              <UInput
                v-model="messageInput"
                :placeholder="t('messages.typeMessage')"
                class="flex-1"
                @keydown="handleKeydown"
              />
              <UButton
                icon="i-lucide-send"
                color="primary"
                :label="t('messages.send')"
                :loading="sending"
                :disabled="!messageInput.trim()"
                @click="send"
              />
            </div>
          </div>
        </template>

        <!-- No contact selected -->
        <div
          v-else
          class="flex flex-1 items-center justify-center"
        >
          <div class="text-center text-muted">
            <UIcon
              name="i-lucide-message-circle"
              class="mx-auto mb-2 h-12 w-12 opacity-30"
            />
            <p>{{ t('messages.selectContact') }}</p>
          </div>
        </div>
      </div>
    </div>
  </UContainer>
</template>

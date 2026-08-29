<script setup lang="ts">
/**
 * Notifications custom dashboard page — full notification UI with WebSocket.
 *
 * Rendered at `/dashboard/notifications` when the backend registry marks the
 * `notifications` table as `custom: true`.  Talks directly to `/api/notifications/*`.
 */
import type { PaginationMeta } from '~/types/pagination'
import type { NotificationData } from '~/composables/useWebSocket'

const { t } = useI18n()
const toast = useToast()
const { isAdmin } = useAuth()
const { unreadNotifications, markNotificationRead, markAllNotificationsRead, onNotification } = useWebSocket()

interface NotificationItem {
  id: number
  title: string
  content: string
  createdBy: number
  createdAt: string
  read: boolean
}

const page = ref(1)
const pageSize = ref(10)
const pending = ref(false)
const notifications = useState<NotificationItem[]>('notifications:list-data', () => [])
const pagination = useState<PaginationMeta | null>('notifications:pagination-data', () => null)

async function loadNotifications() {
  pending.value = true
  try {
    const data = await cGet<{ notifications: NotificationItem[], pagination: PaginationMeta }>(
      '/api/notifications',
      { page: page.value, pageSize: pageSize.value }
    )
    notifications.value = data.notifications
    pagination.value = data.pagination
  } catch (e: unknown) {
    toast.add({ title: extractErrorMessage(e, t('notifications.errors.loadFailed')), color: 'error' })
  } finally {
    pending.value = false
  }
}

await useAsyncData('notifications:list', async () => { await loadNotifications(); return null })

function setPage(p: number) {
  if (p < 1) return
  page.value = p
  loadNotifications()
}

function setPageSize(s: number) {
  pageSize.value = s
  page.value = 1
  loadNotifications()
}

function markRead(n: NotificationItem) {
  if (n.read) return
  n.read = true
  markNotificationRead(n.id)
}

async function markAllRead() {
  try {
    const res = await cPost<{ count: number }>('/api/notifications/mark-all-read')
    notifications.value.forEach(n => { n.read = true })
    markAllNotificationsRead()
    toast.add({ title: t('notifications.markAllReadSuccess', { count: res.count }), color: 'success' })
  } catch (e: unknown) {
    toast.add({ title: extractErrorMessage(e, t('notifications.errors.loadFailed')), color: 'error' })
  }
}

async function deleteNotification(n: NotificationItem) {
  try {
    await cDelete(`/api/notifications/${n.id}`)
    toast.add({ title: t('notifications.deleted'), color: 'success' })
    await loadNotifications()
  } catch (e: unknown) {
    toast.add({ title: extractErrorMessage(e, t('notifications.errors.deleteFailed')), color: 'error' })
  }
}

// Real-time: new notification arrives via WebSocket
onNotification((notif: NotificationData) => {
  if (page.value === 1) {
    notifications.value.unshift({
      id: notif.id,
      title: notif.title,
      content: notif.content,
      createdBy: notif.createdBy,
      createdAt: notif.createdAt,
      read: false
    })
    if (notifications.value.length > pageSize.value) {
      notifications.value.pop()
    }
    if (pagination.value) {
      pagination.value.total++
      pagination.value.totalPages = Math.ceil(pagination.value.total / pageSize.value)
    }
  }
})

// --- Admin: create notification ---
const createModalOpen = ref(false)
const createForm = reactive({ title: '', content: '' })
const creating = ref(false)
const createError = ref('')

// Target user selection
interface SelectableUser {
  id: number
  username: string
  name: string | null
  avatarPath: string | null
}
const targetUsers = ref<SelectableUser[]>([])
const userSearchQuery = ref('')
const userSearchResults = ref<SelectableUser[]>([])
const userSearching = ref(false)
let userSearchTimer: ReturnType<typeof setTimeout> | null = null

watch(userSearchQuery, (q) => {
  if (userSearchTimer) clearTimeout(userSearchTimer)
  if (!q.trim()) {
    userSearchResults.value = []
    return
  }
  userSearchTimer = setTimeout(async () => {
    userSearching.value = true
    try {
      const data = await cGet<{ users: SelectableUser[] }>('/api/messages/search', { q: q.trim() })
      userSearchResults.value = data.users
    } catch {
      userSearchResults.value = []
    } finally {
      userSearching.value = false
    }
  }, 300)
})

function toggleTargetUser(u: SelectableUser) {
  const idx = targetUsers.value.findIndex(t => t.id === u.id)
  if (idx >= 0) {
    targetUsers.value.splice(idx, 1)
  } else {
    targetUsers.value.push(u)
  }
}

function isUserSelected(id: number): boolean {
  return !!targetUsers.value.find(t => t.id === id)
}

function removeTargetUser(id: number) {
  targetUsers.value = targetUsers.value.filter(t => t.id !== id)
}

function openCreate() {
  createForm.title = ''
  createForm.content = ''
  createError.value = ''
  targetUsers.value = []
  userSearchQuery.value = ''
  userSearchResults.value = []
  createModalOpen.value = true
}

async function createNotification() {
  createError.value = ''
  if (!createForm.title.trim() || !createForm.content.trim()) {
    createError.value = t('notifications.errors.required')
    return
  }
  creating.value = true
  try {
    await cPost('/api/notifications', {
      title: createForm.title.trim(),
      content: createForm.content.trim(),
      targetUserIds: targetUsers.value.length > 0 ? targetUsers.value.map(u => u.id) : null
    })
    toast.add({ title: t('notifications.created'), color: 'success' })
    createModalOpen.value = false
    await loadNotifications()
  } catch (e: unknown) {
    createError.value = extractErrorMessage(e, t('notifications.errors.saveFailed'))
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <UContainer class="py-10">
    <div class="mb-6 flex items-center justify-between">
      <div>
        <h1 class="text-2xl font-bold text-highlighted">
          {{ t('notifications.title') }}
        </h1>
        <p class="text-muted">
          {{ t('notifications.subtitle') }}
        </p>
      </div>
      <div class="flex gap-2">
        <UButton
          v-if="unreadNotifications > 0"
          icon="i-lucide-check-check"
          variant="soft"
          color="success"
          :label="t('notifications.markAllRead')"
          @click="markAllRead"
        />
        <UButton
          v-if="isAdmin"
          icon="i-lucide-plus"
          color="primary"
          :label="t('notifications.create')"
          @click="openCreate"
        />
      </div>
    </div>

    <div
      v-if="pending && notifications.length === 0"
      class="py-12 text-center text-muted"
    >
      {{ t('notifications.loading') }}
    </div>

    <div
      v-else-if="notifications.length === 0"
      class="py-12 text-center text-muted"
    >
      {{ t('notifications.empty') }}
    </div>

    <div
      v-else
      class="space-y-3"
    >
      <UCard
        v-for="n in notifications"
        :key="n.id"
        :class="n.read ? '' : 'ring-2 ring-primary/30'"
      >
        <div class="flex items-start justify-between gap-4">
          <div
            class="flex-1 cursor-pointer"
            @click="markRead(n)"
          >
            <div class="flex items-center gap-2">
              <UBadge
                v-if="!n.read"
                color="primary"
                variant="solid"
                size="sm"
                :label="t('notifications.unread')"
              />
              <UBadge
                v-else
                color="neutral"
                variant="subtle"
                size="sm"
                :label="t('notifications.read')"
              />
              <h3 class="text-lg font-semibold text-highlighted">
                {{ n.title }}
              </h3>
            </div>
            <p class="mt-2 whitespace-pre-wrap text-default">
              {{ n.content }}
            </p>
            <p class="mt-2 text-sm text-muted">
              {{ new Date(n.createdAt).toLocaleString() }}
            </p>
          </div>
          <div
            v-if="isAdmin"
            class="flex-shrink-0"
          >
            <BaseConfirmButton
              icon="i-lucide-trash"
              color="error"
              variant="ghost"
              :confirm-text="t('notifications.confirmDelete')"
              @confirm="deleteNotification(n)"
            />
          </div>
        </div>
      </UCard>
    </div>

    <BasePaginationBar
      v-if="pagination"
      :pagination="pagination"
      :page="page"
      :page-size="pageSize"
      class="mt-6"
      @update:page="setPage"
      @update:page-size="setPageSize"
    />

    <UModal
      v-model:open="createModalOpen"
      :title="t('notifications.createTitle')"
    >
      <template #body>
        <div class="space-y-4">
          <UFormField :label="t('notifications.fieldsTitle')">
            <UInput
              v-model="createForm.title"
              :placeholder="t('notifications.fieldsTitlePlaceholder')"
              class="w-full"
            />
          </UFormField>
          <UFormField :label="t('notifications.fieldsContent')">
            <UTextarea
              v-model="createForm.content"
              :placeholder="t('notifications.fieldsContentPlaceholder')"
              :rows="6"
              class="w-full"
            />
          </UFormField>

          <!-- Target user selection -->
          <UFormField :label="t('notifications.fieldsTargets')">
            <p class="mb-2 text-sm text-muted">
              {{ t('notifications.targetsHint') }}
            </p>
            <!-- Selected users -->
            <div
              v-if="targetUsers.length > 0"
              class="mb-2 flex flex-wrap gap-2"
            >
              <UBadge
                v-for="u in targetUsers"
                :key="u.id"
                color="primary"
                variant="soft"
                class="flex items-center gap-1"
              >
                {{ u.username }}
                <button
                  class="ml-1 opacity-60 hover:opacity-100"
                  @click="removeTargetUser(u.id)"
                >
                  <UIcon name="i-lucide-x" class="size-3" />
                </button>
              </UBadge>
            </div>
            <!-- Search input -->
            <UInput
              v-model="userSearchQuery"
              :placeholder="t('notifications.searchUsers')"
              icon="i-lucide-search"
              :loading="userSearching"
              class="w-full"
            />
            <!-- Search results -->
            <div
              v-if="userSearchResults.length > 0"
              class="mt-2 max-h-40 overflow-auto rounded border border-default"
            >
              <button
                v-for="u in userSearchResults"
                :key="u.id"
                class="flex w-full items-center gap-2 border-b border-default p-2 text-left transition hover:bg-elevated last:border-0"
                :class="isUserSelected(u.id) ? 'bg-primary/10' : ''"
                @click="toggleTargetUser(u)"
              >
                <UIcon
                  :name="isUserSelected(u.id) ? 'i-lucide-check-square' : 'i-lucide-square'"
                  :class="isUserSelected(u.id) ? 'text-primary' : 'text-muted'"
                  class="size-4 flex-shrink-0"
                />
                <UAvatar
                  :src="u.avatarPath ? `/api/files/serve/${u.avatarPath}` : undefined"
                  :alt="u.username"
                  size="xs"
                />
                <span class="text-sm">{{ u.username }}</span>
                <span
                  v-if="u.name"
                  class="text-xs text-muted"
                >({{ u.name }})</span>
              </button>
            </div>
          </UFormField>

          <p
            v-if="createError"
            class="text-sm text-error"
          >
            {{ createError }}
          </p>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-2">
          <UButton
            variant="ghost"
            :label="t('common.cancel')"
            @click="createModalOpen = false"
          />
          <UButton
            color="primary"
            icon="i-lucide-send"
            :label="t('notifications.create')"
            :loading="creating"
            @click="createNotification"
          />
        </div>
      </template>
    </UModal>
  </UContainer>
</template>

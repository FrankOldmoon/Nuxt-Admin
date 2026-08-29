<script setup lang="ts">
/**
 * Blog module — public post list page at `/blog`.
 * Renders paginated published posts with cover images. Supports keyword search,
 * and (for roles with `posts:create`) an "Add" button that opens the host's
 * post create form. Whole card is clickable → opens the post detail.
 */
const { t } = useI18n()
const route = useRoute()
const router = useRouter()
const { can } = usePermission()
const toast = useToast()

const page = ref(Number(route.query.page) || 1)
const pageSize = ref(Number(route.query.pageSize) || 9)
const search = ref(String(route.query.q ?? ''))
const searchDraft = ref(String(route.query.q ?? ''))
const categoryUrl = ref(String(route.query.category ?? ''))
const status = ref(String(route.query.status ?? 'published'))
const sort = ref(String(route.query.sort ?? 'publishedAt'))
const startDate = ref(String(route.query.startDate ?? ''))
const endDate = ref(String(route.query.endDate ?? ''))
// Working copies for the popover (applied only on "Apply").
const startDateDraft = ref(startDate.value)
const endDateDraft = ref(endDate.value)

// Reset to page 1 when search/category/status/sort/date change
watch([search, categoryUrl, status, sort, startDate, endDate], () => { page.value = 1 })

const { data, pending, error, refresh } = useBlogList(page, pageSize, search, categoryUrl, status, sort, startDate, endDate)
const { data: categories } = useBlogCategories()

const items = computed(() => data.value?.items ?? [])
const pagination = computed(() => {
  const d = data.value
  if (!d) return null
  return {
    page: d.page,
    pageSize: d.pageSize,
    total: d.total,
    totalPages: Math.ceil(d.total / d.pageSize)
  }
})

function goPage(p: number) {
  page.value = p
  router.replace({ query: { ...route.query, page: p } })
}
// Commit the search only on Enter (not on every keystroke, and not on blur —
// blur fires when clicking a category chip, causing an unwanted refetch).
function onSearchCommit() {
  const next = searchDraft.value.trim()
  if (next === search.value) return
  search.value = next
  router.replace({ query: { ...route.query, q: next || undefined, page: 1 } })
}
function onCategory(cat?: string) {
  categoryUrl.value = cat ?? ''
  router.replace({ query: { ...route.query, category: cat || undefined, page: 1 } })
}

// Toggle between published and drafts (Draft button, author/admin only).
function onToggleStatus() {
  const next = status.value === 'draft' ? 'published' : 'draft'
  status.value = next
  router.replace({ query: { ...route.query, status: next === 'published' ? undefined : next, page: 1 } })
}

// Toggle sort order: publishedAt (default) ↔ viewCount.
function onSort(next: 'publishedAt' | 'viewCount') {
  sort.value = next
  router.replace({ query: { ...route.query, sort: next === 'publishedAt' ? undefined : next, page: 1 } })
}

const dateRangeActive = computed(() => !!(startDate.value || endDate.value))

// Apply the start/end date from the popover drafts to the fetch + URL.
function onApplyDate() {
  startDate.value = startDateDraft.value.trim()
  endDate.value = endDateDraft.value.trim()
  router.replace({
    query: {
      ...route.query,
      startDate: startDate.value || undefined,
      endDate: endDate.value || undefined,
      page: 1
    }
  })
}
// Clear the date filter.
function onClearDate() {
  startDateDraft.value = ''
  endDateDraft.value = ''
  startDate.value = ''
  endDate.value = ''
  router.replace({ query: { ...route.query, startDate: undefined, endDate: undefined, page: 1 } })
}

const canViewDrafts = computed(() => can('posts', 'read'))

useSeoMeta(() => ({
  title: () => t('blog.title'),
  ogTitle: () => t('blog.title'),
  ogType: () => 'website'
}))

// --- Add form (reuses host dashboard post form) ---
const editorOpen = ref(false)
const editorMode = ref<'create' | 'update'>('create')
const editorItem = ref<Record<string, unknown> | null>(null)

function openCreate() {
  editorMode.value = 'create'
  editorItem.value = null
  editorOpen.value = true
}
async function onSaved() {
  toast.add({ title: t('dashboard.crud.createSuccess'), color: 'success' })
  await refresh(true)
}

const canEdit = computed(() => can('posts', 'update'))
const canDelete = computed(() => can('posts', 'delete'))

function openEdit(post: { id: number }) {
  editorMode.value = 'update'
  editorItem.value = { id: post.id }
  editorOpen.value = true
}

const deleting = ref(false)
async function removePost(post: { id: number }) {
  deleting.value = true
  try {
    await cPost('/api/dashboard/data/posts/batch', {
      action: 'soft-delete',
      ids: [post.id]
    })
    toast.add({ title: t('dashboard.crud.deleted'), color: 'primary' })
    await refresh(true)
  } catch (e) {
    toast.add({ title: (e as any)?.data?.message || t('dashboard.crud.deleteFailed'), color: 'error' })
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <UContainer class="py-10">
    <header class="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">{{ t('blog.title') }}</h1>
        <p class="mt-2 text-muted">{{ t('blog.subtitle') }}</p>
      </div>

      <div class="flex flex-wrap items-center gap-3">
        <!-- Date range filter (to the left of the search box) -->
        <UPopover>
          <UButton
            size="sm"
            color="neutral"
            :variant="dateRangeActive ? 'solid' : 'ghost'"
            icon="i-lucide-calendar-range"
            :label="t('blog.dateFilter')"
            :title="t('blog.dateFilter')"
          />
          <template #content>
            <div class="w-64 space-y-4 p-4">
              <div>
                <div class="mb-1.5 text-xs text-dimmed">{{ t('blog.startDate') }}</div>
                <UInput v-model="startDateDraft" type="date" size="sm" />
              </div>
              <div>
                <div class="mb-1.5 text-xs text-dimmed">{{ t('blog.endDate') }}</div>
                <UInput v-model="endDateDraft" type="date" size="sm" />
              </div>
              <div class="flex items-center gap-2 pt-1">
                <UButton size="sm" color="primary" :label="t('blog.apply')" @click="onApplyDate" />
                <UButton size="sm" color="neutral" variant="ghost" :label="t('blog.clear')" @click="onClearDate" />
              </div>
            </div>
          </template>
        </UPopover>

        <!-- Search -->
        <UInput
          v-model="searchDraft"
          icon="i-lucide-search"
          :placeholder="t('blog.search')"
          size="sm"
          class="w-56 sm:w-64"
          @keyup.enter="onSearchCommit"
        />

        <!-- Sort buttons (to the left of the Draft button) -->
        <UButton
          size="sm"
          color="neutral"
          :variant="sort === 'publishedAt' ? 'solid' : 'ghost'"
          icon="i-lucide-clock"
          :label="t('blog.sortPublish')"
          :title="t('blog.sortPublish')"
          @click="onSort('publishedAt')"
        />
        <UButton
          size="sm"
          color="neutral"
          :variant="sort === 'viewCount' ? 'solid' : 'ghost'"
          icon="i-lucide-eye"
          :label="t('blog.sortViews')"
          :title="t('blog.sortViews')"
          @click="onSort('viewCount')"
        />

        <!-- Draft button (author/admin only, far right) -->
        <UButton
          v-if="canViewDrafts"
          size="sm"
          color="warning"
          :variant="status === 'draft' ? 'solid' : 'ghost'"
          icon="i-lucide-file-edit"
          :label="status === 'draft' ? t('blog.showPublished') : t('blog.showDrafts')"
          @click="onToggleStatus"
        />

        <!-- Add (only when the role may create posts) -->
        <UButton
          v-if="can('posts', 'create')"
          icon="i-lucide-plus"
          color="primary"
          :label="t('blog.addPost')"
          @click="openCreate"
        />
      </div>
    </header>

    <!-- Category filter chips -->
    <div v-if="categories?.length" class="mb-6 flex flex-wrap items-center gap-2">
      <UButton
        size="xs"
        color="neutral"
        :variant="!categoryUrl ? 'solid' : 'ghost'"
        :label="t('blog.all')"
        @click="onCategory()"
      />
      <UButton
        v-for="cat in categories"
        :key="cat.url"
        size="xs"
        color="neutral"
        :variant="categoryUrl === cat.url ? 'solid' : 'ghost'"
        :label="`${cat.name} (${cat.postCount})`"
        @click="onCategory(cat.url)"
      />
    </div>

    <UAlert v-if="error" color="error" :title="t('blog.loadFailed')" icon="i-lucide-alert-circle" class="mb-6" />

    <!-- #13 loading skeleton -->
    <div v-else-if="pending" class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
      <UCard
        v-for="i in 9"
        :key="i"
        :ui="{ body: { padding: '' } }"
        class="flex flex-col overflow-hidden"
      >
        <div class="aspect-[16/9] w-full bg-muted/60 animate-pulse" />
        <div class="space-y-3 p-4">
          <div class="h-4 w-3/4 rounded bg-muted/60 animate-pulse" />
          <div class="h-3 w-full rounded bg-muted/40 animate-pulse" />
          <div class="h-3 w-2/3 rounded bg-muted/40 animate-pulse" />
        </div>
      </UCard>
    </div>

    <p v-else-if="items.length === 0" class="py-12 text-center text-muted">
      {{ t('blog.empty') }}
    </p>

    <div v-else>
      <div class="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        <UCard
          v-for="post in items"
          :key="post.id"
          as="article"
          :ui="{ body: { padding: '' } }"
          class="flex cursor-pointer flex-col overflow-hidden transition hover:shadow-lg"
          @click="navigateTo(`/blog/${post.url}`)"
        >
          <div class="relative aspect-[16/9] w-full overflow-hidden bg-muted">
            <img
              :src="resolveBlogCover(post.url, post.coverUrl, 800, 450)"
              :alt="post.title"
              :loading="'lazy'"
              class="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
            <!-- Top-right edit/delete (admin/author only); stop prop so card click doesn't navigate -->
            <div v-if="canEdit || canDelete" class="absolute right-2 top-2 z-10 flex items-center gap-1" @click.stop>
              <UButton
                v-if="canEdit"
                icon="i-lucide-pencil"
                size="xs"
                square
                color="neutral"
                variant="solid"
                :title="t('blog.editPost')"
                @click="openEdit(post)"
              />
              <BaseConfirmButton
                v-if="canDelete"
                icon="i-lucide-trash-2"
                size="xs"
                square
                color="error"
                variant="solid"
                :title="t('common.delete')"
                :loading="deleting"
                @confirm="removePost(post)"
              />
            </div>
          </div>

          <div class="flex flex-1 flex-col p-4">
            <h2 class="line-clamp-2 text-lg font-semibold text-(--ui-text-highlighted)">
              {{ post.title }}
            </h2>
            <p v-if="post.excerpt" class="mt-2 line-clamp-3 text-sm text-muted">
              {{ post.excerpt }}
            </p>
            <div class="mt-auto flex items-center gap-2 pt-4 text-xs text-dimmed">
              <span v-if="post.category">{{ post.category.name }}</span>
              <span v-if="post.category" class="opacity-50">·</span>
              <span>{{ formatBlogDate(post.publishedAt) }}</span>
            </div>
          </div>
        </UCard>
      </div>

      <div
        v-if="pagination && pagination.totalPages > 1"
        class="mt-8 flex items-center justify-between gap-3"
      >
        <span class="text-sm text-muted">
          {{ t('blog.totalPosts', { total: pagination.total }) }}
        </span>
        <UPagination
          :page="page"
          :total="pagination.total"
          :items-per-page="pageSize"
          @update:page="goPage"
        />
      </div>
    </div>

    <BlogPostEditorModal
      v-model:open="editorOpen"
      :mode="editorMode"
      :item="editorItem"
      @saved="onSaved"
    />
  </UContainer>
</template>
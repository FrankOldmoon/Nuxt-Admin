<script setup lang="ts">
/**
 * Blog module — public post detail page at `/blog/[url]`.
 * Renders every displayable field: cover, title, category, author, timestamps,
 * tags, excerpt, and the Tiptap JSON body (via host `BaseUeditorRender`).
 * Shows a sticky right-hand TOC (h1-h3) once the content is present.
 * For roles with `posts:update` / `posts:delete`, bottom-right action buttons
 * reuse the host dashboard post form for editing and soft-delete.
 */
import type { RouteLocationRaw } from 'vue-router'

const { t } = useI18n()
const route = useRoute()
const toast = useToast()
const { can } = usePermission()

const url = computed(() => String(route.params.url ?? ''))
const { data: post, pending, error, refresh } = useBlogPost(() => url.value)
const readingTime = computed(() => blogReadingTime(post.value?.content))

useSeoMeta(() => ({
  title: () => post.value?.title ?? t('blog.title'),
  description: () => post.value?.excerpt || undefined,
  ogTitle: () => post.value?.title || undefined,
  ogDescription: () => post.value?.excerpt || undefined,
  ogImage: () => (post.value?.coverUrl ? resolveBlogCover(post.value.url, post.value.coverUrl, 1200, 630) : undefined),
  ogType: () => 'article'
}))

const backTo: RouteLocationRaw = '/blog'

const canEdit = computed(() => can('posts', 'update'))
const canDelete = computed(() => can('posts', 'delete'))

// #2 mobile TOC drawer
const tocOpen = ref(false)
const hasToc = computed(() => !!post.value?.content)
const drawerTocRef = ref<InstanceType<typeof BlogPostToc> | null>(null)

// When the drawer opens, re-scan the article headings so the TOC populates.
watch(tocOpen, (open) => {
  if (open) drawerTocRef.value?.rescan()
})

// --- Edit (reuses host dashboard post form) ---
const editorOpen = ref(false)
const editorItem = computed(() => post.value ? ({ id: post.value.id } as Record<string, unknown>) : null)

function openEdit() {
  editorOpen.value = true
}
async function onEdited() {
  toast.add({ title: t('blog.editPost'), color: 'success' })
  editorOpen.value = false
  await refresh(true)
}

// --- Soft delete ---
const deleting = ref(false)
async function softDelete() {
  if (!post.value) return
  deleting.value = true
  try {
    await cPost('/api/dashboard/data/posts/batch', {
      action: 'soft-delete',
      ids: [post.value.id]
    })
    toast.add({ title: t('dashboard.crud.deleted'), color: 'primary' })
    await navigateTo('/blog')
  } catch (e) {
    toast.add({ title: (e as any)?.data?.message || t('dashboard.crud.deleteFailed'), color: 'error' })
  } finally {
    deleting.value = false
  }
}
</script>

<template>
  <UContainer class="py-10">
    <UAlert v-if="error" color="error" :title="t('blog.postNotFound')" icon="i-lucide-alert-circle" class="mb-6" />
    <div v-else-if="pending" class="flex justify-center py-16">
      <UIcon name="i-lucide-loader-circle" class="size-6 animate-spin text-muted" />
    </div>

    <div v-else-if="post" class="grid gap-10 lg:grid-cols-[minmax(0,1fr)_240px]">
      <!-- Main content -->
      <article class="blog-article mx-auto w-full max-w-3xl">
        <div class="mb-8 aspect-[16/7] w-full overflow-hidden rounded-xl bg-muted">
          <img
            :src="resolveBlogCover(post.url, post.coverUrl, 1200, 525)"
            :alt="post.title"
            class="h-full w-full object-cover"
          />
        </div>

        <header class="mb-8">
          <h1 class="text-3xl font-bold tracking-tight text-(--ui-text-highlighted)">{{ post.title }}</h1>

          <div class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-dimmed">
            <!-- Status badge (draft/archived only shown to authors/admins) -->
            <UBadge v-if="post.status !== 'published'" :color="post.status === 'draft' ? 'warning' : 'neutral'" variant="soft">
              {{ t(`blog.status.${post.status}`) }}
            </UBadge>
            <span v-if="post.category" class="rounded-full bg-(--ui-bg-elevated) px-2.5 py-0.5 text-xs">
              {{ post.category.name }}
            </span>
            <span v-if="post.authorName" class="flex items-center gap-1">
              <UIcon name="i-lucide-user" class="size-3.5" />
              {{ post.authorName }}
            </span>
            <span v-if="post.publishedAt" class="flex items-center gap-1">
              <UIcon name="i-lucide-calendar" class="size-3.5" />
              {{ t('blog.publishedAt', { date: formatBlogDate(post.publishedAt) }) }}
            </span>
            <span v-else-if="post.status === 'draft'" class="flex items-center gap-1">
              <UIcon name="i-lucide-clock" class="size-3.5" />
              {{ t('blog.draft') }}
            </span>
            <span v-if="post.updatedAt" class="flex items-center gap-1">
              <UIcon name="i-lucide-refresh-cw" class="size-3.5" />
              {{ t('blog.updatedAt', { date: formatBlogDate(post.updatedAt) }) }}
            </span>
            <span class="flex items-center gap-1">
              <UIcon name="i-lucide-hourglass" class="size-3.5" />
              {{ t('blog.readingTime', { minutes: readingTime }) }}
            </span>
          </div>

          <div v-if="post.tags?.length" class="mt-4 flex flex-wrap gap-2">
            <span
              v-for="tag in post.tags"
              :key="tag"
              class="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary"
            >
              #{{ tag }}
            </span>
          </div>
        </header>

        <p v-if="post.excerpt" class="mb-6 border-l-3 border-primary/40 pl-4 text-lg text-muted">
          {{ post.excerpt }}
        </p>

        <BaseUeditorRender
          v-if="post.content"
          :json="post.content"
          class="text-base leading-relaxed"
        />
        <p v-else class="text-muted">{{ t('blog.empty') }}</p>

        <!-- #9 prev/next navigation -->
        <nav v-if="post.prev || post.next" class="mt-12 grid gap-4 border-t border-default pt-6 sm:grid-cols-2">
          <UButton
            v-if="post.prev"
            :to="`/blog/${post.prev.url}`"
            color="neutral"
            variant="ghost"
            class="justify-start"
            :trailing="false"
          >
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-arrow-left" class="size-4 shrink-0" />
              <div class="min-w-0">
                <div class="text-xs text-dimmed">{{ t('blog.prevPost') }}</div>
                <div class="truncate font-medium">{{ post.prev.title }}</div>
              </div>
            </div>
          </UButton>
          <UButton
            v-if="post.next"
            :to="`/blog/${post.next.url}`"
            color="neutral"
            variant="ghost"
            class="justify-end"
          >
            <div class="flex items-center gap-2">
              <div class="min-w-0 text-right">
                <div class="text-xs text-dimmed">{{ t('blog.nextPost') }}</div>
                <div class="truncate font-medium">{{ post.next.title }}</div>
              </div>
              <UIcon name="i-lucide-arrow-right" class="size-4 shrink-0" />
            </div>
          </UButton>
        </nav>
      </article>

      <!-- Right column: TOC -->
      <aside class="hidden lg:block">
        <UButton
          :to="backTo"
          color="neutral"
          variant="ghost"
          icon="i-lucide-arrow-left"
          class="mb-4"
        >
          {{ t('blog.back') }}
        </UButton>
        <BlogPostToc container=".blog-article" />
      </aside>
    </div>

    <!-- Bottom-right actions (roles with posts:update/delete) -->
    <div v-if="post && (canEdit || canDelete)" class="fixed bottom-6 right-6 z-40 flex items-center gap-2">
      <UButton
        v-if="canEdit"
        icon="i-lucide-pencil"
        color="warning"
        :label="t('blog.editPost')"
        @click="openEdit"
      />
      <BaseConfirmButton
        v-if="canDelete"
        icon="i-lucide-trash-2"
        color="error"
        variant="soft"
        :label="t('common.delete')"
        :confirm-text="t('common.confirmDelete')"
        :loading="deleting"
        @confirm="softDelete"
      />
    </div>

    <!-- #2 Mobile TOC toggle (hidden on lg+, which has the inline TOC) -->
    <UButton
      v-if="post && hasToc"
      icon="i-lucide-list"
      color="neutral"
      variant="soft"
      square
      class="fixed bottom-6 left-6 z-40 lg:hidden"
      :aria-label="t('blog.toc')"
      :title="t('blog.toc')"
      @click="tocOpen = true"
    />

    <!-- #2 Mobile TOC drawer -->
    <UDrawer v-model:open="tocOpen" :title="t('blog.toc')">
      <template #content>
        <div class="p-4">
          <BlogPostToc ref="drawerTocRef" container=".blog-article" />
        </div>
      </template>
    </UDrawer>

    <BlogPostEditorModal
      v-model:open="editorOpen"
      mode="update"
      :item="canEdit ? (editorItem || null) : null"
      @saved="onEdited"
    />
  </UContainer>
</template>
<script setup lang="ts">
/**
 * Blog module — single post card for the public list page.
 *
 * Shows cover image, title, excerpt, category and publish date.
 * Clicking navigates to the post detail. Top-right edit/delete buttons
 * emit events to the parent for handling.
 */
import type { BlogListItem } from '../../server/api/blog/posts.get'

const props = defineProps<{
  post: BlogListItem
  canEdit: boolean
  canDelete: boolean
  deleting: boolean
}>()

const emit = defineEmits<{
  edit: [post: BlogListItem]
  delete: [post: BlogListItem]
}>()

const { t } = useI18n()
</script>

<template>
  <UCard
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
          @click="emit('edit', post)"
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
          @confirm="emit('delete', post)"
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
</template>
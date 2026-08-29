<script setup lang="ts">
/**
 * Blog module — public post detail page at `/blog/[slug]`.
 * Renders the markdown content with the host project's `BaseMarkdownViewer`.
 */
import type { RouteLocationRaw } from 'vue-router'

const { t } = useI18n()
const route = useRoute()

const slug = computed(() => String(route.params.slug ?? ''))
const { data: post, pending, error } = useBlogPost(() => slug.value)

useSeoMeta(() => ({
  title: () => post.value?.title ?? t('blog.title')
}))

const backTo: RouteLocationRaw = '/blog'
</script>

<template>
  <UContainer class="py-10">
    <UButton
      :to="backTo"
      color="neutral"
      variant="ghost"
      icon="i-lucide-arrow-left"
      class="mb-6"
    >
      {{ t('blog.back') }}
    </UButton>

    <UAlert v-if="error" color="error" :title="'Post not found'" icon="i-lucide-alert-circle" class="mb-6" />
    <p v-else-if="pending" class="py-12 text-center text-muted">Loading…</p>

    <article v-else-if="post" class="mx-auto max-w-3xl">
      <header class="mb-8">
        <h1 class="text-3xl font-bold tracking-tight">{{ post.title }}</h1>
        <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-dimmed">
          <span v-if="post.category" class="rounded-full bg-(--ui-bg-elevated) px-2.5 py-0.5 text-xs">
            {{ post.category.name }}
          </span>
          <span>{{ t('blog.meta', { date: formatBlogDate(post.publishedAt) }) }}</span>
          <span v-if="post.authorName">{{ t('blog.by', { author: post.authorName }) }}</span>
        </div>
      </header>

      <UImage v-if="post.coverUrl" :src="post.coverUrl" alt="" class="mb-8 w-full rounded-lg" />

      <BaseMarkdownViewer v-if="post.contentMarkdown" :source="post.contentMarkdown" class="text-base leading-relaxed" />
      <p v-else class="text-muted">{{ t('blog.empty') }}</p>
    </article>
  </UContainer>
</template>
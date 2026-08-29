<script setup lang="ts">
/**
 * Blog module — public post list page at `/blog`.
 * Renders the published posts fetched from the module's own API and reuses
 * the host project's Nuxt UI components (UContainer / UCard / UButton) plus
 * i18n from the module's own locale files (`blog.*` keys).
 */
const { t } = useI18n()
const { data: posts, pending, error } = useBlogList()

useSeoMeta({ title: () => t('blog.title') })
</script>

<template>
  <UContainer class="py-10">
    <header class="mb-8">
      <h1 class="text-3xl font-bold tracking-tight">{{ t('blog.title') }}</h1>
      <p class="mt-2 text-muted">{{ t('blog.subtitle') }}</p>
    </header>

    <UAlert v-if="error" color="error" :title="'Failed to load posts'" icon="i-lucide-alert-circle" class="mb-6" />
    <p v-else-if="!pending && posts?.length === 0" class="py-12 text-center text-muted">
      {{ t('blog.empty') }}
    </p>

    <div v-else class="grid gap-6" :class="posts?.length === 1 ? 'max-w-xl grid-cols-1' : 'sm:grid-cols-2 lg:grid-cols-3'">
      <UCard
        v-for="post in posts"
        :key="post.id"
        as="article"
        class="flex flex-col"
      >
        <div class="flex flex-1 flex-col">
          <h2 class="text-lg font-semibold">
            <UButton :to="`/blog/${post.slug}`" :label="post.title" variant="ghost" class="-mx-2 w-full justify-start px-2 font-semibold text-(--ui-text-highlighted)" />
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
  </UContainer>
</template>
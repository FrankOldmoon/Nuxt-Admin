/**
 * Blog module — client composable for the public blog pages.
 * The shapes below mirror `server/api/blog/*` return values.
 */

export interface BlogListItemClient {
  id: number
  title: string
  slug: string
  excerpt: string | null
  coverUrl: string | null
  publishedAt: string | null
  category: { id: number, name: string, slug: string } | null
  authorName: string | null
}

/** Load the published post list (SSR-friendly via useAsyncData). */
export function useBlogList() {
  return useAsyncData('blog:list', () => $fetch<BlogListItemClient[]>('/api/blog/posts'))
}

/** Load a single published post by slug (SSR-friendly). */
export function useBlogPost(slug: () => string) {
  return useAsyncData(
    `blog:post-${slug()}`,
    () => $fetch<BlogListItemClient & { contentMarkdown: string | null, updatedAt: string | null }>(`/api/blog/posts/${slug()}`)
  )
}

/** Compact human date, e.g. "Mar 5, 2026". */
export function formatBlogDate(value: string | null): string {
  if (!value) return ''
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}
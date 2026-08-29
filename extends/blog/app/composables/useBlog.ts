/**
 * Blog module — client composable for the public blog pages.
 * The shapes below mirror `server/api/blog/*` return values.
 */

export interface BlogListItemClient {
  id: number
  title: string
  url: string
  excerpt: string | null
  coverUrl: string | null
  tags: string[]
  status: 'draft' | 'published' | 'archived'
  viewCount: number
  publishedAt: string | null
  category: { id: number, name: string, url: string } | null
  authorName: string | null
}

export interface BlogListResultClient {
  items: BlogListItemClient[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

/** Load a single published page of posts (SSR-friendly via useAsyncData). */
export function useBlogList(
  page: Ref<number>,
  pageSize: Ref<number>,
  search: Ref<string>,
  categoryUrl: Ref<string>,
  status: Ref<string>,
  sort: Ref<string>,
  startDate: Ref<string>,
  endDate: Ref<string>
) {
  const q = computed(() => search.value.trim())
  return useAsyncData(
    `blog:list-${page.value}-${pageSize.value}-${q.value}-${categoryUrl.value}-${status.value}-${sort.value}-${startDate.value}-${endDate.value}`,
    () => $fetch<BlogListResultClient>('/api/blog/posts', {
      query: {
        page: page.value,
        pageSize: pageSize.value,
        q: q.value || undefined,
        category: categoryUrl.value || undefined,
        status: status.value || undefined,
        sort: sort.value || undefined,
        startDate: startDate.value || undefined,
        endDate: endDate.value || undefined
      }
    }),
    { watch: [page, pageSize, q, categoryUrl, status, sort, startDate, endDate] }
  )
}

export interface BlogCategoryItemClient {
  id: number
  name: string
  url: string
  description: string | null
  postCount: number
}

/** Load published categories for the filter bar (SSR-friendly). */
export function useBlogCategories() {
  return useAsyncData('blog:categories', () => $fetch<BlogCategoryItemClient[]>('/api/blog/categories'))
}

export interface BlogPostNavClient {
  id: number
  title: string
  url: string
}

export interface BlogPostDetailClient extends BlogListItemClient {
  contentMarkdown: string | null
  status: 'draft' | 'published' | 'archived'
  publishedAt: string | null
  updatedAt: string | null
  createdAt: string | null
  prev: BlogPostNavClient | null
  next: BlogPostNavClient | null
}

/** Load a single post by url (SSR-friendly). */
export function useBlogPost(url: () => string) {
  return useAsyncData(
    `blog:post-${url()}`,
    () => $fetch<BlogPostDetailClient>(`/api/blog/posts/${url()}`)
  )
}

/** Rough reading-time estimate: 250 Chinese/words per minute, min 1 min. */
export function blogReadingTime(content: string | null | undefined): number {
  const s = content?.trim()
  if (!s) return 1
  const words = Math.ceil(s.length / 4) // CJK-heavy: ~4 chars per "word"
  return Math.max(1, Math.ceil(words / 250))
}

/** Compact human date, e.g. "Mar 5, 2026". */
export function formatBlogDate(value: string | null): string {
  if (!value) return ''
  return new Date(value).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

/**
 * Resolve a cover value to a usable <img> src. `image`-type fields store the
 * uploaded file path (served via `/api/files/serve/`); external URLs/relative
 * paths pass through. Falls back to a picsum placeholder (seeded by url).
 */
export function resolveBlogCover(url: string, value: string | null | undefined, w: number, h: number): string {
  const s = String(value ?? '')
  if (s && (/^https?:\/\//i.test(s) || s.startsWith('/') || s.startsWith('data:'))) return s
  if (s) return `/api/files/serve/${s}`
  return `https://picsum.photos/seed/${url}/${w}/${h}`
}
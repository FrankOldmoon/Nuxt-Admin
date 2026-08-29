<script setup lang="ts">
/**
 * Blog module — Table of Contents sidebar.
 * Reads the rendered markdown body (selectors for h1/h2/h3) inside a container
 * element after it renders, then:
 *  - shows a nested 1-3 level list,
 *  - scroll-spies via IntersectionObserver to highlight the active heading,
 *  - clicking an entry smooth-scrolls to that heading.
 */
const props = withDefaults(defineProps<{
  /** CSS selector of the element containing rendered markdown headings */
  container?: string
}>(), { container: '.blog-article' })

const headings = ref<Array<{ id: string, text: string, level: 1 | 2 | 3 }>>([])
const activeId = ref('')

let rootEl: HTMLElement | null = null
let observer: IntersectionObserver | null = null

function slugify(text: string, index: number): string {
  return `blog-toc-${index}-${text.toLowerCase().replace(/\s+/g, '-').replace(/[^\w\u4e00-\u9fa5-]/g, '').slice(0, 60) || index}`
}

function scan() {
  headings.value = []
  rootEl = document.querySelector(props.container)
  if (!rootEl) return
  const nodes = Array.from(rootEl.querySelectorAll('h1, h2, h3'))
  const list: Array<{ id: string, text: string, level: 1 | 2 | 3 }> = []
  nodes.forEach((el, i) => {
    const level = Number(el.tagName[1]) as 1 | 2 | 3
    const id = slugify((el.textContent || '').trim(), i)
    el.id = id
    // Keeps the sticky header from covering a heading when scrolling to it.
    el.style.scrollMarginTop = 'calc(var(--ui-header-height, 56px) + 24px)'
    list.push({ id, text: (el.textContent || '').trim(), level })
  })
  headings.value = list

  // Re-arm scrollspy
  observer?.disconnect()
  if (list.length === 0) return
  observer = new IntersectionObserver(
    (entries) => {
      const visible = entries
        .filter(e => e.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (visible[0]) activeId.value = (visible[0].target as HTMLElement).id
    },
    { rootMargin: '-80px 0px -60% 0px', threshold: 0 }
  )
  for (const h of list) {
    const el = rootEl.querySelector(`#${h.id}`) || document.getElementById(h.id)
    if (el) observer.observe(el)
  }
}

function onClick(id: string) {
  activeId.value = id
  const el = document.getElementById(id)
  el?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

// Recompute once the markdown (async) has rendered.
let scanTick = 0
async function retryScan(count = 0) {
  const hasEls = !!document.querySelector(`${props.container} h1, ${props.container} h2, ${props.container} h3`)
  if (hasEls || count > 20) { scan(); return }
  setTimeout(() => retryScan(count + 1), 250)
}

function onResize() { scan() }

onMounted(() => {
  retryScan()
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  window.removeEventListener('resize', onResize)
})

// Re-scan whenever this component becomes visible (e.g. a mobile drawer that
// initially renders hidden — headings may have changed ids since first scan).
defineExpose({ rescan: () => { scan() } })
</script>

<template>
  <nav v-if="headings.length" class="toc" aria-label="Table of contents">
    <p class="toc-title">On this page</p>
    <ul class="toc-list">
      <li
        v-for="h in headings"
        :key="h.id"
        :class="[`toc-${h.level}`, { active: activeId === h.id }]"
      >
        <button type="button" class="toc-link" @click="onClick(h.id)">
          {{ h.text }}
        </button>
      </li>
    </ul>
  </nav>
</template>

<style scoped>
.toc { position: sticky; top: calc(var(--ui-header-height, 56px) + 24px); max-height: calc(100vh - var(--ui-header-height, 56px) - 48px); overflow-y: auto; padding-left: 16px; border-left: 1px solid var(--ui-border-muted); }
.toc-title { font-size: .75rem; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; color: var(--ui-text-dimmed); margin-bottom: 12px; }
.toc-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
.toc-list > li { margin: 0; }
.toc-link { display: block; width: 100%; text-align: left; padding: 4px 8px; border-radius: 6px; font-size: .8125rem; color: var(--ui-text-muted); line-height: 1.4; transition: color .15s, background-color .15s; }
.toc-link:hover { color: var(--ui-text-highlighted); }
.toc-2 .toc-link { padding-left: 20px; }
.toc-3 .toc-link { padding-left: 36px; }
li.active .toc-link { color: var(--ui-primary); font-weight: 600; background: color-mix(in srgb, var(--ui-primary) 8%, transparent); }
</style>
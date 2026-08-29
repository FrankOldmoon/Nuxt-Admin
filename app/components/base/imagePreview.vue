<script setup lang="ts">
/**
 * Full-screen image preview component.
 *
 * Usage:
 *   <BaseImagePreview src="/api/files/serve/..." alt="filename" />
 *
 * Renders a thumbnail that opens a full-screen overlay on click.
 * Click anywhere or press Esc to close.
 */
const props = withDefaults(defineProps<{
  src: string
  alt?: string
  /** Thumbnail class for the trigger image */
  thumbClass?: string
  /** Thumbnail size preset (ignored when autoSize=true) */
  thumbSize?: 'sm' | 'md' | 'lg'
  /** When true, skip the size preset and use thumbClass for sizing */
  autoSize?: boolean
}>(), {
  alt: '',
  thumbClass: '',
  thumbSize: 'sm',
  autoSize: false
})

const open = ref(false)

function onClick() {
  open.value = true
}
function close() {
  open.value = false
}

function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape' || !open.value) return
  close()
  // When the preview is open, swallow Esc so it doesn't also close an
  // underlying modal/route (the form that launched the preview).
  e.stopPropagation()
}

// While the preview is open, swallow events originating inside it at the window
// CAPTURE phase (capture flows window → … → target, before the document-level
// listeners that dialogs use). UModal's DismissableLayer watches several event
// kinds — pointerdown, mousedown, click and focusin — to detect an "outside"
// interaction; without this, interacting with the preview is treated as an
// outside click and dismisses the underlying form.
const CAPTURE_EVENTS = ['pointerdown', 'mousedown', 'pointerup', 'click', 'focusin'] as const
function onCapture(e: Event) {
  if (!open.value) return
  const t = e.target as Element | null
  if (t && t.closest('[data-image-preview]')) e.stopPropagation()
}

onMounted(() => {
  if (import.meta.server) return
  // Capture phase so we can intercept Escape before underlying listeners.
  window.addEventListener('keydown', onKeydown, true)
  for (const ev of CAPTURE_EVENTS) window.addEventListener(ev, onCapture, true)
})
onBeforeUnmount(() => {
  if (import.meta.server) return
  window.removeEventListener('keydown', onKeydown, true)
  for (const ev of CAPTURE_EVENTS) window.removeEventListener(ev, onCapture, true)
})

const sizeClass = computed(() => {
  switch (props.thumbSize) {
    case 'lg': return 'h-20 w-20'
    case 'md': return 'h-14 w-14'
    default: return 'h-10 w-10'
  }
})
</script>

<template>
  <slot :open="onClick">
    <img
      :src="src"
      :alt="alt"
      :class="[
        'cursor-zoom-in rounded object-cover border border-default',
        !props.autoSize && sizeClass,
        props.thumbClass
      ]"
      @click="onClick"
    />
  </slot>

  <Teleport to="body">
    <Transition name="fade">
      <div
        v-if="open"
        data-image-preview
        class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 p-4"
        @click="close"
      >
        <img
          :src="src"
          :alt="alt"
          class="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
          @click.stop
        />
        <button
          class="absolute top-4 right-4 rounded-full bg-white/20 p-2 text-white transition hover:bg-white/30"
          aria-label="Close"
          @click="close"
        >
          <UIcon name="i-lucide-x" class="h-5 w-5" />
        </button>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>

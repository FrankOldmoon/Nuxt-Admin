<script setup lang="ts">
import type { ChatUiDescriptor } from '~/composables/useChatUi'

/**
 * Renders one registered chat UI card (see useChatUi.ts).
 *
 * Every card is an audited Vue component. The base app owns `ChatLoginCard`;
 * modules register their own globally (e.g. the tools runner), so the base can
 * render any card without importing the module that provides it.
 */
const props = defineProps<{ ui: { id: string, descriptor: ChatUiDescriptor } }>()

const { locale } = useI18n()
const isZh = computed(() => String(locale.value).toLowerCase().startsWith('zh'))
const title = computed(() => (isZh.value ? props.ui.descriptor.title.zh : props.ui.descriptor.title.en))
const note = computed(() => (isZh.value ? props.ui.descriptor.note.zh : props.ui.descriptor.note.en))
const openHref = computed(() => props.ui.descriptor.href ?? '')

/**
 * Cards from modules are registered as global components (`addComponentsDir
 * { global: true }`), so they resolve by tag at runtime. Vue's auto-import of
 * base components is compile-time only, hence the explicit login branch.
 */
const registered = computed(() => {
  const target = props.ui.descriptor.target
  if (!target) return null
  const resolved = resolveComponent(target)
  return typeof resolved === 'string' ? null : resolved
})
</script>

<template>
  <div class="mt-2 overflow-hidden rounded-xl border border-default">
    <div class="flex items-center gap-2 border-b border-default bg-elevated px-3 py-2">
      <UIcon
        name="i-lucide-app-window"
        class="size-3.5 shrink-0 text-primary"
      />
      <p class="min-w-0 flex-1 truncate text-xs font-medium text-highlighted">
        {{ title }}
      </p>
      <span class="hidden shrink-0 text-[10px] text-muted sm:inline">{{ note }}</span>
      <a
        v-if="openHref"
        :href="openHref"
        target="_blank"
        rel="noopener"
        class="shrink-0 text-muted transition-colors hover:text-primary"
        :aria-label="title"
      >
        <UIcon
          name="i-lucide-external-link"
          class="size-3.5"
        />
      </a>
    </div>

    <ChatLoginCard
      v-if="ui.descriptor.target === 'ChatLoginCard'"
    />

    <component
      :is="registered"
      v-else-if="registered"
      :tool-id="ui.descriptor.toolId"
    />

    <!-- Unknown component kinds should never reach here (registry validates), but fail closed -->
    <p
      v-else
      class="p-3 text-xs text-muted"
    >
      {{ title }}
    </p>
  </div>
</template>

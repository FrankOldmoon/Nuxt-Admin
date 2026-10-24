<script setup lang="ts">
import type { ChatUiDescriptor } from '~/composables/useChatUi'

/**
 * Renders one registered chat UI card (see useChatUi.ts).
 *
 * kind "embed"   → same-origin iframe of a whitelisted tool page (reuses the
 *                  tools module UIs as-is; files stay on-device)
 * kind "component" → a hand-written Vue component; extend the v-if chain as
 *                  new components are registered (forms, panels, ...).
 */
const props = defineProps<{ ui: { id: string, descriptor: ChatUiDescriptor } }>()

const { locale } = useI18n()
const isZh = computed(() => String(locale.value).toLowerCase().startsWith('zh'))
const title = computed(() => (isZh.value ? props.ui.descriptor.title.zh : props.ui.descriptor.title.en))
const note = computed(() => (isZh.value ? props.ui.descriptor.note.zh : props.ui.descriptor.note.en))
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
        v-if="ui.descriptor.kind === 'embed'"
        :href="ui.descriptor.target"
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

    <iframe
      v-if="ui.descriptor.kind === 'embed'"
      :src="ui.descriptor.target"
      :title="title"
      class="h-[26rem] w-full border-0 bg-default"
    />

    <ChatLoginCard
      v-else-if="ui.descriptor.kind === 'component' && ui.descriptor.target === 'ChatLoginCard'"
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

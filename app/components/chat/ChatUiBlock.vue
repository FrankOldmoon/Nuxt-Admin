<script setup lang="ts">
import type { ChatUiDescriptor } from '~/composables/useChatUi'

/**
 * Renders one registered chat UI card (see useChatUi.ts).
 *
 * Every card is an audited Vue component: tool cards resolve to the globally
 * registered `<ToolsRunnerCard>` (the same runner as `/tools/:slug`), other
 * component cards are listed below.
 */
const props = defineProps<{ ui: { id: string, descriptor: ChatUiDescriptor } }>()

const { locale } = useI18n()
const isZh = computed(() => String(locale.value).toLowerCase().startsWith('zh'))
const title = computed(() => (isZh.value ? props.ui.descriptor.title.zh : props.ui.descriptor.title.en))
const note = computed(() => (isZh.value ? props.ui.descriptor.note.zh : props.ui.descriptor.note.en))
const openHref = computed(() => (props.ui.descriptor.toolId ? `/tools/${props.ui.descriptor.toolId}` : ''))
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

    <ToolsRunnerCard
      v-if="ui.descriptor.toolId"
      :tool-id="ui.descriptor.toolId"
    />

    <ChatLoginCard
      v-else-if="ui.descriptor.target === 'ChatLoginCard'"
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

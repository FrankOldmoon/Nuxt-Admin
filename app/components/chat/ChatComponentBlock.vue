<script setup lang="ts">
import type { Component } from 'vue'

/**
 * Renders a model-requested ` ```component ` block.
 *
 * The server already validated the id/version/props, so this only maps the
 * registered id to a build-time component (never a runtime import by name).
 * Modules pass their own id → component map through `components`, because
 * Nuxt only auto-registers components that are referenced in a template.
 * Unknown ids (e.g. module disabled since the message was stored) fail closed.
 */
const props = defineProps<{
  ui: { component: string, version?: string, props: Record<string, unknown> }
  components?: Record<string, Component>
}>()

const targetName = computed(() => props.ui.component
  .split(/[.\-_]/)
  .filter(Boolean)
  .map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
  .join(''))

const resolved = computed<Component | null>(() => {
  const mapped = props.components?.[props.ui.component]
  if (mapped) return mapped
  if (!targetName.value) return null
  const component = resolveComponent(targetName.value)
  return typeof component === 'string' ? null : component
})
</script>

<template>
  <component
    :is="resolved"
    v-if="resolved"
    v-bind="ui.props"
  />
  <p
    v-else
    class="mt-2 rounded-lg border border-default bg-elevated px-3 py-2 text-xs text-muted"
  >
    组件「{{ ui.component }}」未注册或当前不可用。
  </p>
</template>

<script setup lang="ts">
import type { Component } from 'vue'
import type { AgentComponentEntry } from '~/composables/useAgentComponents'

/**
 * Renders a model-requested ` ```component ` block.
 *
 * The server already validated the id/version/props, and the catalog says
 * whether the viewer may use it. This component only maps the id to a
 * build-time component (never a runtime import by name). Unknown ids, version
 * drift or render errors fail closed with a link to the Apps fallback page.
 */
const props = defineProps<{
  ui: { component: string, version?: string, props: Record<string, unknown> }
  components?: Record<string, Component>
  catalog?: Record<string, AgentComponentEntry>
  catalogLoaded?: boolean
}>()

const renderError = ref('')
const retryKey = ref(0)

const entry = computed(() => props.catalog?.[props.ui.component])

const unavailable = computed(() => {
  if (props.catalogLoaded === true && !entry.value) return '未注册或当前不可用'
  if (entry.value?.version && props.ui.version && entry.value.version !== props.ui.version) {
    return `版本不匹配（组件 ${entry.value.version}，消息 ${props.ui.version}）`
  }
  return ''
})

const resolved = computed<Component | null>(() => {
  if (unavailable.value) return null
  const mapped = props.components?.[props.ui.component]
  if (mapped) return mapped
  return null
})

onErrorCaptured((error) => {
  renderError.value = error instanceof Error ? error.message : '组件渲染失败'
  return false
})

function retry(): void {
  renderError.value = ''
  retryKey.value += 1
}
</script>

<template>
  <p
    v-if="renderError"
    class="mt-2 rounded-lg border border-default bg-elevated px-3 py-2 text-xs text-muted"
  >
    组件「{{ ui.component }}」渲染失败：{{ renderError }}
    <button
      type="button"
      class="ml-1 text-primary hover:underline"
      @click="retry"
    >
      重试
    </button>
    <NuxtLink
      v-if="entry?.appsPath"
      :to="entry.appsPath"
      class="ml-2 text-primary hover:underline"
    >
      在 Apps 中打开
    </NuxtLink>
  </p>

  <component
    :is="resolved"
    v-else-if="resolved"
    :key="retryKey"
    v-bind="ui.props"
  />

  <p
    v-else
    class="mt-2 rounded-lg border border-default bg-elevated px-3 py-2 text-xs text-muted"
  >
    组件「{{ ui.component }}」{{ unavailable || '未注册或当前不可用' }}。
    <NuxtLink
      v-if="entry?.appsPath"
      :to="entry.appsPath"
      class="ml-1 text-primary hover:underline"
    >
      在 Apps 中打开
    </NuxtLink>
  </p>
</template>

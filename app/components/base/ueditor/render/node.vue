<template>
  <TextRenderer v-if="node.type === 'text'" :text="node.text" :marks="node.marks" />
  <template v-else-if="node.type === 'doc'">
    <template v-for="(child, index) in node.content" :key="index">
      <RenderNode :node="child" />
    </template>
  </template>

  <!-- Registered node type matched: dynamic component rendering -->
  <component v-else-if="currentComponent" :is="currentComponent" v-bind="componentProps" />

  <!-- Unknown node type: fall back to a wrapping div -->
  <div v-else>
    <RenderNode v-for="(child, index) in node.content" :key="index" :node="child" />
  </div>
</template>

<script setup>
import { useNodeDispatcher, TextRenderer } from './useNodeDispatcher'

defineOptions({ name: 'RenderNode' })

const props = defineProps({
  node: { type: Object, required: true },
})

const { currentComponent } = useNodeDispatcher(props)

const componentProps = computed(() => {
  return { node: props.node }
})
</script>

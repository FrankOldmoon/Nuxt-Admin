<template>
  <TextRenderer v-if="node.type === 'text'" :text="node.text" :marks="node.marks" />
  <template v-else-if="node.type === 'doc'">
    <template v-for="(child, index) in node.content" :key="index">
      <RenderNode :node="child" />
    </template>
  </template>

  <!-- 匹配到注册类型的节点：动态组件渲染 -->
  <component v-else-if="currentComponent" :is="currentComponent" v-bind="componentProps" />

  <!-- 未知节点类型：div 包裹降级渲染 -->
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

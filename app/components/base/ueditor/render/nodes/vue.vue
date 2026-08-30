<template>
    <component v-if="comp" :is="comp" :node="node" />
</template>

<script setup>
// 统一加载 ../../extensions/nodes/vue/*/render.vue（所有渲染组件）
// 如：../../extensions/nodes/vue/html/render.vue, ../../extensions/nodes/vue/pdf/render.vue
const compModules = import.meta.glob('../../extensions/nodes/vue/*/render.vue', { eager: true })

// 自动生成「组件名 → 组件实例」的映射
const compMap = Object.fromEntries(
  Object.entries(compModules).map(([filePath, module]) => {
    // 提取目录名：../../extensions/nodes/vue/question/render.vue → question
    const match = filePath.match(/\/extensions\/nodes\/vue\/([^/]+)\/render\.vue$/)
    return match ? [match[1], module.default] : []
  }).filter(([key]) => key)
)

const props = defineProps({
  node: Object,
})

const comp = computed(() => {
  const type = props.node?.attrs?.type
  // 使用统一映射（所有组件走 vue/*/render.vue）
  if (type && compMap[type]) return compMap[type]
  return null
})
</script>

<template>
    <component v-if="comp" :is="comp" :node="node" />
</template>

<script setup>
// Uniformly load ../../extensions/nodes/vue/*/render.vue (all render components)
// e.g. ../../extensions/nodes/vue/html/render.vue, ../../extensions/nodes/vue/pdf/render.vue
const compModules = import.meta.glob('../../extensions/nodes/vue/*/render.vue', { eager: true })

// Automatically build a "component name -> component instance" mapping
const compMap = Object.fromEntries(
  Object.entries(compModules).map(([filePath, module]) => {
    // Extract the directory name: ../../extensions/nodes/vue/question/render.vue -> question
    const match = filePath.match(/\/extensions\/nodes\/vue\/([^/]+)\/render\.vue$/)
    return match ? [match[1], module.default] : []
  }).filter(([key]) => key)
)

const props = defineProps({
  node: Object,
})

const comp = computed(() => {
  const type = props.node?.attrs?.type
  // Use the unified mapping (all components go through vue/*/render.vue)
  if (type && compMap[type]) return compMap[type]
  return null
})
</script>

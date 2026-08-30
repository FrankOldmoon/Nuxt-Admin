<template>
  <div :class="['umo-node-details', isOpen ? 'is-open' : '']">
    <button type="button" @click="toggle"></button>
    <div>
      <template v-for="(child, i) in summaryNodes" :key="`s${i}`">
        <RenderNode :node="child" />
      </template>
      <div
        v-show="isOpen"
        v-for="(child, i) in contentNodes"
        :key="`c${i}`"
        :data-type="child.type === 'detailsContent' ? 'detailsContent' : undefined"
      >
        <RenderNode :node="child" />
      </div>
    </div>
  </div>
</template>

<script setup>
import RenderNode from '../node.vue'

const props = defineProps({
  node: { type: Object, required: true },
})

const allContent = computed(() => props.node.content || [])
const attrs = computed(() => props.node.attrs || {})
const isOpen = ref(attrs.value.open || false)

// 分离 summary 和 content
const summaryNodes = computed(() =>
  allContent.value.filter((c) => c.type === 'detailsSummary'),
)
const contentNodes = computed(() =>
  allContent.value.filter((c) => c.type !== 'detailsSummary'),
)

const toggle = () => {
  isOpen.value = !isOpen.value
}
</script>

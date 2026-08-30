<template>
  <li :data-checked="checkedAttr">
    <label>
      <input type="checkbox" :checked="attrs.checked" disabled />
    </label>
    <div>
      <RenderNode v-for="(child, i) in content" :key="i" :node="child" />
    </div>
  </li>
</template>

<script setup>
import RenderNode from '../node.vue'

const props = defineProps({
  node: { type: Object, required: true },
})

const attrs = computed(() => props.node.attrs || {})
const content = computed(() => props.node.content || [])
const checkedAttr = computed(() => (attrs.value.checked ? 'true' : 'false'))
</script>

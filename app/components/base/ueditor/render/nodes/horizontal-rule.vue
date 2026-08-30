<template>
  <hr
    class="umo-page-divider"
    :data-type="dataType"
    :data-color="attrs.color"
    :style="`color: ${attrs.color || 'inherit'}`"
    data-line-number="false"
  />
</template>

<script setup>
const props = defineProps({
  node: { type: Object, required: true },
})

const attrs = computed(() => props.node.attrs || {})
const dataType = computed(() => attrs.value['data-type'] || 'single')
</script>

<template>
  <div class="tableWrapper">
    <table class="umo-node-table">
      <colgroup v-if="colWidths.length">
        <col v-for="(w, i) in colWidths" :key="i" :style="w ? `width: ${w}px` : null" />
      </colgroup>
      <tbody>
        <RenderNode v-for="(child, i) in content" :key="i" :node="child" />
      </tbody>
    </table>
  </div>
</template>

<script setup>
import RenderNode from '../node.vue'

const props = defineProps({
  node: { type: Object, required: true },
})

const content = computed(() => props.node.content || [])

// 从首行单元格的 colwidth 提取每列宽度，生成 <colgroup> 还原编辑时设置的列宽
const colWidths = computed(() => {
  const firstRow = (props.node.content || []).find(c => c.type === 'tableRow')
  if (!firstRow) return []
  const widths = []
  for (const cell of (firstRow.content || [])) {
    const cw = cell.attrs?.colwidth
    const colspan = cell.attrs?.colspan || 1
    if (Array.isArray(cw) && cw.length) {
      for (const w of cw) widths.push(Number(w) || null)
    } else {
      for (let i = 0; i < colspan; i++) widths.push(null)
    }
  }
  return widths
})
</script>

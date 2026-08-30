import { ref, computed } from 'vue'
import { markdownToTiptap } from './markdownToTiptap'

export function useRenderIndex(props: any, emit: any) {
  const renderNodeRef = ref<any>(null)
  const defaultLineHeight = computed(() => props.lineHeight)

  const renderContent = computed(() => {
    if (props.json === null || props.json === undefined || props.json === '') {
      return null
    }
    // 字符串：转 TipTap JSON（支持纯文本 / markdown）
    if (typeof props.json === 'string') {
      return markdownToTiptap(props.json)
    }
    // 数字 / 布尔：jsonb 纯数字字符串会被驱动解析为 number，需转回字符串
    if (typeof props.json === 'number' || typeof props.json === 'boolean') {
      return markdownToTiptap(String(props.json))
    }
    // 对象：空对象不渲染
    if (!Object.keys(props.json).length) {
      return null
    }
    return props.json
  })

  return {
    renderNodeRef,
    defaultLineHeight,
    renderContent,
  }
}

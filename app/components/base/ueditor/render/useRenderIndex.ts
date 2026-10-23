import { ref, computed } from 'vue'
import { markdownToTiptap } from './markdownToTiptap'

export function useRenderIndex(props: any, emit: any) {
  const renderNodeRef = ref<any>(null)
  const defaultLineHeight = computed(() => props.lineHeight)

  const renderContent = computed(() => {
    if (props.json === null || props.json === undefined || props.json === '') {
      return null
    }
    // String: convert to TipTap JSON (supports plain text / markdown)
    if (typeof props.json === 'string') {
      return markdownToTiptap(props.json)
    }
    // Number / boolean: pure numeric jsonb strings get parsed as numbers by the driver, so convert back to string
    if (typeof props.json === 'number' || typeof props.json === 'boolean') {
      return markdownToTiptap(String(props.json))
    }
    // Object: empty objects are not rendered
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

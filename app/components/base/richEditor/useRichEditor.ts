import { ref, computed, type Ref } from 'vue'

export function useRichEditor(props: any, model: Ref<string | Record<string, any>>) {
    // 判断当前值是否为 JSON 对象（非数组、非 null、非字符串）
    const isJson = computed(
        () => typeof model.value === 'object' && model.value !== null && !Array.isArray(model.value)
    )

    // 弹窗控制
    const isModalOpen = ref(false)

    // 编辑器内临时 JSON 数据
    const editJson = ref<any>(null)

    /** 打开编辑器：将当前 model 转换为 JSON 赋给 editJson */
    function openEditor() {
        editJson.value = model.value
        isModalOpen.value = true
    }

    /** 保存编辑器内容：写回 model，自动切换至 JSON 渲染视图 */
    function saveJson() {
        model.value = editJson.value || { type: 'doc', content: [] }
        isModalOpen.value = false
    }

    /** 从 JSON 模式切换回纯文本，提取文本写入 model */
    function switchToTextMode() {
        if (isJson.value) {
            const text = jsonToText(model.value as Record<string, any>)
            model.value = text
        }
    }

    // ============== Tiptap JSON 与纯文本互转 ==============
    /** 从 Tiptap JSON 提取纯文本 */
    function jsonToText(doc: Record<string, any>): string {
        if (!doc || !doc.content) return ''
        return extractText(doc)
    }

    /** 递归遍历 Tiptap JSON，拼接文本节点与内联内容 */
    function extractText(node: Record<string, any>): string {
        if (!node) return ''
        if (node.type === 'text' && typeof node.text === 'string') return node.text

        // 特殊块级节点（vue/table 等）以换行分隔
        if (node.type === 'vue') {
            const content = node.attrs?.content || ''
            return content ? `[${node.attrs?.type || 'vue'}] ${content}` : ''
        }

        let text = ''
        const children = node.content || []
        const separator = node.type === 'paragraph' || node.type === 'heading' ? '\n' : ''
        for (const child of children) {
            text += extractText(child)
            if (separator && child.type === 'text') text += separator
        }
        if (node.type === 'paragraph' || node.type === 'heading') text += '\n'
        return text
    }

    return { isJson, isModalOpen, editJson, openEditor, saveJson, switchToTextMode }
}

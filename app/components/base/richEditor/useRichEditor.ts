import { ref, computed, type Ref } from 'vue'

export function useRichEditor(props: any, model: Ref<string | Record<string, any>>) {
    // Whether the current value is a JSON object (not array, null, or string)
    const isJson = computed(
        () => typeof model.value === 'object' && model.value !== null && !Array.isArray(model.value)
    )

    // Modal control
    const isModalOpen = ref(false)

    // Temporary JSON data inside the editor
    const editJson = ref<any>(null)

    /** Open the editor: convert the current model to JSON and assign it to editJson */
    function openEditor() {
        editJson.value = model.value
        isModalOpen.value = true
    }

    /** Save editor content: write back to model and switch to the JSON render view */
    function saveJson() {
        model.value = editJson.value || { type: 'doc', content: [] }
        isModalOpen.value = false
    }

    /** Switch from JSON mode back to plain text, extract the text and write it to model */
    function switchToTextMode() {
        if (isJson.value) {
            const text = jsonToText(model.value as Record<string, any>)
            model.value = text
        }
    }

    // ============== Tiptap JSON <-> plain text conversion ==============
    /** Extract plain text from Tiptap JSON */
    function jsonToText(doc: Record<string, any>): string {
        if (!doc || !doc.content) return ''
        return extractText(doc)
    }

    /** Recursively traverse the Tiptap JSON, concatenating text nodes and inline content */
    function extractText(node: Record<string, any>): string {
        if (!node) return ''
        if (node.type === 'text' && typeof node.text === 'string') return node.text

        // Special block nodes (vue/table etc.) are separated by newlines
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

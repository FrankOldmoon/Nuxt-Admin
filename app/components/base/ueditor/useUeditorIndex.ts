import { ref, computed, nextTick, onBeforeUnmount } from 'vue'
import extensions from './extensions'

export function useUeditorIndex(props: any, json: any) {
    const isReadonly = ref(false)

    const editorRef = ref<any>(null)
    const tiptapEditor = ref<any>(null)
    const cinsertsWrapper = ref<any>(null)
    // Controls whether cinsert is shown (avoids v-show re-hiding the wrapper on re-render)
    const cinsertsShown = ref(false)

    // Watch for ribbon refresh: umo-editor rebuilds .umo-ribbon-container on every update
    // (the element is replaced entirely rather than just its children changing), so watch the stable body,
    // re-query the ribbon and re-inject after each change to prevent cinsert from disappearing
    let ribbonObserver: MutationObserver | null = null
    function setupRibbonObserver() {
        const ribbon = document.querySelector('.umo-ribbon-container')
        if (!ribbon) {
            setTimeout(setupRibbonObserver, 200)
            return
        }
        if (ribbonObserver) return
        ribbonObserver = new MutationObserver(() => {
            injectCinserts()
        })
        ribbonObserver.observe(document.body, { childList: true, subtree: true })
    }

    onBeforeUnmount(() => {
        ribbonObserver?.disconnect()
        ribbonObserver = null
    })

    const options = computed(() => ({
        document: {
            content: json.value,
        },
        contentType: 'markdown',
        readonly: isReadonly.value,
        extensions,
        async onSave(content: any, page: any, document: any) {
            if (props.saveHandler) {
                return props.saveHandler(content)
            }
            localStorage.setItem('json', JSON.stringify(content.json))
            return 1
        },
        async onFileUpload(file: any) {
            if (!file) throw new Error('File not found')

            // Image compression
            const processedFile = file.type.startsWith('image/')
                ? await compressImageToWebp(file)
                : file

            const formData = new FormData()
            formData.append('files', processedFile)
            const res: any = await $fetch('/api/files/upload', {
                method: 'POST',
                body: formData,
            })
            const uploaded = res?.files?.[0] || res?.data?.[0]
            const path = uploaded?.path || uploaded?.url
            if (!path) throw new Error('Upload failed')
            return {
                url: path.startsWith('http') ? path : `/api/files/serve/${path}`,
                id: uploaded?.id,
            }
        },
        onFileDelete(id: any, url: any) {
            // The main project has no /api/files/delete endpoint; ignore the delete callback
        },
    }))

    // After the editor is created, move cinserts to the front of the toolbar and show it
    const onCreated = () => {
        nextTick(() => {
            setTimeout(() => {
                injectCinserts()
                setupRibbonObserver()
            }, 1000)
            if (isReadonly.value) {
                editorRef.value?.useEditor()?.setEditable(false)
            }
            // Disable paste
            if (!props.pasteable) {
                editorRef.value?.useEditor()?.on('paste', ({ event }: any) => {
                    event.preventDefault()
                })
            }
        })
    }

    const onPaste = async () => {
        // Upload after paste is handled internally by @umoteam/editor; no extra logic needed here
    }

    function injectCinserts() {
        const ribbon = document.querySelector('.umo-ribbon-container')
        if (!ribbon) {
            setTimeout(injectCinserts, 200)
            return
        }

        const wrapper = cinsertsWrapper.value
        if (!wrapper) return

        // Re-ensure visibility and front-most placement each time, preventing cinsert from disappearing after the ribbon is rebuilt
        wrapper.style.display = ''
        cinsertsShown.value = true
        if (!ribbon.contains(wrapper)) {
            ribbon.insertBefore(wrapper, ribbon.firstChild)
        }
    }

    const onChanged = () => {
        const markdown = editorRef.value.useEditor().getMarkdown()
        json.value = editorRef.value.getJSON()
        tiptapEditor.value = editorRef.value.useEditor()
    }

    const saveDocument = async () => {
        return editorRef.value.saveContent(true)
    }

    return {
        isReadonly,
        canInsert: computed(() => props.showInsert !== false),
        editorRef,
        tiptapEditor,
        cinsertsWrapper,
        cinsertsShown,
        options,
        onCreated,
        onPaste,
        onChanged,
        saveDocument,
    }
}

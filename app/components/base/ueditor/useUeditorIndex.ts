import { ref, computed, nextTick, onBeforeUnmount } from 'vue'
import extensions from './extensions'

export function useUeditorIndex(props: any, json: any) {
    const isReadonly = ref(false)

    const editorRef = ref<any>(null)
    const tiptapEditor = ref<any>(null)
    const cinsertsWrapper = ref<any>(null)
    // 控制 cinsert 是否显示（避免 v-show 在重渲染时把 wrapper 重新隐藏）
    const cinsertsShown = ref(false)

    // 监听工具栏刷新：umo-editor 每次更新都会重建 .umo-ribbon-container
    // （元素会被整体替换而非仅子节点变化），故监听稳定的 body，
    // 每次变化后重新查询 ribbon 并重新注入，避免 cinsert 消失
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

            // 图片压缩处理
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
            // 主项目无 /api/files/delete 接口，忽略删除回调
        },
    }))

    // editor 创建后，将 cinserts 移动到工具栏最前面并显示
    const onCreated = () => {
        nextTick(() => {
            setTimeout(() => {
                injectCinserts()
                setupRibbonObserver()
            }, 1000)
            if (isReadonly.value) {
                editorRef.value?.useEditor()?.setEditable(false)
            }
            // 禁用粘贴
            if (!props.pasteable) {
                editorRef.value?.useEditor()?.on('paste', ({ event }: any) => {
                    event.preventDefault()
                })
            }
        })
    }

    const onPaste = async () => {
        // 粘贴后由 @umoteam/editor 内部处理上传，此处无需额外逻辑
    }

    function injectCinserts() {
        const ribbon = document.querySelector('.umo-ribbon-container')
        if (!ribbon) {
            setTimeout(injectCinserts, 200)
            return
        }

        const wrapper = cinsertsWrapper.value
        if (!wrapper) return

        // 每次重新确保显示并置于工具栏最前面，防止 ribbon 重建后 cinsert 消失
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

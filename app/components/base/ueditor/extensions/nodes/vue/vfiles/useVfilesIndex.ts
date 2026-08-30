import { ref, computed, watch, inject } from 'vue'

export interface VfilesIndexProps {
    node?: any
    updateAttributes?: (attrs: Record<string, any>) => void
    [key: string]: any
}

export function useVfilesIndex(props: VfilesIndexProps) {
    const { t } = useI18n()

    const showConfig = inject('nodeViewShowConfig')
    const meta = inject('nodeViewMeta')

    meta.title = t('ueditor.vfiles')
    meta.icon = 'i-lucide-folder-tree'
    meta.hasSettings = true

    const parseConfig = () => {
        try {
            const raw = props.node.attrs.content
            if (raw) return JSON.parse(raw)
        } catch (_) { /* noop */ }
        return { items: [] }
    }
    const config = ref(parseConfig())

    function onConfigChange(newConfig) {
        config.value = newConfig
        props.updateAttributes({ content: JSON.stringify(newConfig) })
    }

    // 预览模式
    const selectedId = ref(null)
    const selectedFile = computed(() => {
        if (!selectedId.value) return null
        function find(items) {
            for (const item of items) {
                if (item.id === selectedId.value && item.type === 'file') return item
                if (item.children) {
                    const found = find(item.children)
                    if (found) return found
                }
            }
            return null
        }
        return find(config.value.items || [])
    })

    const navItems = computed(() => {
        function build(items) {
            return items.map(item => {
                const navItem = {
                    label: item.label || t('ueditor.vfilesUnnamed'),
                    icon: item.type === 'folder' ? 'i-lucide-folder' : 'i-lucide-file',
                    _id: item.id,
                    onSelect: () => { if (item.type === 'file') selectedId.value = item.id },
                }
                if (item.children && item.children.length) {
                    navItem.children = build(item.children)
                }
                return navItem
            })
        }
        return build(config.value.items || [])
    })

    // 编辑文件内容时防抖保存
    let saveTimer = null
    watch(() => selectedFile.value?.content, () => {
        if (saveTimer) clearTimeout(saveTimer)
        saveTimer = setTimeout(() => {
            function updateContent(items) {
                for (const item of items) {
                    if (item.id === selectedId.value && item.type === 'file') {
                        item.content = selectedFile.value.content
                        return true
                    }
                    if (item.children && updateContent(item.children)) return true
                }
                return false
            }
            updateContent(config.value.items || [])
            props.updateAttributes({ content: JSON.stringify(config.value) })
        }, 800)
    }, { deep: true })

    return { t, showConfig, config, onConfigChange, navItems, selectedFile }
}

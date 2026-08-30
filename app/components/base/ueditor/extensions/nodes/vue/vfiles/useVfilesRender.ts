import { ref, computed, watch } from 'vue'

export interface VfilesRenderProps {
    node?: any
}

export function useVfilesRender(props: VfilesRenderProps) {
    const { t } = useI18n()

    const config = computed(() => {
        try {
            const raw = props.node?.attrs?.content
            if (raw) return JSON.parse(raw)
        } catch (_) { /* noop */ }
        return { items: [] }
    })

    const selectedId = ref(null)

    // 自动选择第一个文件
    watch(() => config.value.items, (items) => {
        if (!selectedId.value && items && items.length) {
            function findFirstFile(nodes) {
                for (const n of nodes) {
                    if (n.type === 'file') return n.id
                    if (n.children) {
                        const f = findFirstFile(n.children)
                        if (f) return f
                    }
                }
                return null
            }
            selectedId.value = findFirstFile(items)
        }
    }, { immediate: true })

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

    function containsActive(items) {
        return items.some(i => i.id === selectedId.value || (i.children && containsActive(i.children)))
    }

    const navItems = computed(() => {
        function build(items) {
            return items.map(item => {
                const navItem = {
                    label: item.label || t('ueditor.vfilesUnnamed'),
                    icon: item.type === 'folder' ? 'i-lucide-folder' : 'i-lucide-file',
                }
                if (item.type === 'file') {
                    navItem.onSelect = () => { selectedId.value = item.id }
                    if (item.id === selectedId.value) navItem.active = true
                }
                if (item.children && item.children.length) {
                    navItem.children = build(item.children)
                    if (item.children.some(c => c.id === selectedId.value || (c.children && containsActive(c.children)))) {
                        navItem.defaultOpen = true
                    }
                }
                return navItem
            })
        }
        return build(config.value.items || [])
    })

    return { navItems, selectedFile }
}

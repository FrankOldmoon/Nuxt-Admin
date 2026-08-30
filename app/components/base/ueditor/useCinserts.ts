import { ref, computed } from 'vue'

export interface CinsertsProps {
    editor: { type: Object, default: null }
}

export function useCinserts(props: any, emit: any) {
    const { t } = useI18n()

    const markdownOpen = ref(false)
    const htmlOpen = ref(false)
    const jsonOpen = ref(false)

    // 下拉菜单：Markdown | HTML | JSON | 快速插入空白 html / pdf / tabs / vfiles
    const allItems = computed(() => {
        return [
            { label: t('ueditor.markdown.title'), icon: 'i-lucide-square-code', onSelect: () => { markdownOpen.value = true } },
            { label: t('ueditor.html.title'), icon: 'i-lucide-file-code', onSelect: () => { htmlOpen.value = true } },
            { label: t('ueditor.json.title'), icon: 'i-lucide-braces', onSelect: () => { jsonOpen.value = true } },
            { type: 'separator' },
            { label: t('ueditor.insertHtml'), icon: 'i-lucide-code', onSelect: () => insertTypedSheet('html') },
            { label: t('ueditor.insertPdf'), icon: 'i-lucide-file-text', onSelect: () => insertTypedSheet('pdf') },
            { label: t('ueditor.insertTabs'), icon: 'i-lucide-panel-top', onSelect: () => insertTabs() },
            { label: t('ueditor.insertVfiles'), icon: 'i-lucide-folder-tree', onSelect: () => insertVfiles() },
        ]
    })

    // 插入通用 vue 节点
    function insertVueNode(type: string, content = '') {
        const editor = props.editor?.useEditor()
        if (!editor) return
        editor.chain().focus().insertContent({
            type: 'vue',
            attrs: { content, type },
        }).run()
    }

    // 插入带空配置的 vue 节点（html / pdf 等）
    function insertTypedSheet(type: string) {
        insertVueNode(type, '')
    }

    // 插入 tabs 节点（带默认配置）
    function insertTabs() {
        const defaultConfig = JSON.stringify({
            tabs: [
                { label: 'Tab 1', content: '' },
                { label: 'Tab 2', content: '' },
            ],
        })
        insertVueNode('tabs', defaultConfig)
    }

    // 插入 vfiles 虚拟文件夹节点（带默认配置）
    function insertVfiles() {
        const defaultConfig = JSON.stringify({
            items: [
                { id: 'f1', label: 'Folder 1', type: 'folder', children: [
                    { id: 'file1', label: 'file1.md', type: 'file', content: '' },
                ]},
            ],
        })
        insertVueNode('vfiles', defaultConfig)
    }

    return {
        markdownOpen,
        htmlOpen,
        jsonOpen,
        allItems,
    }
}

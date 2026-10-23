import { ref, computed } from 'vue'

export interface CinsertsProps {
    editor: { type: Object, default: null }
}

export function useCinserts(props: any, emit: any) {
    const { t } = useI18n()

    const markdownOpen = ref(false)
    const htmlOpen = ref(false)
    const jsonOpen = ref(false)

    // Dropdown menu: Markdown | HTML | JSON | quick insert of blank html / pdf / tabs / vfiles
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

    // Insert a generic vue node
    function insertVueNode(type: string, content = '') {
        const editor = props.editor?.useEditor()
        if (!editor) return
        editor.chain().focus().insertContent({
            type: 'vue',
            attrs: { content, type },
        }).run()
    }

    // Insert a vue node with an empty config (html / pdf etc.)
    function insertTypedSheet(type: string) {
        insertVueNode(type, '')
    }

    // Insert a tabs node (with default config)
    function insertTabs() {
        const defaultConfig = JSON.stringify({
            tabs: [
                { label: 'Tab 1', content: '' },
                { label: 'Tab 2', content: '' },
            ],
        })
        insertVueNode('tabs', defaultConfig)
    }

    // Insert a vfiles virtual folder node (with default config)
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

import { ref, onMounted } from 'vue'

export interface VfilesEditProps {
    config?: { items?: any[] } | Record<string, any>
}

export function useVfilesEdit(props: VfilesEditProps, emit: (event: string, ...args: any[]) => void) {
    const { t } = useI18n()

    const editItems = ref<any[]>([])
    let idCounter = 0

    function rebuildEditItems() {
        editItems.value = []
        // 先扫描已有数值 id（形如 n0、n1）的最大序号，避免新增项与旧 id 冲突
        let maxNum = -1
        function scanMax(items) {
            for (const item of items) {
                if (item.id) {
                    const m = /^n(\d+)$/.exec(item.id)
                    if (m && m[1]) maxNum = Math.max(maxNum, parseInt(m[1], 10))
                }
                if (item.children && item.children.length) scanMax(item.children)
            }
        }
        scanMax(props.config?.items || [])
        if (maxNum + 1 > idCounter) idCounter = maxNum + 1

        // 重建时对缺失或重复的 id 重新生成，确保唯一
        const seenIds = new Set()
        function walk(items, depth) {
            for (const item of items) {
                let id = item.id
                if (!id || seenIds.has(id)) {
                    id = `n${idCounter++}`
                }
                seenIds.add(id)
                editItems.value.push({
                    id,
                    label: item.label || '',
                    type: item.type || 'file',
                    content: item.content || '',
                    depth,
                })
                if (item.children && item.children.length) {
                    walk(item.children, depth + 1)
                }
            }
        }
        walk(props.config?.items || [], 0)
    }

    function buildTree() {
        const items = JSON.parse(JSON.stringify(editItems.value))
        const root = { children: [] }
        const stack = [root]
        for (const node of items) {
            while (stack.length > node.depth + 1) stack.pop()
            const parent = stack[stack.length - 1]
            const item = { id: node.id, label: node.label, type: node.type }
            if (node.type === 'file') item.content = node.content
            else item.children = []
            parent.children.push(item)
            if (node.type === 'folder') stack.push(item)
        }
        return root.children
    }

    function apply() {
        const items = buildTree()
        emit('update:config', { items })
        emit('close')
    }

    function addItem(type) {
        editItems.value.push({ id: `n${idCounter++}`, label: '', type, content: '', depth: 0 })
    }
    function addChild(parentNode, type) {
        const idx = editItems.value.indexOf(parentNode)
        editItems.value.splice(idx + 1, 0, { id: `n${idCounter++}`, label: '', type, content: '', depth: parentNode.depth + 1 })
    }
    function removeItem(idx) {
        const node = editItems.value[idx]
        const removedDepth = node.depth
        editItems.value.splice(idx, 1)
        while (idx < editItems.value.length && editItems.value[idx].depth > removedDepth) {
            editItems.value.splice(idx, 1)
        }
    }
    function moveItem(idx, dir) {
        const newIdx = idx + dir
        if (newIdx < 0 || newIdx >= editItems.value.length) return
        const node = editItems.value[idx]
        const target = editItems.value[newIdx]
        if (dir > 0 && target.depth > node.depth) return
        const items = editItems.value
        const moved = items.splice(idx, 1)[0]
        items.splice(newIdx, 0, moved)
    }

    // 组件挂载时从 config 重建 editItems
    onMounted(() => {
        rebuildEditItems()
    })

    return { t, editItems, apply, addItem, addChild, removeItem, moveItem }
}

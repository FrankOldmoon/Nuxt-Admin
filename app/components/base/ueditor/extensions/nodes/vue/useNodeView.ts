import { ref, reactive, watch, provide } from 'vue'

export function useNodeView(props: any, emit: any) {
    const { t } = useI18n()
    const comp = ref<any>(null)
    const loading = ref(false)

    // ====================== Shared state (provided to child components) ======================

    // Config panel toggle
    const showConfig = ref(false)

    // Component meta info (set by child components in setup)
    const meta = reactive({
        title: '',
        icon: '',
        hasSettings: false,
    })

    // Provided to child components
    provide('nodeViewShowConfig', showConfig)
    provide('nodeViewMeta', meta)

    // ====================== Dynamic child component loading ======================

    // Pre-register all extension component paths (import.meta.glob generates the mapping at build time; lazily loaded at runtime)
    const extensionComponents = import.meta.glob([
        './*/*.vue',
    ])

    // After the component is created, notify the parent via emit('init', cid) to update the node content attribute
    function onInit(cid: any) {
        if (cid != null) {
            props.updateAttributes({ content: String(cid) })
        }
    }

    watch(
        () => props.node.attrs.type,
        async (type: string) => {
            // Reset meta when switching components
            meta.title = ''
            meta.icon = ''
            meta.hasSettings = false
            showConfig.value = false

            comp.value = null
            if (!type) return
            loading.value = true
            try {
                // Look for the extension in this directory: ./timer/index.vue (primary, three-file structure)
                const primary = `./${type}/index.vue`
                const loader = extensionComponents[primary]
                if (loader) {
                    const mod = await loader()
                    comp.value = mod.default
                } else {
                    console.warn(`组件 ${type} 不存在`)
                }
            } catch (err) {
                console.warn(`组件 ${type} 加载失败`, err)
            } finally {
                loading.value = false
            }
        },
        { immediate: true }
    )

    return {
        t,
        comp,
        loading,
        showConfig,
        meta,
        onInit,
    }
}

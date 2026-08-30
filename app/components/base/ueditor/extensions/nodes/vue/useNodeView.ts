import { ref, reactive, watch, provide } from 'vue'

export function useNodeView(props: any, emit: any) {
    const { t } = useI18n()
    const comp = ref<any>(null)
    const loading = ref(false)

    // ====================== 通用状态（provide 给子组件） ======================

    // 配置面板开关
    const showConfig = ref(false)

    // 组件元信息（子组件在 setup 中设置）
    const meta = reactive({
        title: '',
        icon: '',
        hasSettings: false,
    })

    // 提供给子组件
    provide('nodeViewShowConfig', showConfig)
    provide('nodeViewMeta', meta)

    // ====================== 动态加载子组件 ======================

    // 预注册所有扩展组件路径（import.meta.glob 在构建时生成映射，运行时按需懒加载）
    const extensionComponents = import.meta.glob([
        './*/*.vue',
    ])

    // 组件创建后通过 emit('init', cid) 通知父级更新节点 content 属性
    function onInit(cid: any) {
        if (cid != null) {
            props.updateAttributes({ content: String(cid) })
        }
    }

    watch(
        () => props.node.attrs.type,
        async (type: string) => {
            // 切换组件时重置 meta
            meta.title = ''
            meta.icon = ''
            meta.hasSettings = false
            showConfig.value = false

            comp.value = null
            if (!type) return
            loading.value = true
            try {
                // 查找本目录下的扩展：./timer/index.vue（主，三文件结构）
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

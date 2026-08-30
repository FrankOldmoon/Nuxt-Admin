import { ref, computed, nextTick, watch, onMounted, onBeforeUnmount } from 'vue'

export interface PdfRenderProps {
    node?: any
}

const PDFJS_CDN = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs'
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs'

export function usePdfRender(props: PdfRenderProps) {
    const { t } = useI18n()

    const previewRef = ref<any>(null)
    const canvasRefs = ref<any>({})
    const textLayerRefs = ref<any>({})
    const renderedPages = ref<number[]>([])
    const rendering = ref(false)
    let pdfDoc: any = null

    const config = computed(() => {
        try {
            const raw = props.node?.attrs?.content
            if (raw) return JSON.parse(raw)
        } catch (_) { /* noop */ }
        return {}
    })

    const displayPages = computed(() => {
        const pagesStr = config.value.pages?.trim()
        if (!pagesStr) return null
        const result: number[] = []
        for (const part of pagesStr.split(',')) {
            const trimmed = part.trim()
            const rangeMatch = trimmed.match(/^(\d+)-(\d+)$/)
            if (rangeMatch) {
                const start = parseInt(rangeMatch[1])
                const end = parseInt(rangeMatch[2])
                for (let i = start; i <= end; i++) result.push(i)
            } else {
                const n = parseInt(trimmed)
                if (!isNaN(n)) result.push(n)
            }
        }
        return result.length ? result : null
    })

    async function loadPdfJs() {
        const w = window as any
        if (w.pdfjsLib) return true
        try {
            const module = await import(/* @vite-ignore */ PDFJS_CDN)
            w.pdfjsLib = module
            if (module.GlobalWorkerOptions) {
                module.GlobalWorkerOptions.workerSrc = PDFJS_WORKER
            }
            return true
        } catch (e) {
            console.error('pdf.js 加载失败', e)
            return false
        }
    }

    async function renderPdf() {
        if (!config.value.url) return
        rendering.value = true

        const ok = await loadPdfJs()
        if (!ok) {
            rendering.value = false
            return
        }

        try {
            const w = window as any
            const loadingTask = w.pdfjsLib.getDocument(config.value.url)
            pdfDoc = await loadingTask.promise
            const totalPages = pdfDoc.numPages
            const pagesToRender = displayPages.value || Array.from({ length: totalPages }, (_, i) => i + 1)

            canvasRefs.value = {}
            textLayerRefs.value = {}
            renderedPages.value = pagesToRender

            await nextTick()
            await nextTick()

            for (const pageNum of pagesToRender) {
                if (pageNum < 1 || pageNum > totalPages) continue
                const canvas = canvasRefs.value[pageNum]
                const textLayerDiv = textLayerRefs.value[pageNum]
                if (!canvas) continue
                const page = await pdfDoc.getPage(pageNum)
                const viewport = page.getViewport({ scale: 1.2 })

                const context = canvas.getContext('2d')
                canvas.width = viewport.width
                canvas.height = viewport.height
                canvas.style.width = '100%'
                canvas.style.height = 'auto'

                await page.render({ canvasContext: context, viewport }).promise

                if (textLayerDiv) {
                    const textContent = await page.getTextContent()
                    textLayerDiv.innerHTML = ''
                    textLayerDiv.style.width = `${viewport.width}px`
                    textLayerDiv.style.height = `${viewport.height}px`

                    const Util = w.pdfjsLib.Util

                    for (const item of textContent.items) {
                        if (!item.str || !item.transform) continue

                        const span = document.createElement('span')
                        span.textContent = item.str

                        const tx = Util
                            ? Util.transform(viewport.transform, item.transform)
                            : [1, 0, 0, 1, item.transform[4], item.transform[5]]

                        const fontHeight = Math.hypot(tx[2], tx[3]) || (item.height || 10)

                        span.style.position = 'absolute'
                        span.style.left = `${tx[4]}px`
                        span.style.top = `${tx[5] - fontHeight}px`
                        span.style.fontSize = `${fontHeight}px`
                        span.style.fontFamily = item.fontName ? `${item.fontName}, sans-serif` : 'sans-serif'
                        span.style.transformOrigin = '0% 0%'

                        const angle = Math.atan2(tx[1], tx[0])
                        if (angle !== 0) {
                            span.style.transform = `rotate(${angle}rad)`
                        }

                        textLayerDiv.appendChild(span)
                    }
                }
            }
        } catch (e) {
            console.error('PDF 渲染失败', e)
        } finally {
            rendering.value = false
        }
    }

    onMounted(() => {
        if (config.value.url) {
            nextTick(() => renderPdf())
        }
    })

    watch(() => config.value.url, () => {
        nextTick(() => renderPdf())
    })

    watch(() => config.value.pages, () => {
        nextTick(() => renderPdf())
    })

    onBeforeUnmount(() => {
        pdfDoc?.destroy?.()
    })

    return {
        t, config, previewRef, canvasRefs, textLayerRefs, renderedPages, rendering,
    }
}

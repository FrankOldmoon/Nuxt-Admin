import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

export interface HtmlRenderProps {
    node?: any
}

export function useHtmlRender(props: HtmlRenderProps) {
    const contentBox = ref<any>(null)
    const autoHeight = ref(500)
    const isFullscreen = ref(false)

    const userHtml = computed(() => props.node?.attrs?.content || '')
    // 手动设置的高度：>0 时覆盖自适应高度
    const fixedHeight = computed(() => {
      const h = Number(props.node?.attrs?.height)
      return h > 0 ? h : 0
    })
    // 展示高度 = 手动高度或内容自适应高度
    const iframeHeight = computed(() => fixedHeight.value > 0 ? fixedHeight.value : autoHeight.value)

    /** 构造 iframe srcdoc：包裹为基础 HTML 文档 + 高度上报脚本 */
    const iframeContent = computed(() => {
      const html = userHtml.value
      // 已是完整 HTML 文档则直接使用
      const isFullDoc = /<html[\s>]/i.test(html) || /<!DOCTYPE/i.test(html)
      if (isFullDoc) return html

      return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
* { box-sizing: border-box; }
img { max-width: 100%; height: auto; }
body { margin: 0; padding: 8px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
</style>
</head><body>${html}
<script>
(function () {
  function reportHeight() {
    var h = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    );
    if (h > 0) parent.postMessage({ type: 'html-node-height', height: h }, '*');
  }
  if (document.readyState === 'complete') reportHeight();
  else window.addEventListener('load', reportHeight);
  new MutationObserver(reportHeight).observe(document.body, {
    childList: true,
    subtree: true,
  });
})();
<\/script>
</body></html>`
    })

    function onMessage(e) {
      if (e.data?.type === 'html-node-height' && e.data.height > 0) {
        autoHeight.value = e.data.height
      }
    }

    function onFullscreenChange() {
      isFullscreen.value = document.fullscreenElement === contentBox.value
    }

    const toggleFullscreen = () => {
      if (!import.meta.client) return
      if (document.fullscreenElement) {
        document.exitFullscreen()
      } else {
        contentBox.value?.requestFullscreen().catch(() => {})
      }
    }

    onMounted(() => {
      window.addEventListener('message', onMessage)
      document.addEventListener('fullscreenchange', onFullscreenChange)
    })

    onBeforeUnmount(() => {
      window.removeEventListener('message', onMessage)
      document.removeEventListener('fullscreenchange', onFullscreenChange)
      if (import.meta.client && document.fullscreenElement === contentBox.value) {
        document.exitFullscreen().catch(() => {})
      }
    })

    return { contentBox, iframeHeight, isFullscreen, iframeContent, toggleFullscreen }
}

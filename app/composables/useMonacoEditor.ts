/**
 * Monaco Editor：CDN 加载 + 初始化 + 格式化
 */
const CDN_BASE = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs'

// 进行中的脚本加载 Promise，避免并发实例重复加载 / 在脚本未执行完就 resolve
const scriptLoadPromises = new Map<string, Promise<void>>()

// Monaco 全局加载 Promise（单例），保证 AMD loader 引导流程只执行一次
let monacoLoadPromise: Promise<any> | null = null

function loadScript(url: string): Promise<void> {
  if (scriptLoadPromises.has(url)) return scriptLoadPromises.get(url)!

  const promise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${url}"]`) as HTMLScriptElement | null
    if (existing) {
      // 标签已存在：若已加载完成直接 resolve，否则等待其 onload（修复竞态）
      if (existing.dataset.loaded === 'true') {
        resolve()
        return
      }
      existing.addEventListener('load', () => resolve())
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${url}`)))
      return
    }
    const script = document.createElement('script')
    script.src = url
    script.onload = () => {
      script.dataset.loaded = 'true'
      resolve()
    }
    script.onerror = () => reject(new Error(`Failed to load ${url}`))
    document.head.appendChild(script)
  })
  scriptLoadPromises.set(url, promise)
  return promise
}

function loadMonaco(): Promise<any> {
  if (monacoLoadPromise) return monacoLoadPromise

  monacoLoadPromise = (async () => {
    if ((window as any).monaco) return (window as any).monaco

    await loadScript(`${CDN_BASE}/loader.js`)

    const req = (window as any).require
    if (!req || typeof req.config !== 'function') {
      throw new Error('Monaco AMD loader 未能注册 window.require')
    }

    return new Promise((resolve) => {
      req.config({ paths: { vs: CDN_BASE } })
      req(['vs/editor/editor.main'], () => {
        resolve((window as any).monaco)
      })
    })
  })()

  // 失败时清空缓存以便后续可重试
  monacoLoadPromise.catch(() => { monacoLoadPromise = null })
  return monacoLoadPromise
}

export function useMonacoEditor(
  modelValue: () => string,
  language: () => string,
  theme: () => string,
  readOnly: () => boolean,
  fontSize: () => number,
  autoFormat: () => boolean,
  formatOptions: () => any,
  onUpdate: (val: string) => void,
  onReady: (editor: any) => void,
) {
  const editorContainer = ref<HTMLElement | null>(null)
  let editor: any = null
  let monaco: any = null

  async function formatEditorCode() {
    if (!editor || !monaco || !autoFormat()) return
    const model = editor.getModel()
    if (!model) return

    try {
      const formatAction = editor.getAction('editor.action.formatDocument')
      if (formatAction) {
        await formatAction.run()
        const newValue = editor.getValue()
        onUpdate(newValue)
      }
    } catch (_) { /* 某些语言没有格式化器，静默忽略 */ }
  }

  async function initEditor() {
    monaco = await loadMonaco()

    editor = monaco.editor.create(editorContainer.value, {
      value: modelValue(),
      language: language(),
      theme: theme(),
      readOnly: readOnly(),
      fontSize: fontSize(),
      automaticLayout: true,
      minimap: { enabled: true },
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      tabSize: formatOptions().tabSize,
    })

    editor.onDidChangeModelContent(() => {
      onUpdate(editor.getValue())
    })

    onReady(editor)

    nextTick(() => formatEditorCode())
  }

  watch(modelValue, async (newVal) => {
    if (!editor) return
    const current = editor.getValue()
    if (newVal === current) return
    editor.setValue(newVal)
    await nextTick()
    formatEditorCode()
  })

  watch(language, (newLang) => {
    if (editor) {
      monaco.editor.setModelLanguage(editor.getModel(), newLang)
      nextTick(() => formatEditorCode())
    }
  })

  watch(theme, (newTheme) => {
    if (monaco) monaco.editor.setTheme(newTheme)
  })

  onMounted(() => {
    initEditor()
  })

  onBeforeUnmount(() => {
    if (editor) {
      editor.dispose()
      editor = null
    }
  })

  return {
    editorContainer,
    getEditor: () => editor,
    getMonaco: () => monaco,
    formatCode: formatEditorCode,
  }
}

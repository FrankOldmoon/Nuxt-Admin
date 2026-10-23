/**
 * Monaco Editor: CDN loading + initialization + formatting
 */
const CDN_BASE = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min/vs'

// In-flight script loading promises, avoiding duplicate loads by concurrent instances / premature resolution before the script finishes
const scriptLoadPromises = new Map<string, Promise<void>>()

// Monaco global loading promise (singleton), ensuring the AMD loader bootstrap runs only once
let monacoLoadPromise: Promise<any> | null = null

function loadScript(url: string): Promise<void> {
  if (scriptLoadPromises.has(url)) return scriptLoadPromises.get(url)!

  const promise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector(`script[src="${url}"]`) as HTMLScriptElement | null
    if (existing) {
      // Tag already exists: resolve immediately if loaded, otherwise wait for its onload (fixes race condition)
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

  // Clear the cache on failure so it can be retried later
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
    } catch (_) { /* some languages have no formatter, silently ignore */ }
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

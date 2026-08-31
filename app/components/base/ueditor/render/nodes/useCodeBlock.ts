import { ref, computed, inject } from 'vue'
import hljs from 'highlight.js'

/** 渲染节点：codeBlock 的 attrs 与 content 结构 */
interface CodeBlockAttrs { language?: string, theme?: string }
interface CodeBlockText { text?: string }
interface CodeBlockNode { attrs?: CodeBlockAttrs, content?: CodeBlockText[] }
interface CodeBlockProps { node: CodeBlockNode }

/** 语言别名 → highlight.js 注册名（js/ts/py/sh 等常见简写需映射） */
const LANG_ALIASES: Record<string, string> = {
  'js': 'javascript', 'jsx': 'javascript', 'mjs': 'javascript', 'cjs': 'javascript', 'node': 'javascript',
  'ts': 'typescript', 'tsx': 'typescript',
  'py': 'python', 'python3': 'python',
  'sh': 'bash', 'shell': 'bash', 'zsh': 'bash',
  'yml': 'yaml',
  'c++': 'cpp', 'cc': 'cpp', 'hpp': 'cpp',
  'golang': 'go', 'go.mod': 'go',
  'html': 'xml', 'htm': 'xml', 'markup': 'xml', 'svg': 'xml',
  'text': 'plaintext', 'txt': 'plaintext',
  'rb': 'ruby', 'rs': 'rust', 'kt': 'kotlin', 'cs': 'csharp', 'md': 'markdown',
  'jsonc': 'json'
}

/** 在 .dark（含 [theme-mode=dark]）下是否处于暗色 */
function isDark(): boolean {
  if (typeof document === 'undefined') return false
  const html = document.documentElement
  return !!html && (html.classList.contains('dark') || html.getAttribute('theme-mode') === 'dark' || html.classList.contains('theme-dark'))
}

export function useCodeBlock(props: CodeBlockProps) {
  const inQuiz = inject('inQuiz', false)
  const inQuestion = inject('inQuestion', false)
  const hideActions = computed(() => inQuiz || inQuestion)

  const attrs = computed(() => props.node.attrs || {})
  const language = computed(() => attrs.value.language || 'plaintext')
  const normLang = computed(() => (language.value || '').toLowerCase().trim())

  // 未显式指定 theme 时跟随宿主明暗模式
  const theme = computed(() => attrs.value.theme || (isDark() ? 'dark' : 'light'))

  const codeText = computed(() =>
    (props.node.content || []).map(c => c.text || '').join('')
  )

  const lineCount = computed(() => {
    const text = codeText.value
    if (!text) return 1
    return text.split('\n').length
  })

  const escapeHtml = (str: string) =>
    String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

  const highlightedHtml = computed(() => {
    const text = codeText.value || ''
    if (!text) return ''
    const lang = normLang.value
    try {
      const target = lang && hljs.getLanguage(lang) ? lang : LANG_ALIASES[lang]
      if (target && hljs.getLanguage(target)) {
        return hljs.highlight(text, { language: target }).value
      }
      return hljs.highlightAuto(text).value
    } catch (e) {
      console.error('[code-block] highlight error:', e)
      return escapeHtml(text)
    }
  })

  const copied = ref(false)
  let copyTimer: ReturnType<typeof setTimeout> | null = null

  const copyIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>`
  const checkIcon = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(codeText.value)
    } catch {
      const textarea = document.createElement('textarea')
      textarea.value = codeText.value
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
    }
    copied.value = true
    if (copyTimer) {
      clearTimeout(copyTimer)
    }
    copyTimer = setTimeout(() => {
      copied.value = false
    }, 2000)
  }

  return { hideActions, language, theme, codeText, lineCount, highlightedHtml, copied, copyIcon, checkIcon, copyCode }
}

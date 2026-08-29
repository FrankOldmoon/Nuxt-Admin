/**
 * markdown rendering utilities: question content / parsing / options all go through here
 *
 * - markdown-it base rendering (html:true, allows rendering raw HTML guarded by sanitizeHtml below)
 * - @mdit/plugin-katex math formulas ($...$ inline / $$...$$ block)
 * - highlight.js code highlighting (github-dark theme, styles imported in markdownViewer)
 * - task lists ("- [ ] / - [x]") converted to checkboxes
 * - link URL allowlist filtering + forced open in new tab; image src filtered too
 * - sanitizeHtml: strips <script>, <style>, <iframe> (srcdoc sandbox uses srcDoc attribute instead),
 *   on* event attributes, javascript:/vbscript: protocols
 *
 * The singleton behaves identically in node and the browser, so SSR and client
 * rendering produce the same output.
 */
import MarkdownIt from 'markdown-it'
import type { MarkdownIt as MarkdownItType, StateCore, Token, RendererRule } from 'markdown-it'
import { katex as katexPlugin } from '@mdit/plugin-katex'
import hljs from 'highlight.js/lib/common'

/** Link/image URL allowlist: only http(s), mailto, safe data:image and protocol-less relative paths/#anchors — blocks javascript: protocol injection */
export function isSafeUrl(url: string): boolean {
  const u = url.trim().toLowerCase()
  if (u.startsWith('javascript:') || u.startsWith('vbscript:')) return false
  if (u.startsWith('data:')) return /^data:image\/(gif|png|jpeg|webp);/.test(u)
  return !/^[a-z][a-z0-9+.-]*:/.test(u) || u.startsWith('http://') || u.startsWith('https://') || u.startsWith('mailto:')
}

const md: MarkdownItType = new MarkdownIt({
  html: true,
  breaks: true,
  linkify: true
}).use(katexPlugin, { throwOnError: false, errorColor: '#cc3333' })

/**
 * Lightweight HTML sanitizer: required once html:true is set, blocks common XSS vectors.
 * - Removes whole <script>/<style>/<iframe>/<object>/<embed>/<link>/<meta> blocks
 * - Removes all on* event attributes (onclick/onerror/onload etc.)
 * - Neutralizes javascript:/vbscript: protocols in attribute values
 * Note: this is a pragmatic regex-based implementation that stops most hand-crafted
 * common attacks; content still comes from the trusted backend/question authors,
 * not fully open user input.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return ''
  let out = html
  // 1. Remove dangerous tags and their content as whole blocks
  out = out.replace(/<(script|style|iframe|object|embed|link|meta|noscript|template)(\s[^>]*)?>[\s\S]*?<\/\1\s*>/gi, '')
  // 2. Remove unclosed dangerous self-closing/empty tags
  out = out.replace(/<(script|iframe|object|embed|link|meta|base)(\s[^>]*)?>/gi, '')
  // 3. Remove all on* event attributes (onclick/onerror/onload/onmouseover/onfocus …)
  out = out.replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  // 4. Neutralize javascript:/vbscript: protocols in href/src/action/formaction/xlink:href etc.
  out = out.replace(/(href|src|action|formaction|xlink:href|data|poster|background|dynsrc|lowsrc)\s*=\s*("(?:javascript|vbscript):[^"]*"|'(?:javascript|vbscript):[^']*'|(?:javascript|vbscript):[^\s>]+)/gi, '$1="#"')
  return out
}

const escapeHtml = md.utils.escapeHtml

/* ---- Task lists: "- [ ] / - [x]" list items into checkboxes (a simplified take on markdown-it-task-lists) ---- */
md.core.ruler.after('inline', 'md-task-list', (state: StateCore) => {
  const tokens = state.tokens
  for (let i = 2; i < tokens.length; i++) {
    const inline = tokens[i]!
    if (inline.type !== 'inline') continue
    // Only handle the first paragraph of a list item (list_item_open > paragraph_open > inline)
    if (tokens[i - 1]!.type !== 'paragraph_open' || tokens[i - 2]!.type !== 'list_item_open') continue
    const first = inline.children?.[0]
    if (!first || first.type !== 'text') continue
    const m = /^\[([ xX])\]\s+/.exec(first.content)
    if (!m) continue
    const checked = m[1]!.toLowerCase() === 'x'
    first.content = first.content.slice(m[0].length)
    const checkbox = new state.Token('md_checkbox', 'input', 0)
    checkbox.attrs = checked
      ? [['type', 'checkbox'], ['checked', ''], ['disabled', '']]
      : [['type', 'checkbox'], ['disabled', '']]
    inline.children!.unshift(checkbox)
    tokens[i - 2]!.attrJoin('class', 'md-task-item')
    tokens[i - 1]!.attrJoin('class', 'md-task-para')
  }
  return true
})

md.renderer.rules.md_checkbox = (tokens: Token[], idx: number) => {
  const checked = tokens[idx]!.attrGet('checked') !== null
  return `<input class="md-checkbox" type="checkbox" disabled${checked ? ' checked' : ''}>`
}

/* ---- Code blocks: highlight.js highlighting + top-right language label ---- */
md.renderer.rules.fence = (tokens: Token[], idx: number) => {
  const token = tokens[idx]!
  const lang = (token.info || '').trim().split(/\s+/)[0] ?? ''
  let body: string
  if (lang && hljs.getLanguage(lang)) {
    try {
      body = hljs.highlight(token.content, { language: lang, ignoreIllegals: true }).value
    } catch {
      body = escapeHtml(token.content)
    }
  } else {
    body = escapeHtml(token.content)
  }
  const label = lang ? `<span class="md-code-lang">${escapeHtml(lang)}</span>` : ''
  return `<div class="md-code-block">${label}<pre><code class="hljs language-${escapeHtml(lang)}">${body}</code></pre></div>`
}

/* ---- Links: href allowlist + open in new tab ---- */
const linkOpenRule: RendererRule = (tokens, idx, options, _env, self) => {
  const token = tokens[idx]!
  const hrefIdx = token.attrIndex('href')
  if (hrefIdx >= 0 && !isSafeUrl(String(token.attrs![hrefIdx]![1] ?? ''))) {
    token.attrs![hrefIdx]![1] = '#'
  }
  token.attrSet('target', '_blank')
  token.attrSet('rel', 'noopener noreferrer')
  return self.renderToken(tokens, idx, options)
}
md.renderer.rules.link_open = linkOpenRule

/* ---- Images: src allowlist ---- */
const imageRule: RendererRule = (tokens, idx, options, _env, self) => {
  const token = tokens[idx]!
  const srcIdx = token.attrIndex('src')
  if (srcIdx >= 0 && !isSafeUrl(String(token.attrs![srcIdx]![1] ?? ''))) {
    token.attrs![srcIdx]![1] = ''
  }
  return self.renderToken(tokens, idx, options)
}
md.renderer.rules.image = imageRule

/** Render markdown to HTML; inline=true renders only inline syntax (used for short text like option labels, produces no block tags).
 *  html:true lets raw HTML pass through; the output is then run through sanitizeHtml to block XSS vectors. */
export function renderMarkdown(source: string, inline = false): string {
  const raw = inline ? md.renderInline(source ?? '') : md.render(source ?? '')
  return sanitizeHtml(raw)
}

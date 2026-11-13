import MarkdownIt from 'markdown-it'

/**
 * Chat Markdown renderer.
 *
 * Raw HTML stays disabled (model output is untrusted): tags are escaped and
 * only the Markdown subset below becomes markup. Links open in a new tab with
 * `noopener`; markdown-it already rejects `javascript:` URLs.
 */
const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
  typographer: false
})

const defaultLinkOpen = md.renderer.rules.link_open
  ?? ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options))

md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx]?.attrSet('target', '_blank')
  tokens[idx]?.attrSet('rel', 'noopener noreferrer nofollow')
  return defaultLinkOpen(tokens, idx, options, env, self)
}

/** Render assistant Markdown to sanitized HTML. */
export function renderMarkdown(text: string | null | undefined): string {
  if (!text) return ''
  return md.render(text)
}

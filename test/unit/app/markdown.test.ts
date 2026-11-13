import { describe, expect, it } from 'vitest'
import { renderMarkdown } from '../../../app/utils/markdown'

describe('renderMarkdown', () => {
  it('renders common markdown blocks', () => {
    const html = renderMarkdown('## 标题\n\n- 第一项\n- 第二项\n\n**加粗** 与 `code`')
    expect(html).toContain('<h2>标题</h2>')
    expect(html).toContain('<li>第一项</li>')
    expect(html).toContain('<strong>加粗</strong>')
    expect(html).toContain('<code>code</code>')
  })

  it('escapes raw HTML instead of rendering it', () => {
    const html = renderMarkdown('<script>alert(1)</script>\n\n<img src=x onerror="alert(2)">')
    expect(html).not.toContain('<script>')
    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;script&gt;')
  })

  it('opens links safely and refuses javascript: URLs', () => {
    const html = renderMarkdown('[doc](https://example.com) [bad](javascript:alert(1))')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('rel="noopener noreferrer nofollow"')
    expect(html).toContain('target="_blank"')
    expect(html).not.toContain('href="javascript:')
  })

  it('returns an empty string for empty input', () => {
    expect(renderMarkdown('')).toBe('')
    expect(renderMarkdown(null)).toBe('')
  })
})

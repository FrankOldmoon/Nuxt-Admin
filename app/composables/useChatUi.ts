/**
 * Client-side "generative UI" registry for the chat widget.
 *
 * Extension of the plan-B protocol: alongside ```tool blocks (pure compute),
 * the model may end a reply with a ```ui block that "points at" a registered
 * UI card:
 *
 *   ```ui
 *   {"ui": "tools.mute"}
 *   ```
 *
 * Cards are rendered by audited Vue components — the model can never inject
 * markup, scripts or arbitrary URLs, only reference ids from this registry:
 *  - kind "embed": an iframe of a whitelisted same-origin tool page (reuses
 *    the tools module UIs as-is, zero duplication; files stay on-device)
 *  - kind "component": a hand-written Vue component (e.g. the inline login
 *    card). Forms are just components — a future form card registers here.
 *
 * Adding a new UI = add an entry below + render it in
 * app/components/chat/ChatUiBlock.vue.
 */

export interface ChatUiDescriptor {
  kind: 'embed' | 'component'
  /** Same-origin path for embed cards; component tag for component cards. */
  target: string
  title: { en: string, zh: string }
  note: { en: string, zh: string }
}

function embed(target: string, en: string, zh: string, noteEn: string, noteZh: string): ChatUiDescriptor {
  return { kind: 'embed', target, title: { en, zh }, note: { en: noteEn, zh: noteZh } }
}

export const CHAT_UI_REGISTRY: Record<string, ChatUiDescriptor> = {
  'tools.compress': embed('/media/compress/', 'Media compress', '媒体压缩', 'On-device tool page', '本地处理 · 工具页'),
  'tools.rotate': embed('/media/rotate/', 'Video rotate', '视频旋转', 'On-device tool page', '本地处理 · 工具页'),
  'tools.mute': embed('/media/mute/', 'Video mute', '视频去除音轨', 'On-device tool page', '本地处理 · 工具页'),
  'tools.mosaic': embed('/media/mosaic/', 'Video mosaic', '视频马赛克', 'On-device tool page', '本地处理 · 工具页'),
  'tools.audio': embed('/media/audio/', 'Audio extract', '音频处理', 'On-device tool page', '本地处理 · 工具页'),
  'tools.bili': embed('/bili/', 'Bilibili downloader', 'B站下载', 'Needs the downloader service', '需要后端下载服务'),
  'tools.xhs': embed('/xhs/', 'Xiaohongshu downloader', '小红书下载', 'Needs the downloader service', '需要后端下载服务'),
  'tools.music': embed('/music/', 'Music downloader', '音乐下载', 'Needs the downloader service', '需要后端下载服务'),
  'auth.login': { kind: 'component', target: 'ChatLoginCard', title: { en: 'Sign in', zh: '登录' }, note: { en: 'Credentials go to the server only, never to the AI', zh: '密码直连服务端，不经过 AI' } }
}

export interface ChatUiInstance {
  id: string
  descriptor: ChatUiDescriptor
}

export interface ParsedUiReply {
  cleanedText: string
  ui: ChatUiInstance
}

const UI_BLOCK_RE = /```ui\s*([\s\S]*?)```/i

/**
 * Extract the (last) ```ui block from a model reply.
 * Returns null when the reply contains no (valid) ui reference — unknown ids
 * are rejected so the model cannot render arbitrary components.
 */
export function parseUiReply(text: string): ParsedUiReply | null {
  const matches = [...text.matchAll(new RegExp(UI_BLOCK_RE.source, 'gi'))]
  const last = matches[matches.length - 1]
  if (!last) return null

  const json = last[1]?.match(/\{[\s\S]*\}/)
  if (!json) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(json[0])
  } catch {
    return null
  }
  if (typeof parsed !== 'object' || parsed === null) return null

  const id = (parsed as Record<string, unknown>).ui
  if (typeof id !== 'string' || !CHAT_UI_REGISTRY[id]) return null

  return {
    cleanedText: text.slice(0, last.index ?? 0).trimEnd(),
    ui: { id, descriptor: CHAT_UI_REGISTRY[id] }
  }
}

/**
 * System prompt section for the UI-card protocol (appended to the tool
 * protocol section client-side).
 */
export function buildUiSystemPrompt(loggedIn: boolean): string {
  const list = Object.entries(CHAT_UI_REGISTRY)
    .map(([id, d]) => `- ${id} — ${d.title.en} (${d.note.en})`)
    .join('\n')
  return [
    'Interactive UI cards protocol:',
    'When the user wants to use one of the site tools or features below, end your',
    'reply with exactly one fenced block tagged "ui" containing JSON:',
    '```ui',
    '{"ui": "<card id>"}',
    '```',
    '',
    'Available cards:',
    list,
    '',
    `The user is currently ${loggedIn ? 'logged in' : 'NOT logged in'}. Only offer`,
    'auth.login when the user is not logged in and wants to sign in.',
    'Write a short natural sentence BEFORE the block. Never invent card ids and',
    'never use a card when a plain text answer is enough.'
  ].join('\n')
}

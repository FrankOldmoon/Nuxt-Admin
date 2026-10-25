/**
 * Client-side "generative UI" registry for the chat widget.
 *
 * Extension of the plan-B protocol: alongside ```tool blocks (pure compute),
 * the model may end a reply with a ```ui block that "points at" a registered
 * UI card:
 *
 *   ```ui
 *   {"ui": "tools.video-mute"}
 *   ```
 *
 * Cards are rendered by audited Vue components — the model can never inject
 * markup, scripts or arbitrary URLs, only reference ids from the registry.
 *
 * The base app ships the login card below; every other card comes from a
 * module through `registerChatUiCards` (see useChatExtensions.ts). The base
 * never imports a module.
 */

import type { ChatRegion, ChatUiCard } from './useChatExtensions'
import { getChatUiCards } from './useChatExtensions'

/** Shape rendered by `<ChatUiBlock>`. */
export type ChatUiDescriptor = ChatUiCard

export interface ChatUiInstance {
  id: string
  descriptor: ChatUiDescriptor
}

export interface ParsedUiReply {
  cleanedText: string
  ui: ChatUiInstance
}

/** Platform card owned by the base app (credentials never reach the model). */
const LOGIN_CARD: ChatUiDescriptor = {
  kind: 'component',
  target: 'ChatLoginCard',
  title: { en: 'Sign in', zh: '登录' },
  note: { en: 'Credentials go to the server only, never to the AI', zh: '密码直连服务端，不经过 AI' }
}

/**
 * All cards that may be offered right now.
 *
 * - `region` leaves out cards the active deployment does not serve.
 * - `allowedToolIds` leaves out cards the viewer may not open (login / member
 *   only), using the slugs returned by the catalog API.
 */
export function chatUiRegistry(region?: ChatRegion, allowedToolIds?: Set<string>): Record<string, ChatUiDescriptor> {
  const outgoing: Record<string, ChatUiDescriptor> = {}
  for (const [id, card] of Object.entries(getChatUiCards())) {
    if (card.regions?.length && region && !card.regions.includes(region)) continue
    if (card.toolId && allowedToolIds && !allowedToolIds.has(card.toolId)) continue
    outgoing[id] = card
  }
  outgoing['auth.login'] = LOGIN_CARD
  return outgoing
}

const UI_BLOCK_RE = /```ui\s*([\s\S]*?)```/i

/**
 * Extract the (last) ```ui block from a model reply.
 * Returns null when the reply contains no (valid) ui reference — unknown ids
 * are rejected so the model cannot render arbitrary components, and cards
 * unavailable in the active region are rejected as well.
 */
export function parseUiReply(text: string, region?: ChatRegion, allowedToolIds?: Set<string>): ParsedUiReply | null {
  const registry = chatUiRegistry(region, allowedToolIds)
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
  if (typeof id !== 'string' || !registry[id]) return null

  return {
    cleanedText: text.slice(0, last.index ?? 0).trimEnd(),
    ui: { id, descriptor: registry[id]! }
  }
}

/**
 * System prompt section for the UI-card protocol (appended to the tool
 * protocol section client-side).
 */
export function buildUiSystemPrompt(loggedIn: boolean, region?: ChatRegion, allowedToolIds?: Set<string>): string {
  const registry = chatUiRegistry(region, allowedToolIds)
  const list = Object.entries(registry)
    .map(([id, d]) => `- ${id} — ${d.title.en} / ${d.title.zh} (${d.note.en} / ${d.note.zh})`)
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

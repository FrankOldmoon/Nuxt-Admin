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
 * markup, scripts or arbitrary URLs, only reference ids from this registry:
 *  - tool cards come from modules/tools/shared/tools.manifest.ts and render as
 *    the same Vue runner used by `/tools/:slug`
 *  - "component" cards beyond tools (e.g. the inline login card) are declared
 *    below in CHAT_UI_REGISTRY and rendered by ChatUiBlock.
 *
 * Adding a tool card = add a tool to the manifest. Adding another card = add an
 * entry below + render it in app/components/chat/ChatUiBlock.vue.
 */

import { toolChatCards } from '../../modules/tools/shared/tools.manifest'
import type { ToolChatCard, ToolRegion } from '../../modules/tools/shared/tools.manifest'

export interface ChatUiDescriptor {
  kind: 'component'
  /** Component tag rendered by `<ChatUiBlock>`. */
  target: string
  /** Tool id rendered by the globally registered `<ToolsRunnerCard>`. */
  toolId?: string
  title: { en: string, zh: string }
  note: { en: string, zh: string }
  /** Regions where the card may be offered; absent = everywhere. */
  regions?: ToolRegion[]
}

const LOGIN_CARD: ChatUiDescriptor = {
  kind: 'component',
  target: 'ChatLoginCard',
  title: { en: 'Sign in', zh: '登录' },
  note: { en: 'Credentials go to the server only, never to the AI', zh: '密码直连服务端，不经过 AI' }
}

/**
 * Tool cards come from the manifest, so adding a tool never means editing the
 * host chat widget. The model still only sees ids from this closed registry.
 * Pass a region to leave out cards that the active catalog version does not
 * serve (for example the China-only downloaders in the international edition).
 */
export function chatUiRegistry(region?: ToolRegion): Record<string, ChatUiDescriptor> {
  const cards = toolChatCards(region).map((card: ToolChatCard) => [
    card.id,
    {
      kind: card.kind,
      target: card.target,
      toolId: card.toolId,
      title: card.title,
      note: card.note,
      regions: card.regions
    } satisfies ChatUiDescriptor
  ] as const)

  return { ...Object.fromEntries(cards), 'auth.login': LOGIN_CARD }
}

/** Every card, regardless of region (default registry). */
export const CHAT_UI_REGISTRY: Record<string, ChatUiDescriptor> = chatUiRegistry()

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
 * are rejected so the model cannot render arbitrary components, and cards
 * unavailable in the active region are rejected as well.
 */
export function parseUiReply(text: string, region?: ToolRegion): ParsedUiReply | null {
  const registry = region ? chatUiRegistry(region) : CHAT_UI_REGISTRY
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
export function buildUiSystemPrompt(loggedIn: boolean, region?: ToolRegion): string {
  const list = Object.entries(region ? chatUiRegistry(region) : CHAT_UI_REGISTRY)
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

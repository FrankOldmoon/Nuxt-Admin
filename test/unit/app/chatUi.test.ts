import { describe, it, expect } from 'vitest'
import { parseUiReply, buildUiSystemPrompt, chatUiRegistry } from '../../../app/composables/useChatUi'
import { registerChatUiCards } from '../../../app/composables/useChatExtensions'
import { toolChatCards } from '../../../modules/tools/shared/tools.manifest'

// The base app no longer imports the tools module; a deployment wires the cards
// in from an app plugin. Tests do the same registration explicitly.
registerChatUiCards(toolChatCards().map(card => [card.id, {
  kind: 'component' as const,
  target: card.target,
  toolId: card.toolId,
  href: card.toolId ? `/tools/${card.toolId}` : undefined,
  title: card.title,
  note: card.note,
  regions: card.regions
}] as const))

const ALL_CARDS = chatUiRegistry()

describe('parseUiReply', () => {
  it('returns null for a plain reply without a ui block', () => {
    expect(parseUiReply('Here is your answer.')).toBeNull()
  })

  it('extracts a registered card id and strips the block from the text', () => {
    const reply = 'Sure, opening the mute tool.\n```ui\n{"ui": "tools.video-mute"}\n```'
    const parsed = parseUiReply(reply)
    expect(parsed).not.toBeNull()
    expect(parsed!.cleanedText).toBe('Sure, opening the mute tool.')
    expect(parsed!.ui.id).toBe('tools.video-mute')
    expect(parsed!.ui.descriptor.toolId).toBe('video-mute')
    expect(parsed!.ui.descriptor.kind).toBe('component')
  })

  it('returns null for unknown card ids (the model cannot invent components)', () => {
    expect(parseUiReply('```ui\n{"ui": "system.shell"}\n```')).toBeNull()
  })

  it('returns null for invalid JSON inside the block', () => {
    expect(parseUiReply('```ui\n{broken}\n```')).toBeNull()
  })

  it('keeps only the last ui block when several are present', () => {
    const reply = '```ui\n{"ui": "tools.video-mute"}\n```\nactually use this:\n```ui\n{"ui": "tools.video-rotate"}\n```'
    const parsed = parseUiReply(reply)
    expect(parsed!.cleanedText).toContain('"ui": "tools.video-mute"')
    expect(parsed!.ui.id).toBe('tools.video-rotate')
  })

  it('server-backed downloaders render through the same runner', () => {
    for (const id of ['tools.bili', 'tools.xhs', 'tools.music']) {
      const descriptor = ALL_CARDS[id]
      expect(descriptor?.kind).toBe('component')
      expect(descriptor?.target).toBe('ToolsRunnerCard')
    }
  })

  it('client tools render as components, never as arbitrary markup', () => {
    for (const d of Object.values(ALL_CARDS)) {
      if (d.toolId) {
        expect(d.kind).toBe('component')
        expect(d.target).toBe('ToolsRunnerCard')
      }
    }
  })
})

describe('region filtering', () => {
  it('drops China-only downloaders from the international registry', () => {
    const globalCards = chatUiRegistry('global')
    expect(globalCards['tools.bili']).toBeUndefined()
    expect(globalCards['tools.xhs']).toBeUndefined()
    expect(globalCards['tools.music']).toBeUndefined()
    expect(globalCards['tools.pdf-organize']).toBeDefined()
    expect(globalCards['auth.login']).toBeDefined()
  })

  it('offers the international extras only in the global registry', () => {
    expect(chatUiRegistry('global')['tools.youtube']).toBeDefined()
    expect(chatUiRegistry('global')['tools.citation']).toBeDefined()
    expect(chatUiRegistry('global')['tools.readability']).toBeDefined()
    expect(chatUiRegistry('cn')['tools.youtube']).toBeUndefined()
    expect(chatUiRegistry('cn')['tools.citation']).toBeUndefined()
  })

  it('drops cards the viewer may not open', () => {
    const allowed = new Set(['pdf-organize'])
    const cards = chatUiRegistry('global', allowed)
    expect(cards['tools.pdf-organize']).toBeDefined()
    expect(cards['tools.citation']).toBeUndefined()
    expect(cards['auth.login']).toBeDefined()
    expect(parseUiReply('```ui\n{"ui": "tools.citation"}\n```', 'global', allowed)).toBeNull()
  })

  it('keeps every card in the mainland-China registry', () => {
    const cnCards = chatUiRegistry('cn')
    expect(cnCards['tools.bili']).toBeDefined()
    expect(cnCards['tools.pdf-organize']).toBeDefined()
  })

  it('rejects a ui block for a card the active region does not serve', () => {
    const reply = '```ui\n{"ui": "tools.bili"}\n```'
    expect(parseUiReply(reply, 'cn')).not.toBeNull()
    expect(parseUiReply(reply, 'global')).toBeNull()
    expect(buildUiSystemPrompt(false, 'global')).not.toContain('tools.bili')
    expect(buildUiSystemPrompt(false, 'cn')).toContain('tools.bili')
  })
})

describe('buildUiSystemPrompt', () => {
  it('lists all registered cards and the current login state', () => {
    const prompt = buildUiSystemPrompt(false)
    expect(prompt).toContain('tools.video-mute')
    expect(prompt).toContain('auth.login')
    expect(prompt).toContain('NOT logged in')
    expect(buildUiSystemPrompt(true)).toContain('logged in')
  })
})

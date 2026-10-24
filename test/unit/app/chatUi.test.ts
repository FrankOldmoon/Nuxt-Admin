import { describe, it, expect } from 'vitest'
import { parseUiReply, buildUiSystemPrompt, CHAT_UI_REGISTRY } from '../../../app/composables/useChatUi'

describe('parseUiReply', () => {
  it('returns null for a plain reply without a ui block', () => {
    expect(parseUiReply('Here is your answer.')).toBeNull()
  })

  it('extracts a registered card id and strips the block from the text', () => {
    const reply = 'Sure, opening the mute tool.\n```ui\n{"ui": "tools.mute"}\n```'
    const parsed = parseUiReply(reply)
    expect(parsed).not.toBeNull()
    expect(parsed!.cleanedText).toBe('Sure, opening the mute tool.')
    expect(parsed!.ui.id).toBe('tools.mute')
    expect(parsed!.ui.descriptor.target).toBe('/media/mute/')
  })

  it('returns null for unknown card ids (the model cannot invent components)', () => {
    expect(parseUiReply('```ui\n{"ui": "system.shell"}\n```')).toBeNull()
  })

  it('returns null for invalid JSON inside the block', () => {
    expect(parseUiReply('```ui\n{broken}\n```')).toBeNull()
  })

  it('keeps only the last ui block when several are present', () => {
    const reply = '```ui\n{"ui": "tools.mute"}\n```\nactually use this:\n```ui\n{"ui": "tools.rotate"}\n```'
    const parsed = parseUiReply(reply)
    expect(parsed!.cleanedText).toContain('"ui": "tools.mute"')
    expect(parsed!.ui.id).toBe('tools.rotate')
  })

  it('embed targets are same-origin whitelisted paths only', () => {
    for (const d of Object.values(CHAT_UI_REGISTRY)) {
      if (d.kind === 'embed') expect(d.target.startsWith('/')).toBe(true)
    }
  })
})

describe('buildUiSystemPrompt', () => {
  it('lists all registered cards and the current login state', () => {
    const prompt = buildUiSystemPrompt(false)
    expect(prompt).toContain('tools.mute')
    expect(prompt).toContain('auth.login')
    expect(prompt).toContain('NOT logged in')
    expect(buildUiSystemPrompt(true)).toContain('logged in')
  })
})

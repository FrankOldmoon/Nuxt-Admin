import { describe, it, expect } from 'vitest'
import { parseUiReply, buildUiSystemPrompt, CHAT_UI_REGISTRY } from '../../../app/composables/useChatUi'

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
      const descriptor = CHAT_UI_REGISTRY[id]
      expect(descriptor?.kind).toBe('component')
      expect(descriptor?.target).toBe('ToolsRunnerCard')
    }
  })

  it('client tools render as components, never as arbitrary markup', () => {
    for (const d of Object.values(CHAT_UI_REGISTRY)) {
      if (d.toolId) {
        expect(d.kind).toBe('component')
        expect(d.target).toBe('ToolsRunnerCard')
      }
    }
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

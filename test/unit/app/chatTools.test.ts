import { describe, it, expect } from 'vitest'
import { parseToolReply, buildChatSystemPrompt, buildAttachmentNote } from '../../../app/composables/useChatTools'

describe('parseToolReply', () => {
  it('returns null for a plain reply without a tool block', () => {
    expect(parseToolReply('Sure, here is your answer.')).toBeNull()
  })

  it('extracts the tool call and strips the block from the text', () => {
    const reply = 'Sure, compressing it now.\n```tool\n{"tool": "media.compress", "args": {"quality": 0.6}, "file": "photo.png"}\n```'
    const parsed = parseToolReply(reply)
    expect(parsed).not.toBeNull()
    expect(parsed!.cleanedText).toBe('Sure, compressing it now.')
    expect(parsed!.call).toEqual({ tool: 'media.compress', args: { quality: 0.6 }, file: 'photo.png' })
  })

  it('keeps only the last tool block when several are present', () => {
    const reply = [
      'first try',
      '```tool',
      '{"tool": "media.compress", "args": {}, "file": "a.png"}',
      '```',
      'second try',
      '```tool',
      '{"tool": "media.compress", "args": {"quality": 0.9}, "file": "b.png"}',
      '```'
    ].join('\n')
    const parsed = parseToolReply(reply)
    expect(parsed!.cleanedText).toBe('first try\n```tool\n{"tool": "media.compress", "args": {}, "file": "a.png"}\n```\nsecond try')
    expect(parsed!.call.file).toBe('b.png')
  })

  it('returns null for invalid JSON inside the block', () => {
    expect(parseToolReply('```tool\n{not json}\n```')).toBeNull()
  })

  it('returns null for unknown tools (the model cannot invent tools)', () => {
    expect(parseToolReply('```tool\n{"tool": "fs.deleteAll", "args": {}}\n```')).toBeNull()
  })

  it('defaults args to an empty object and file to an empty string', () => {
    const parsed = parseToolReply('```tool\n{"tool": "media.compress"}\n```')
    expect(parsed!.call.args).toEqual({})
    expect(parsed!.call.file).toBe('')
  })
})

describe('buildChatSystemPrompt', () => {
  it('documents the registered tools and the protocol', () => {
    const prompt = buildChatSystemPrompt()
    expect(prompt).toContain('media.compress')
    expect(prompt).toContain('```tool')
    expect(prompt).toContain('[tool result]')
  })
})

describe('buildAttachmentNote', () => {
  it('returns an empty string without attachments', () => {
    expect(buildAttachmentNote([])).toBe('')
  })

  it('lists the attached files with name, type and size', () => {
    const note = buildAttachmentNote([{ name: 'photo.png', size: 2048, type: 'image/png', file: new File([], 'photo.png') }])
    expect(note).toContain('[Attached file: photo.png (image/png, 2 KB)]')
  })
})

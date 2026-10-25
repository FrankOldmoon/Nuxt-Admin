import { describe, it, expect } from 'vitest'
import { PDFDocument } from 'pdf-lib'
import { parseToolReply, buildChatSystemPrompt, buildAttachmentNote, executeToolCall } from '../../../app/composables/useChatTools'
import { registerChatTools } from '../../../app/composables/useChatExtensions'
import { chatToolEntries } from '../../../modules/tools/app/chat/tools'

// The base app no longer owns tool implementations; the tools module registers
// them from an app plugin. Tests register the same set explicitly.
registerChatTools(chatToolEntries)

async function makePdfFile(name: string, pages: number): Promise<File> {
  const doc = await PDFDocument.create()
  for (let i = 0; i < pages; i++) doc.addPage([200, 300])
  const bytes = await doc.save()
  return new File([bytes], name, { type: 'application/pdf' })
}

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
    expect(prompt).toContain('pdf.delete-pages')
    expect(prompt).toContain('image.compress')
    expect(prompt).toContain('file.zip')
    expect(prompt).toContain('```tool')
    expect(prompt).toContain('[tool result]')
  })
})

describe('executeToolCall', () => {
  it('runs an auto tool and returns the file plus the matching tool card', async () => {
    const file = await makePdfFile('lesson.pdf', 3)
    const result = await executeToolCall(
      { tool: 'pdf.delete-pages', args: { pages: '2' }, file: 'lesson.pdf' },
      [{ name: file.name, size: file.size, type: file.type, file }]
    )

    expect(result.ok).toBe(true)
    expect(result.uiId).toBe('tools.pdf-organize')
    expect(result.outputs).toHaveLength(1)

    const output = result.outputs![0]!
    expect(output.name).toBe('lesson-edited.pdf')
    const bytes = await (await fetch(output.url)).arrayBuffer()
    expect((await PDFDocument.load(bytes)).getPageCount()).toBe(2)
  })

  it('still returns the tool card when no usable file is attached', async () => {
    const result = await executeToolCall(
      { tool: 'pdf.delete-pages', args: { pages: '2' }, file: 'lesson.pdf' },
      []
    )

    expect(result.ok).toBe(false)
    expect(result.uiId).toBe('tools.pdf-organize')
    expect(result.error).toContain('no suitable file')
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

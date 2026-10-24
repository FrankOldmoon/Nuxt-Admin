/**
 * Client-side tool-calling protocol for the chat widget.
 *
 * Plan B: a convention-based ```tool JSON block instead of upstream function
 * calling, so any OpenAI-compatible endpoint works without server changes.
 *
 * The model never executes anything and never returns executable code — it may
 * only "point at" a registered tool by name and provide JSON arguments. Every
 * implementation lives in the audited registry below and runs in the browser,
 * so attached files never leave the device.
 *
 * Reply protocol expected from the model:
 *
 *   Sure, compressing your image now.
 *   ```tool
 *   {"tool": "media.compress", "args": {"quality": 0.8}, "file": "photo.png"}
 *   ```
 */

export interface ChatAttachment {
  name: string
  size: number
  type: string
  /** The raw File object — kept in the browser only, never uploaded. */
  file: File
}

export interface ToolCallRequest {
  tool: string
  args: Record<string, unknown>
  file: string
}

/** A tool-produced file, exposed to the UI as a download card. */
export interface ToolCallOutput {
  name: string
  url: string
  size: number
}

export interface ToolCallResult {
  ok: boolean
  output?: ToolCallOutput
  originalSize?: number
  error?: string
}

type ToolFn = (file: File, args: Record<string, unknown>) => Promise<{ blob: Blob, name: string }>

/** Registry: the model can only call tools listed here, with JSON args. */
const registry: Record<string, ToolFn> = {
  'media.compress': compressImageToJpeg
}

const TOOL_BLOCK_RE = /```tool\s*([\s\S]*?)```/i

export interface ParsedToolReply {
  /** Reply text with the tool block stripped — what the user should see. */
  cleanedText: string
  call: ToolCallRequest
}

/**
 * Extract the (last) ```tool JSON block from a model reply.
 * Returns null when the reply contains no (valid) tool call.
 */
export function parseToolReply(text: string): ParsedToolReply | null {
  const matches = [...text.matchAll(new RegExp(TOOL_BLOCK_RE.source, 'gi'))]
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

  const call = parsed as Record<string, unknown>
  if (typeof call.tool !== 'string' || !registry[call.tool]) return null

  return {
    cleanedText: text.slice(0, last.index ?? 0).trimEnd(),
    call: {
      tool: call.tool,
      args: (typeof call.args === 'object' && call.args !== null ? call.args : {}) as Record<string, unknown>,
      file: typeof call.file === 'string' ? call.file : ''
    }
  }
}

/**
 * Execute a tool call from the registry against the files attached this turn.
 * The file is matched by name first, then falls back to the first image.
 */
export async function executeToolCall(call: ToolCallRequest, files: ChatAttachment[]): Promise<ToolCallResult> {
  const fn = registry[call.tool]
  if (!fn) return { ok: false, error: `unknown tool "${call.tool}"` }
  if (!files.length) return { ok: false, error: 'no file is attached to this message' }

  const target = files.find(f => f.name === call.file) ?? files[0]!
  try {
    const { blob, name } = await fn(target.file, call.args)
    return {
      ok: true,
      originalSize: target.size,
      output: { name, url: URL.createObjectURL(blob), size: blob.size }
    }
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
}

/** Draw the image onto a canvas and re-encode it as JPEG with the given quality. */
async function compressImageToJpeg(file: File, args: Record<string, unknown>): Promise<{ blob: Blob, name: string }> {
  if (!file.type.startsWith('image/')) {
    throw new Error(`"${file.name}" is not an image file`)
  }
  const raw = Number(args.quality)
  const quality = Number.isFinite(raw) ? Math.min(0.95, Math.max(0.1, raw)) : 0.8

  const bitmap = await createImageBitmap(file)
  const canvas = document.createElement('canvas')
  canvas.width = bitmap.width
  canvas.height = bitmap.height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('Canvas 2D is unavailable in this browser')
  }
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()

  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', quality))
  if (!blob) throw new Error('failed to encode the JPEG output')

  const stem = file.name.replace(/\.[^.]+$/, '') || 'image'
  return { blob, name: `${stem}.jpg` }
}

/** Human-readable byte size comes from the shared auto-imported `formatBytes`. */

/**
 * System prompt describing the tool protocol. Prepended client-side to every
 * widget request (the server only adds its default prompt when none exists).
 */
export function buildChatSystemPrompt(): string {
  return [
    'You are the built-in assistant of this website. Reply in the user\'s language.',
    'You can invoke browser-side media tools using the protocol below.',
    '',
    'When (and only when) the user asks you to process an attached file, end your',
    'reply with exactly one fenced block tagged "tool" containing JSON:',
    '```tool',
    '{"tool": "<tool name>", "args": {...}, "file": "<attached file name>"}',
    '```',
    '',
    'Available tools:',
    '- media.compress — compress an attached image and convert it to JPEG.',
    '  args: {"quality": 0.1-0.95} (optional, default 0.8; lower means smaller).',
    '',
    'Rules:',
    '- Never output executable code; only the JSON block above.',
    '- Write a short natural reply BEFORE the tool block (e.g. "Sure, compressing it now.").',
    '- Only call a tool when a file is actually attached, and copy its name exactly into "file".',
    '- If no suitable file is attached, ask the user to attach one instead of calling a tool.',
    '- After execution the client sends a message starting with "[tool result]"; then',
    '  briefly confirm the outcome (mention the output file name and size).'
  ].join('\n')
}

/** Build the "[Attached file: ...]" note appended to a user message content. */
export function buildAttachmentNote(attachments: ChatAttachment[]): string {
  if (!attachments.length) return ''
  const list = attachments
    .map(a => `${a.name} (${a.type || 'unknown'}, ${formatBytes(a.size)})`)
    .join('; ')
  return `\n\n[Attached file: ${list}]`
}

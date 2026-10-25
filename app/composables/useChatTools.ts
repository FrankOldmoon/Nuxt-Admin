/**
 * Client-side tool-calling protocol for the chat widget.
 *
 * Plan B: a convention-based ```tool JSON block instead of upstream function
 * calling, so any OpenAI-compatible endpoint works without server changes.
 *
 * The model never executes anything and never returns executable code — it may
 * only "point at" one of the registered tools by name and provide JSON
 * arguments. Implementations are supplied by modules through
 * `registerChatTools` (see useChatExtensions.ts) and run in the browser, so
 * attached files never leave the device.
 *
 * Reply protocol expected from the model:
 *
 *   Sure, removing page 2 now.
 *   ```tool
 *   {"tool": "pdf.delete-pages", "args": {"pages": "2"}, "file": "notes.pdf"}
 *   ```
 *
 * Each auto tool also names the card (`ui`) that should be shown next to the
 * result, so the user can tweak the parameters and re-run it.
 */

import type { ChatToolChargeResult, ChatToolEntry } from './useChatExtensions'
import { chargeChatTool, findChatTool, getChatTools, refundChatTool } from './useChatExtensions'

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
  outputs?: ToolCallOutput[]
  originalSize?: number
  /** Tool card id to render next to the result (same id space as the UI cards). */
  uiId?: string
  note?: string
  error?: string
}

const PDF_EXT = /\.pdf$/i
const SHEET_EXT = /\.(csv|xlsx|xls)$/i

function matchesKind(file: File, kind: ChatToolEntry['kind']): boolean {
  if (kind === 'any') return true
  if (kind === 'pdf') return PDF_EXT.test(file.name) || file.type === 'application/pdf'
  if (kind === 'sheet') return SHEET_EXT.test(file.name)
  return file.type.startsWith('image/')
}

const TOOL_BLOCK_RE = /```tool\s*([\s\S]*?)```/i

/** Exposed for the prompt builder and tests. */
export function listChatTools(): ChatToolEntry[] {
  return getChatTools().filter(entry => !entry.hidden)
}

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
  if (typeof call.tool !== 'string' || !findChatTool(call.tool)) return null

  return {
    cleanedText: text.slice(0, last.index ?? 0).trimEnd(),
    call: {
      tool: call.tool,
      args: (typeof call.args === 'object' && call.args !== null ? call.args : {}) as Record<string, unknown>,
      file: typeof call.file === 'string' ? call.file : ''
    }
  }
}

/** Match the model's file name first, then fall back to accepted attachments. */
function selectFiles(entry: ChatToolEntry, call: ToolCallRequest, files: ChatAttachment[]): File[] {
  const named = call.file ? files.filter(item => item.name === call.file) : []
  const pool = named.length ? named : files.filter(item => matchesKind(item.file, entry.kind))
  const chosen = entry.many ? pool : pool.slice(0, 1)
  return chosen.map(item => item.file)
}

/**
 * Execute a tool call from the registry against the files attached this turn.
 *
 * Modules may meter their tools: the billing hook runs first and a failed run
 * refunds automatically.
 */
export async function executeToolCall(call: ToolCallRequest, files: ChatAttachment[]): Promise<ToolCallResult> {
  const entry = findChatTool(call.tool)
  if (!entry) return { ok: false, error: `unknown tool "${call.tool}"` }

  const targets = selectFiles(entry, call, files)
  if (!targets.length) {
    return { ok: false, uiId: entry.ui, error: 'no suitable file is attached to this message' }
  }

  const charge: ChatToolChargeResult = await chargeChatTool(entry)
  if (!charge.ok) {
    return { ok: false, uiId: entry.ui, error: charge.error || 'not enough credits for this tool' }
  }

  try {
    const result = await entry.run(targets, call.args)
    return {
      ok: true,
      originalSize: files.reduce((sum, item) => sum + item.size, 0),
      outputs: result.blobs.map(({ blob, name }) => ({ name, url: URL.createObjectURL(blob), size: blob.size })),
      uiId: entry.ui,
      note: result.note
    }
  } catch (e: unknown) {
    await refundChatTool(charge.transactionId)
    return { ok: false, uiId: entry.ui, error: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * System prompt describing the tool protocol. Prepended client-side to every
 * widget request (the server only adds its default prompt when none exists).
 */
export function buildChatSystemPrompt(): string {
  const tools = listChatTools()
    .map(entry => `- ${entry.name} — ${entry.description}\n  args: ${entry.argsHelp}`)
    .join('\n')

  return [
    'You are the built-in assistant of this website. Reply in the user\'s language.',
    'You can invoke browser-side file tools using the protocol below.',
    '',
    'When (and only when) the user asks you to process an attached file, end your',
    'reply with exactly one fenced block tagged "tool" containing JSON:',
    '```tool',
    '{"tool": "<tool name>", "args": {...}, "file": "<attached file name>"}',
    '```',
    '',
    'Available tools:',
    tools || '- (none registered)',
    '',
    'Rules:',
    '- Never output executable code; only the JSON block above.',
    '- Write a short natural reply BEFORE the tool block (e.g. "Sure, removing page 2.").',
    '- Only call a tool when a file is actually attached, and copy its name exactly into "file".',
    '- Prefer a tool block when the attached file and the request match one of the',
    '  tools above; the client shows the result and preloads the matching tool card.',
    '- Use a ```ui block instead when no tool above can finish the job automatically,',
    '  or when the user needs to draw/pick positions (crop, watermark, signature...).',
    '- Page numbers are 1-based. If the user does not say which page, ask before calling.',
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

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
 *   Sure, removing page 2 now.
 *   ```tool
 *   {"tool": "pdf.delete-pages", "args": {"pages": "2"}, "file": "notes.pdf"}
 *   ```
 *
 * Each auto tool also names the tool card (`ui`) that should be shown next to
 * the result, so the user can tweak the parameters and re-run it.
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
  outputs?: ToolCallOutput[]
  originalSize?: number
  /** Tool card id to render next to the result (same id space as CHAT_UI_REGISTRY). */
  uiId?: string
  note?: string
  error?: string
}

type FileKind = 'pdf' | 'image' | 'sheet' | 'any'

interface ToolRunResult {
  blobs: Array<{ blob: Blob, name: string }>
  note?: string
}

interface ToolEntry {
  name: string
  description: string
  argsHelp: string
  ui: string
  /** Which attachments the tool accepts; used to pick a target file. */
  kind: FileKind
  /** Tools such as merge/zip consume every attachment instead of one. */
  many?: boolean
  run: (files: File[], args: Record<string, unknown>) => Promise<ToolRunResult>
}

const PDF_EXT = /\.pdf$/i
const SHEET_EXT = /\.(csv|xlsx|xls)$/i

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback
}

function stemOf(name: string): string {
  return name.replace(/\.[^.]+$/, '') || 'file'
}

function matchesKind(file: File, kind: FileKind): boolean {
  if (kind === 'any') return true
  if (kind === 'pdf') return PDF_EXT.test(file.name) || file.type === 'application/pdf'
  if (kind === 'sheet') return SHEET_EXT.test(file.name)
  return file.type.startsWith('image/')
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value.trim() : fallback
}

/* ------------------------------------------------------------------ PDF */

async function loadPdf(file: File) {
  const { PDFDocument } = await import('pdf-lib')
  return PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true })
}

async function pdfDeletePages(files: File[], args: Record<string, unknown>): Promise<ToolRunResult> {
  const { parsePageRanges, pdfBlob } = await import('../../modules/tools/app/utils/pdf')
  const file = files[0]!
  const doc = await loadPdf(file)
  const total = doc.getPageCount()
  const removal = parsePageRanges(asString(args.pages), total)
  if (removal.length >= total) throw new Error('Cannot delete every page')
  for (const pageNumber of [...removal].sort((a, b) => b - a)) doc.removePage(pageNumber - 1)
  return {
    blobs: [{ blob: pdfBlob(await doc.save()), name: `${stemOf(file.name)}-edited.pdf` }],
    note: `removed page(s) ${removal.join(', ')}`
  }
}

async function pdfRotatePages(files: File[], args: Record<string, unknown>): Promise<ToolRunResult> {
  const { degrees } = await import('pdf-lib')
  const { parsePageRanges, pdfBlob } = await import('../../modules/tools/app/utils/pdf')
  const file = files[0]!
  const doc = await loadPdf(file)
  const total = doc.getPageCount()
  const rawAngle = clampNumber(args.angle, -360, 360, 90)
  const angle = ((Math.round(rawAngle / 90) * 90) % 360 + 360) % 360 || 90
  const selection = asString(args.pages)
  const targets = selection ? new Set(parsePageRanges(selection, total)) : null
  for (const [index, page] of doc.getPages().entries()) {
    if (targets && !targets.has(index + 1)) continue
    page.setRotation(degrees((page.getRotation().angle + angle) % 360))
  }
  return {
    blobs: [{ blob: pdfBlob(await doc.save()), name: `${stemOf(file.name)}-rotated.pdf` }],
    note: `rotated ${selection || 'all pages'} by ${angle}°`
  }
}

async function pdfExtractPages(files: File[], args: Record<string, unknown>): Promise<ToolRunResult> {
  const { PDFDocument } = await import('pdf-lib')
  const { parsePageRanges, pdfBlob } = await import('../../modules/tools/app/utils/pdf')
  const file = files[0]!
  const source = await loadPdf(file)
  const pages = parsePageRanges(asString(args.pages), source.getPageCount())
  const output = await PDFDocument.create()
  const copied = await output.copyPages(source, pages.map(page => page - 1))
  copied.forEach((page) => {
    output.addPage(page)
  })
  return {
    blobs: [{ blob: pdfBlob(await output.save()), name: `${stemOf(file.name)}-pages.pdf` }],
    note: `kept page(s) ${pages.join(', ')}`
  }
}

async function pdfMerge(files: File[]): Promise<ToolRunResult> {
  const { PDFDocument } = await import('pdf-lib')
  const { pdfBlob } = await import('../../modules/tools/app/utils/pdf')
  const output = await PDFDocument.create()
  for (const file of files) {
    const source = await loadPdf(file)
    const copied = await output.copyPages(source, source.getPageIndices())
    copied.forEach((page) => {
      output.addPage(page)
    })
  }
  return {
    blobs: [{ blob: pdfBlob(await output.save()), name: 'merged.pdf' }],
    note: `merged ${files.length} PDFs`
  }
}

async function pdfCompress(files: File[], args: Record<string, unknown>): Promise<ToolRunResult> {
  const { PDFDocument } = await import('pdf-lib')
  const { openPdf, renderPage } = await import('../../modules/tools/app/utils/pdfRender')
  const { canvasToBlob } = await import('../../modules/tools/app/utils/imageProcessing')
  const { pdfBlob } = await import('../../modules/tools/app/utils/pdf')
  const file = files[0]!
  const dpi = clampNumber(args.dpi, 72, 200, 120)
  const quality = clampNumber(args.quality, 0.4, 0.9, 0.7)

  const source = await openPdf(file)
  const output = await PDFDocument.create()
  try {
    for (let index = 1; index <= source.numPages; index++) {
      const page = await source.getPage(index)
      const viewport = page.getViewport({ scale: 1 })
      const canvas = await renderPage(page, dpi)
      const jpeg = await canvasToBlob(canvas, 'image/jpeg', quality)
      const embedded = await output.embedJpg(new Uint8Array(await jpeg.arrayBuffer()))
      output.addPage([viewport.width, viewport.height]).drawImage(embedded, {
        x: 0,
        y: 0,
        width: viewport.width,
        height: viewport.height
      })
      page.cleanup()
    }
  } finally {
    await source.cleanup()
  }
  return {
    blobs: [{ blob: pdfBlob(await output.save()), name: `${stemOf(file.name)}-compressed.pdf` }],
    note: `re-rendered at ${dpi} DPI`
  }
}

async function pdfExtractText(files: File[], args: Record<string, unknown>): Promise<ToolRunResult> {
  const { extractPdfText } = await import('../../modules/tools/app/utils/pdfText')
  const file = files[0]!
  const pages = await extractPdfText(file)
  if (!pages.some(text => text.length > 0)) {
    throw new Error('This PDF has no text layer (it looks scanned), so there is nothing to extract')
  }
  const format = asString(args.format, 'txt') === 'md' ? 'md' : 'txt'
  const body = format === 'md'
    ? pages.map((text, index) => `## Page ${index + 1}\n\n${text}`).join('\n\n')
    : pages.join('\n\n')
  return {
    blobs: [{ blob: new Blob([body], { type: 'text/plain;charset=utf-8' }), name: `${stemOf(file.name)}.${format}` }],
    note: `${body.length} characters extracted`
  }
}

/* ---------------------------------------------------------------- images */

async function imageCompress(files: File[], args: Record<string, unknown>): Promise<ToolRunResult> {
  const { rasterize } = await import('../../modules/tools/app/utils/imageProcessing')
  const quality = clampNumber(args.quality, 0.1, 0.95, 0.8)
  const maxWidth = clampNumber(args.maxWidth, 0, 10000, 0)
  const file = files[0]!
  const result = await rasterize(file, { type: 'image/jpeg', quality, maxWidth: maxWidth || undefined })
  return {
    blobs: [{ blob: result.blob, name: `${stemOf(file.name)}.jpg` }],
    note: `${result.width}×${result.height}`
  }
}

async function imageConvert(files: File[], args: Record<string, unknown>): Promise<ToolRunResult> {
  const { rasterize } = await import('../../modules/tools/app/utils/imageProcessing')
  const format = asString(args.format, 'png').toLowerCase()
  const type = format === 'jpeg' || format === 'jpg'
    ? 'image/jpeg'
    : format === 'webp' ? 'image/webp' : 'image/png'
  const file = files[0]!
  const result = await rasterize(file, { type, quality: clampNumber(args.quality, 0.1, 1, 0.9) })
  const extension = type === 'image/jpeg' ? 'jpg' : type === 'image/webp' ? 'webp' : 'png'
  return { blobs: [{ blob: result.blob, name: `${stemOf(file.name)}.${extension}` }] }
}

async function imageResize(files: File[], args: Record<string, unknown>): Promise<ToolRunResult> {
  const { rasterize, imageExtension } = await import('../../modules/tools/app/utils/imageProcessing')
  const width = clampNumber(args.width, 1, 20000, 0)
  const height = clampNumber(args.height, 1, 20000, 0)
  if (!width && !height) throw new Error('Provide a target width or height')
  const file = files[0]!
  const type = file.type === 'image/png' || file.type === 'image/webp' ? file.type : 'image/jpeg'
  const result = await rasterize(file, { type, width: width || undefined, height: height || undefined })
  return {
    blobs: [{ blob: result.blob, name: `${stemOf(file.name)}-${result.width}x${result.height}.${imageExtension(type)}` }],
    note: `${result.width}×${result.height}`
  }
}

async function imageStripExif(files: File[], args: Record<string, unknown>): Promise<ToolRunResult> {
  const { rasterize, imageExtension } = await import('../../modules/tools/app/utils/imageProcessing')
  const raw = asString(args.format, 'jpeg')
  const type = raw === 'png' ? 'image/png' : raw === 'webp' ? 'image/webp' : 'image/jpeg'
  const maxEdge = clampNumber(args.maxEdge, 0, 12000, 0)
  const file = files[0]!
  const result = await rasterize(file, {
    type,
    quality: 0.92,
    maxWidth: maxEdge || undefined,
    maxHeight: maxEdge || undefined
  })
  return { blobs: [{ blob: result.blob, name: `${stemOf(file.name)}-clean.${imageExtension(type)}` }] }
}

/* ---------------------------------------------------------------- sheets */

async function sheetConvert(files: File[], args: Record<string, unknown>): Promise<ToolRunResult> {
  const { readTable, xlsxBlob, csvBlob } = await import('../../modules/tools/app/utils/sheet')
  const table = await readTable(files[0]!)
  const target = asString(args.to, 'xlsx') === 'csv' ? 'csv' : 'xlsx'
  if (target === 'csv') {
    return { blobs: [{ blob: csvBlob(table.headers, table.rows), name: `${stemOf(table.name)}.csv` }] }
  }
  return { blobs: [{ blob: xlsxBlob(table.headers, table.rows, stemOf(table.name)), name: `${stemOf(table.name)}.xlsx` }] }
}

async function sheetSplit(files: File[], args: Record<string, unknown>): Promise<ToolRunResult> {
  const { readTable, xlsxBlob } = await import('../../modules/tools/app/utils/sheet')
  const table = await readTable(files[0]!)
  const wanted = asString(args.column)
  const columnIndex = wanted
    ? table.headers.findIndex(header => header.trim().toLowerCase() === wanted.toLowerCase())
    : 0
  if (columnIndex < 0) {
    throw new Error(`No column named "${wanted}". Available: ${table.headers.join(', ')}`)
  }
  const groups = new Map<string, Array<Array<string | number>>>()
  for (const row of table.rows) {
    const key = String(row[columnIndex] ?? '').trim() || 'blank'
    const bucket = groups.get(key)
    if (bucket) bucket.push(row)
    else groups.set(key, [row])
  }
  if (groups.size > 60) throw new Error(`That column would create ${groups.size} files; the limit is 60`)
  const blobs = [...groups.entries()].map(([label, rows]) => {
    const safe = label.replace(/[\\/:*?"<>|]/g, '_').slice(0, 40)
    return { blob: xlsxBlob(table.headers, rows, safe), name: `${stemOf(table.name)}-${safe}.xlsx` }
  })
  return { blobs, note: `split into ${blobs.length} files by "${table.headers[columnIndex]}"` }
}

/* ------------------------------------------------------------------ files */

async function fileZip(files: File[]): Promise<ToolRunResult> {
  const { zipSync } = await import('fflate')
  const entries: Record<string, Uint8Array> = {}
  const used = new Set<string>()
  for (const file of files) {
    const dot = file.name.lastIndexOf('.')
    const base = dot > 0 ? file.name.slice(0, dot) : file.name
    const extension = dot > 0 ? file.name.slice(dot) : ''
    let name = file.name
    let counter = 1
    while (used.has(name)) {
      name = `${base}-${counter}${extension}`
      counter++
    }
    used.add(name)
    entries[name] = new Uint8Array(await file.arrayBuffer())
  }
  const zipped = zipSync(entries, { level: 6 })
  const copy = new Uint8Array(zipped.length)
  copy.set(zipped)
  return {
    blobs: [{ blob: new Blob([copy.buffer], { type: 'application/zip' }), name: `archive-${files.length}.zip` }],
    note: `${files.length} files packed`
  }
}

/* -------------------------------------------------------------- registry */

/** Registry: the model can only call tools listed here, with JSON args. */
const registry: Record<string, ToolEntry> = {
  'pdf.delete-pages': {
    name: 'pdf.delete-pages',
    description: 'Delete pages from one attached PDF.',
    argsHelp: '{"pages": "2"} (1-based; commas and ranges like "2,4-5" are allowed)',
    ui: 'tools.pdf-organize',
    kind: 'pdf',
    run: pdfDeletePages
  },
  'pdf.rotate-pages': {
    name: 'pdf.rotate-pages',
    description: 'Rotate pages of one attached PDF.',
    argsHelp: '{"angle": 90, "pages": "1,3"} (pages optional, default all)',
    ui: 'tools.pdf-organize',
    kind: 'pdf',
    run: pdfRotatePages
  },
  'pdf.extract-pages': {
    name: 'pdf.extract-pages',
    description: 'Keep only the given pages of one attached PDF.',
    argsHelp: '{"pages": "1-3"} (1-based; commas and ranges allowed)',
    ui: 'tools.pdf-split',
    kind: 'pdf',
    run: pdfExtractPages
  },
  'pdf.merge': {
    name: 'pdf.merge',
    description: 'Merge every attached PDF, in attachment order.',
    argsHelp: '{} (no arguments; attach two or more PDFs)',
    ui: 'tools.pdf-merge',
    kind: 'pdf',
    many: true,
    run: files => pdfMerge(files)
  },
  'pdf.compress': {
    name: 'pdf.compress',
    description: 'Shrink a scanned PDF by re-rendering pages as JPEG.',
    argsHelp: '{"dpi": 120, "quality": 0.7} (dpi 72-200, quality 0.4-0.9)',
    ui: 'tools.pdf-compress',
    kind: 'pdf',
    run: pdfCompress
  },
  'pdf.extract-text': {
    name: 'pdf.extract-text',
    description: 'Extract the text layer of an attached PDF into TXT or Markdown.',
    argsHelp: '{"format": "txt"} ("txt" or "md")',
    ui: 'tools.pdf-extract-text',
    kind: 'pdf',
    run: pdfExtractText
  },

  'image.compress': {
    name: 'image.compress',
    description: 'Compress an attached image into JPEG.',
    argsHelp: '{"quality": 0.8, "maxWidth": 1600} (both optional)',
    ui: 'tools.image-compress',
    kind: 'image',
    run: imageCompress
  },
  'image.convert': {
    name: 'image.convert',
    description: 'Convert an attached image between PNG, JPEG and WebP.',
    argsHelp: '{"format": "png", "quality": 0.9}',
    ui: 'tools.image-convert',
    kind: 'image',
    run: imageConvert
  },
  'image.resize': {
    name: 'image.resize',
    description: 'Resize an attached image to a width or height, keeping the ratio.',
    argsHelp: '{"width": 1280} or {"height": 720}',
    ui: 'tools.image-resize',
    kind: 'image',
    run: imageResize
  },
  'image.strip-exif': {
    name: 'image.strip-exif',
    description: 'Strip GPS/camera metadata from an attached photo by re-encoding it.',
    argsHelp: '{"format": "jpeg", "maxEdge": 0} (0 keeps the original size)',
    ui: 'tools.image-exif',
    kind: 'image',
    run: imageStripExif
  },

  'sheet.convert': {
    name: 'sheet.convert',
    description: 'Convert an attached CSV to XLSX or an XLSX to CSV.',
    argsHelp: '{"to": "xlsx"} ("xlsx" or "csv")',
    ui: 'tools.sheet-convert',
    kind: 'sheet',
    run: sheetConvert
  },
  'sheet.split': {
    name: 'sheet.split',
    description: 'Split one attached sheet into a file per value of a column.',
    argsHelp: '{"column": "班级"} (header name; defaults to the first column)',
    ui: 'tools.sheet-split',
    kind: 'sheet',
    run: sheetSplit
  },

  'file.zip': {
    name: 'file.zip',
    description: 'Pack every attached file into one ZIP.',
    argsHelp: '{} (no arguments; attach the files to pack)',
    ui: 'tools.file-zip',
    kind: 'any',
    many: true,
    run: files => fileZip(files)
  }
}

/** Old name kept so previous conversations and prompts still work. */
registry['media.compress'] = { ...registry['image.compress']!, name: 'media.compress' }

/** Exposed for the prompt builder and tests. */
export function listChatTools(): ToolEntry[] {
  return Object.values(registry).filter(entry => !entry.name.startsWith('media.'))
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

/** Match the model's file name first, then fall back to accepted attachments. */
function selectFiles(entry: ToolEntry, call: ToolCallRequest, files: ChatAttachment[]): File[] {
  const named = call.file ? files.filter(item => item.name === call.file) : []
  const pool = named.length ? named : files.filter(item => matchesKind(item.file, entry.kind))
  const chosen = entry.many ? pool : pool.slice(0, 1)
  return chosen.map(item => item.file)
}

/**
 * Execute a tool call from the registry against the files attached this turn.
 */
export async function executeToolCall(call: ToolCallRequest, files: ChatAttachment[]): Promise<ToolCallResult> {
  const entry = registry[call.tool]
  if (!entry) return { ok: false, error: `unknown tool "${call.tool}"` }

  const targets = selectFiles(entry, call, files)
  if (!targets.length) {
    return { ok: false, uiId: entry.ui, error: 'no suitable file is attached to this message' }
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
    tools,
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

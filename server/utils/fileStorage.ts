import { createHash } from 'node:crypto'
import { mkdir, writeFile, stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { resolve, dirname, extname, sep } from 'node:path'

const STORAGE_DIR = resolve(process.cwd(), 'storage')
const EPOCH_DATE = new Date('2026-01-01T00:00:00Z')

/** Calculate SHA-256 hash of a buffer */
export function calculateHash(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex')
}

/** Day number since 2026-01-01 (Jan 1 = 1) */
export function getDayNumber(date = new Date()): number {
  const diff = date.getTime() - EPOCH_DATE.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24)) + 1
}

/** Build relative storage path: [dayNumber]/[contentHash].[ext].  Using the
 *  content hash (instead of a sequence number) means identical files share a
 *  name, dedup naturally, and the stored name is stable & self-describing. */
export async function buildStoragePath(originalName: string, contentHash: string): Promise<string> {
  const dayNumber = getDayNumber()
  const ext = extname(originalName) || '.bin'
  return `${dayNumber}/${contentHash}${ext}`
}

/** Save buffer to storage at the given relative path */
export async function saveToStorage(buffer: Buffer, relativePath: string): Promise<void> {
  const abs = getAbsolutePath(relativePath)
  await mkdir(dirname(abs), { recursive: true })
  await writeFile(abs, buffer)
}

/** Get absolute filesystem path for a relative storage path; guards against path traversal. */
export function getAbsolutePath(relativePath: string): string {
  const abs = resolve(STORAGE_DIR, relativePath)
  if (!abs.startsWith(STORAGE_DIR + sep)) {
    throw new Error('Invalid storage path')
  }
  return abs
}

/** Check if a file exists on disk */
export async function fileExists(relativePath: string): Promise<boolean> {
  try {
    await stat(getAbsolutePath(relativePath))
    return true
  } catch {
    return false
  }
}

/** Create a readable stream for a stored file */
export function createStorageStream(relativePath: string) {
  return createReadStream(getAbsolutePath(relativePath))
}

/** Get file size in bytes */
export async function getFileSize(relativePath: string): Promise<number> {
  const s = await stat(getAbsolutePath(relativePath))
  return s.size
}

/** MIME types that browsers can preview inline */
const PREVIEWABLE_PREFIXES = [
  'image/',
  'video/',
  'audio/',
  'text/',
  'application/pdf',
  'application/json',
  'application/xml',
  'text/xml',
  'application/javascript',
  'application/x-javascript',
  'image/svg+xml'
]

/** Check if a MIME type can be previewed in the browser */
export function isPreviewable(mimeType: string | null): boolean {
  if (!mimeType) return false
  return PREVIEWABLE_PREFIXES.some(prefix => mimeType.startsWith(prefix))
}

/** Build Content-Disposition header value with RFC 5987 filename encoding */
export function formatContentDisposition(
  disposition: 'inline' | 'attachment',
  filename: string
): string {
  const encoded = encodeURIComponent(filename)
  const ascii = filename.replace(/[^\x20-\x7E]/g, '_')
  return `${disposition}; filename="${ascii}"; filename*=UTF-8''${encoded}`
}

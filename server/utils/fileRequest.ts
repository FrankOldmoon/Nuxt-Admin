import { createError, type H3Event } from 'h3'
import { actorFromAuthContext, canAccessPrivateFile, verifySignedFileUrl } from '../core/fileAccess'
import { writeAudit } from '../core/audit'
import { db } from '../database'
import type { FileRow } from './files'

/**
 * One authorization path for serve/download/preview/artifacts.
 * Public files stay open; private files require a valid signature or an
 * authenticated owner/admin/organization member with `files:read`.
 */
export async function authorizeFileRequest(event: H3Event, rawPath: string): Promise<FileRow> {
  const file = await findFileByPath(rawPath)
  if (!file || file.deletedAt) {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'File not found' })
  }
  if (file.visibility === 'public') return file

  const query = getQuery(event)
  if (query.signature && verifySignedFileUrl(file.path, query.expires, query.signature)) {
    return file
  }

  const ctx = await getSessionUser(event).catch(() => null)
  if (!ctx) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized', message: 'Authentication required for this file' })
  }
  if (!canAccessPrivateFile(actorFromAuthContext(ctx), file)) {
    await writeAudit(db, {
      actorUserId: ctx.user.id,
      tenantId: file.tenantId,
      organizationId: file.organizationId,
      action: 'file.denied',
      resource: 'files',
      recordId: file.id,
      after: { path: file.path },
      outcome: 'failure',
      source: 'file-access'
    }).catch(() => {})
    throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'No access to this file' })
  }
  return file
}

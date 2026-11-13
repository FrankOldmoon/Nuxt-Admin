import { and, asc, eq, ilike, inArray, or } from 'drizzle-orm'
import { db } from '../../../server/database'
import { sisStudents, sisTeacherAssignments } from './database/schema'
import { isSisAdmin, requireSisOrganization, type SisActor } from './context'

export interface StudentSearchOptions {
  query?: string
  limit?: number
}

/** Classes assigned to the teacher in the current organization. */
export async function assignedClassIds(actor: SisActor): Promise<number[]> {
  const organizationId = requireSisOrganization(actor)
  const rows = await db.select({ classId: sisTeacherAssignments.classId })
    .from(sisTeacherAssignments)
    .where(and(
      eq(sisTeacherAssignments.organizationId, organizationId),
      eq(sisTeacherAssignments.teacherUserId, actor.userId)
    ))
  return rows.map(row => row.classId)
}

/**
 * Shared SIS student search used by the module API, the Tool Registry and the
 * page. Row scope comes from TeacherAssignment, never from request input.
 */
export async function searchStudents(actor: SisActor, options: StudentSearchOptions = {}) {
  const organizationId = requireSisOrganization(actor)
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
  const conditions = [eq(sisStudents.organizationId, organizationId)]

  const query = options.query?.trim()
  if (query) {
    conditions.push(or(
      ilike(sisStudents.name, `%${query}%`),
      ilike(sisStudents.studentNo, `%${query}%`)
    )!)
  }
  if (!isSisAdmin(actor)) {
    conditions.push(inArray(sisStudents.classId, await assignedClassIds(actor)))
  }

  return await db.select({
    id: sisStudents.id,
    name: sisStudents.name,
    studentNo: sisStudents.studentNo,
    classId: sisStudents.classId,
    organizationId: sisStudents.organizationId
  })
    .from(sisStudents)
    .where(and(...conditions))
    .orderBy(asc(sisStudents.name))
    .limit(limit)
}

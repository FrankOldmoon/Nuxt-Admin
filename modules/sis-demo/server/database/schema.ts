import { pgTable, serial, integer, varchar, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

export const sisClasses = pgTable('sis_classes', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id').notNull(),
  name: varchar('name', { length: 120 }).notNull(),
  grade: varchar('grade', { length: 40 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
})

export const sisStudents = pgTable('sis_students', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id').notNull(),
  classId: integer('class_id'),
  name: varchar('name', { length: 120 }).notNull(),
  studentNo: varchar('student_no', { length: 40 }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
})

export const sisTeacherAssignments = pgTable(
  'sis_teacher_assignments',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull(),
    teacherUserId: integer('teacher_user_id').notNull(),
    classId: integer('class_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull()
  },
  table => ({
    teacherClassIdx: uniqueIndex('sis_teacher_assignments_teacher_class_idx').on(table.teacherUserId, table.classId)
  })
)

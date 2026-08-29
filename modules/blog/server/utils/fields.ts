/**
 * Blog module — TableMeta for the host project's generic dashboard CRUD.
 *
 * Returning `custom: false` means the host's generic list/form/detail,
 * advanced filters and soft-delete all apply to the blog tables for free —
 * this is the zero-code personalization level (L0) of the module system.
 * Field labels resolve through the module's own i18n files
 * (`dashboard.fields.<table>.<field>` / `dashboard.tables.<table>`).
 */
// Type-only import from the host (erased at build time — the runtime value
// lives in this module). Structural typing lets us pass plain TableMeta objects.
import type { TableMeta } from '../../../../app/types/dashboard'

export const postMeta: TableMeta = {
  table: 'posts',
  label: 'Posts',
  icon: 'i-lucide-file-text',
  custom: false,
  fields: [
    { key: 'id', label: 'ID', type: 'number', nullable: false, showInForm: false, showInTable: true, showInDetail: true, editable: false },
    { key: 'title', label: 'Title', type: 'text', nullable: false, showInForm: true, showInTable: true, showInDetail: true, editable: true, validation: { required: true, maxLength: 255 } },
    { key: 'slug', label: 'Slug', type: 'text', nullable: false, showInForm: true, showInTable: true, showInDetail: true, editable: true, validation: { required: true, maxLength: 255 }, helpText: 'Lowercase URL segment, e.g. my-first-post' },
    { key: 'excerpt', label: 'Excerpt', type: 'textarea', nullable: true, showInForm: true, showInTable: false, showInDetail: true, editable: true },
    { key: 'contentMarkdown', label: 'Content (Markdown)', type: 'textarea', nullable: true, showInForm: true, showInTable: false, showInDetail: true, editable: true, widthClass: 'w-48' },
    { key: 'coverUrl', label: 'Cover image URL', type: 'hyperlink', nullable: true, showInForm: true, showInTable: false, showInDetail: true, editable: true, placeholder: 'https://…' },
    { key: 'tags', label: 'Tags', type: 'tags', nullable: false, showInForm: true, showInTable: true, showInDetail: true, editable: true, helpText: 'Comma separated, e.g. vue,nuxt' },
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      nullable: false,
      showInForm: true,
      showInTable: true,
      showInDetail: true,
      editable: true,
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
        { label: 'Archived', value: 'archived' }
      ]
    },
    { key: 'categoryId', label: 'Category', type: 'relation', nullable: true, showInForm: true, showInTable: true, showInDetail: true, editable: true, relation: { table: 'categories', labelKey: 'name', valueKey: 'id' } },
    { key: 'authorId', label: 'Author', type: 'relation', nullable: true, showInForm: true, showInTable: true, showInDetail: true, editable: true, relation: { table: 'users', labelKey: 'name', valueKey: 'id' } },
    { key: 'publishedAt', label: 'Published at', type: 'datetime', nullable: true, showInForm: true, showInTable: true, showInDetail: true, editable: true },
    { key: 'createdAt', label: 'Created at', type: 'datetime', nullable: false, showInForm: false, showInTable: true, showInDetail: true, editable: false },
    { key: 'updatedAt', label: 'Updated at', type: 'datetime', nullable: false, showInForm: false, showInTable: true, showInDetail: true, editable: false }
  ],
  features: {
    softDelete: true,
    search: ['title', 'slug', 'excerpt'],
    defaultSort: { field: 'publishedAt', order: 'desc' },
    dataScope: { ownerColumn: 'authorId' }
  }
}

export const categoryMeta: TableMeta = {
  table: 'categories',
  label: 'Categories',
  icon: 'i-lucide-tags',
  custom: false,
  fields: [
    { key: 'id', label: 'ID', type: 'number', nullable: false, showInForm: false, showInTable: true, showInDetail: true, editable: false },
    { key: 'name', label: 'Name', type: 'text', nullable: false, showInForm: true, showInTable: true, showInDetail: true, editable: true, validation: { required: true, maxLength: 120 } },
    { key: 'slug', label: 'Slug', type: 'text', nullable: false, showInForm: true, showInTable: true, showInDetail: true, editable: true, validation: { required: true, maxLength: 160 } },
    { key: 'description', label: 'Description', type: 'textarea', nullable: true, showInForm: true, showInTable: false, showInDetail: true, editable: true },
    { key: 'createdAt', label: 'Created at', type: 'datetime', nullable: false, showInForm: false, showInTable: true, showInDetail: true, editable: false },
    { key: 'updatedAt', label: 'Updated at', type: 'datetime', nullable: false, showInForm: false, showInTable: false, showInDetail: true, editable: false }
  ],
  features: {
    softDelete: false,
    search: ['name', 'slug', 'description'],
    defaultSort: { field: 'id', order: 'asc' }
  }
}
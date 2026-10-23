<script setup lang="ts">
/**
 * Dashboard layout — wraps every route under `/dashboard/*`.
 *
 * The shell (sidebar + tabs bar + main column) lives HERE at the layout
 * level, NOT inside the pages.  If each page rendered its own shell, every
 * navigation would destroy & recreate the sidebar `<aside>`; the browser
 * resets `scrollTop` to 0 whenever a scroll container is re-attached, so the
 * sidebar would jump back to the top on every menu click.  Rendering it in
 * the layout keeps a single instance alive across route changes.
 *
 * `activeTable` is derived from the route so the sidebar can highlight the
 * current item for both dynamic (`/dashboard/:table`) and static
 * (`/dashboard/users`, ...) routes.
 */
const route = useRoute()

const activeTable = computed<string>(() => {
  const tableName = (route.params as { table?: string }).table
  if (typeof tableName === 'string') return tableName
  const last = route.path.split('/').filter(Boolean).pop()
  return last && last !== 'dashboard' ? last : ''
})
</script>

<template>
  <DashboardShell :active-table="activeTable">
    <slot />
  </DashboardShell>
</template>

/**
 * Unified entry point for resolving dashboard labels.
 *
 * Field/table labels prefer the i18n key (`dashboard.fields.<table>.<key>` /
 * `dashboard.tables.<table>`); when unconfigured (e.g. auto-discovered tables)
 * they fall back to the backend-provided `FieldMeta.label`. This keeps the
 * default `en` and switched `zh` consistent and removes the "backend Chinese
 * label + frontend i18n" mix.
 */
export function useDashboardLabels() {
  const { t } = useI18n()

  /** Field label: prefer i18n, fall back to backend label */
  function fieldLabel(table: string, field: { key: string, label: string }): string {
    const key = `dashboard.fields.${table}.${field.key}`
    const translated = t(key)
    return translated === key ? field.label : translated
  }

  /** Table label: prefer i18n, fall back to backend label */
  function tableLabel(table: string, fallback: string): string {
    const key = `dashboard.tables.${table}`
    const translated = t(key)
    return translated === key ? fallback : translated
  }

  /**
   * Sidebar/menu label: system-default entries are resolved through i18n
   * (`dashboard.tables.<table>`); admin-customized entries keep their literal
   * label in every language.
   */
  function menuLabel(item: { table: string, label?: string, translatable?: boolean }): string {
    if (item.translatable) return tableLabel(item.table, item.label || item.table)
    return item.label || item.table
  }

  return { fieldLabel, tableLabel, menuLabel }
}

import type { DataScopeActor } from '../../core/dataScope'

export interface TableValidationContext {
  operation: 'create' | 'update'
  actor?: DataScopeActor
  recordId?: number | string
}

export type TableValidator = (
  payload: Record<string, unknown>,
  context: TableValidationContext
) => void | Promise<void>

const validators = new Map<string, TableValidator>()

/** Register one business validator per table (e.g. cross-organization FKs). */
export function registerTableValidator(table: string, validator: TableValidator): void {
  if (validators.has(table)) throw new Error(`Duplicate table validator: ${table}`)
  validators.set(table, validator)
}

export async function runTableValidator(
  table: string,
  payload: Record<string, unknown>,
  context: TableValidationContext
): Promise<void> {
  await validators.get(table)?.(payload, context)
}

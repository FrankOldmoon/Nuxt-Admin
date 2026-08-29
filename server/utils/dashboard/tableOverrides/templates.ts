// Templates L1 "custom list API" showcase override.
//
// When the `customListApi` demo switch (see server/utils/templatesDemo.ts)
// is ON, enrich every row with a virtual `inventoryStatus` column computed
// from `stock`. The generic list handler stays untouched.

import type { TableListOverride } from '../tableOverrides'
import { getDemoSwitches } from '../../templatesDemo'

export default {
  table: 'templates',
  async list(rows) {
    const { customListApi } = await getDemoSwitches()
    if (!customListApi) return rows
    return rows.map((row) => {
      const stock = typeof row.stock === 'number' ? row.stock : Number(row.stock ?? 0)
      return {
        ...row,
        inventoryStatus: stock <= 0 ? 'out_of_stock' : stock < 10 ? 'low_stock' : 'in_stock'
      }
    })
  }
} satisfies TableListOverride
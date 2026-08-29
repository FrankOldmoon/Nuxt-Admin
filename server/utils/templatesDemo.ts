// Templates "personalization ladder" showcase — persistent switch persistence.
//
// Every customization point exposed by the showcase table (`templates`) is
// backed by a boolean switch stored in the `configs` table under a single JSON
// key. The dashboard page (app/pages/dashboard/templates.vue) renders a switch
// panel so developers can flip each personalization on/off and immediately
// compare against the plain generic CRUD.
//
// See server/utils/dashboard/tables.ts → `templatesFields` for the field list,
// server/api/dashboard/data/templates/index.get.ts for the L1 list override.
//
// Switches:
//   customListApi    L1 — custom list API enriches rows (computed column)
//   cellOverrides    L2 — custom table cell rendering (price/status/tags/date)
//   detailOverrides  L2 — custom detail modal head (hero banner + meta)
//   formOverrides    L2 — custom form field rendering (price/status)
//   customToolbar    L3 — custom toolbar (extra "Bulk approve" button)
//   fullCustomPage   L4 — replace the whole page with a hand-written layout

import { getConfig, upsertConfig } from './configs'

export interface DemoSwitches {
  customListApi: boolean
  cellOverrides: boolean
  detailOverrides: boolean
  formOverrides: boolean
  customToolbar: boolean
  fullCustomPage: boolean
}

export const TEMPLATES_DEMO_CONFIG_KEY = 'demo_templates_switches'

export const DEFAULT_DEMO_SWITCHES: DemoSwitches = {
  customListApi: false,
  cellOverrides: false,
  detailOverrides: false,
  formOverrides: false,
  customToolbar: false,
  fullCustomPage: false
}

/** Read the current demo switches, falling back to all-off defaults. */
export async function getDemoSwitches(): Promise<DemoSwitches> {
  const row = await getConfig(TEMPLATES_DEMO_CONFIG_KEY)
  if (!row) return { ...DEFAULT_DEMO_SWITCHES }
  try {
    const parsed = JSON.parse(row.value) as Partial<DemoSwitches>
    return {
      ...DEFAULT_DEMO_SWITCHES,
      ...(parsed && typeof parsed === 'object' ? parsed : {})
    }
  } catch {
    return { ...DEFAULT_DEMO_SWITCHES }
  }
}

/** Persist the demo switch set (replaces the whole set). */
export async function saveDemoSwitches(switches: DemoSwitches): Promise<DemoSwitches> {
  const merged = { ...DEFAULT_DEMO_SWITCHES, ...switches }
  await upsertConfig({
    key: TEMPLATES_DEMO_CONFIG_KEY,
    value: JSON.stringify(merged),
    type: 'string',
    description: 'Templates showcase "personalization ladder" switches (JSON)'
  })
  return merged
}
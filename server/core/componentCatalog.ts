/**
 * Client-facing chat component catalog.
 *
 * The server is the single source of truth for which components exist and what
 * interactions the current actor may use. The browser only renders ids from
 * this catalog and derives its component map from the local build, so a
 * component that is not registered (or whose module is disabled) can never be
 * selected by the model.
 */
import type { UiRegistration } from './moduleSdk'
import { capabilityPermissionMatches } from './capability'

export interface ChatComponentCatalogEntry {
  id: string
  version?: string
  label: string
  description?: string
  propsHint?: string
  appsPath?: string
  interactions: {
    detail: boolean
    edit: boolean
  }
  /** Canonical permission required for editing (informational). */
  editPermission?: string
}

type CatalogSource = Pick<
  UiRegistration,
  'id' | 'version' | 'label' | 'description' | 'propsHint' | 'interactions' | 'appsPath'
>

export function describeChatComponents(
  components: readonly CatalogSource[],
  permissions: readonly string[] | null | undefined
): ChatComponentCatalogEntry[] {
  return components.map(component => ({
    id: component.id,
    version: component.version,
    label: component.label ?? component.id,
    description: component.description,
    propsHint: component.propsHint,
    appsPath: component.appsPath,
    interactions: {
      detail: component.interactions?.detail === true,
      edit: !!component.interactions?.edit
        && capabilityPermissionMatches(permissions, component.interactions.edit.permission)
    },
    editPermission: component.interactions?.edit?.permission
  }))
}

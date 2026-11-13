<script setup lang="ts">
/**
 * Module Management — `/dashboard/modules`.
 *
 * Core-level view of every build-time module: manifest metadata, compatibility,
 * persisted lifecycle state and migration history. Enable/disable/uninstall is
 * enforced by the server-side lifecycle service (`/api/dashboard/modules/:id`), which
 * enforces the transition graph and audit trail. Uninstall only removes lifecycle
 * metadata; module business data is preserved. Actual code loading remains
 * build-time (`ENABLED_MODULES` + Nuxt layers); disabling here gates the
 * module's runtime API until it is enabled again.
 */
definePageMeta({ middleware: 'admin', layout: 'dashboard', keepalive: true })

useSeoMeta({ title: 'Modules · Dashboard' })

interface MigrationEntry {
  id: string
  moduleVersion: string | null
  status: string
  appliedAt: string | null
  durationMs: number | null
  error: string | null
}

interface ModuleItem {
  id: string
  name: string
  version: string
  apiVersion: string
  compatibility: { core?: string }
  enabled: boolean
  dependencies: string[]
  dependencyRanges: Record<string, string>
  permissions: string[]
  capabilities: Record<string, boolean>
  migrationScope: string
  navigation: Array<{ id: string, label: string, to: string }>
  database: string[]
  api: string[]
  tools: string[]
  components: string[]
  state: { state: string, version: string, error: string | null, updatedAt: string | null } | null
  migrations: MigrationEntry[]
}

interface ModulesResponse {
  coreVersion: string
  apiVersion: string
  validation: { ok: boolean, error: string | null }
  availableModuleIds: string[]
  enabledModuleIds: string[]
  modules: ModuleItem[]
}

const { data, refresh } = await useAsyncData('dashboard:modules', () => cGet<ModulesResponse>('/api/dashboard/modules'))

const toast = useToast()
const pending = ref<string | null>(null)
const confirmingUninstall = ref<string | null>(null)

function stateOf(item: ModuleItem): string {
  return item.state?.state ?? (item.enabled ? 'uninitialized' : 'disabled')
}

function stateColor(state: string): 'success' | 'error' | 'warning' | 'neutral' {
  switch (state) {
    case 'active': return 'success'
    case 'failed': return 'error'
    case 'deactivated':
    case 'uninstalling': return 'warning'
    case 'uninstalled': return 'neutral'
    default: return 'neutral'
  }
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleString()
}

function canEnable(item: ModuleItem): boolean {
  const state = stateOf(item)
  return state === 'migrated' || state === 'deactivated'
}

function canDisable(item: ModuleItem): boolean {
  return stateOf(item) === 'active'
}

function canUninstall(item: ModuleItem): boolean {
  return stateOf(item) === 'deactivated'
}

async function runAction(item: ModuleItem, action: 'validate' | 'enable' | 'disable' | 'uninstall') {
  if (action === 'uninstall' && confirmingUninstall.value !== item.id) {
    confirmingUninstall.value = item.id
    return
  }
  const key = `${item.id}:${action}`
  pending.value = key
  try {
    await cPut(`/api/dashboard/modules/${encodeURIComponent(item.id)}`, {
      action,
      ...(action === 'uninstall' ? { confirm: item.id } : {})
    })
    toast.add({ title: `${item.name}: ${action} succeeded`, color: 'success' })
    confirmingUninstall.value = null
    await refresh()
  } catch (error) {
    toast.add({ title: extractErrorMessage(error, `${action} failed`), color: 'error' })
  } finally {
    pending.value = null
  }
}
</script>

<template>
  <div class="space-y-6 p-4 md:p-6">
    <header class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold">
          Modules
        </h1>
        <p class="text-sm text-muted">
          Build-time module catalog, lifecycle state and migration history.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-2 text-sm">
        <UBadge
          color="neutral"
          variant="subtle"
        >
          Core {{ data?.coreVersion }}
        </UBadge>
        <UBadge
          color="neutral"
          variant="subtle"
        >
          API v{{ data?.apiVersion }}
        </UBadge>
        <UBadge
          :color="data?.validation.ok ? 'success' : 'error'"
          variant="subtle"
        >
          {{ data?.validation.ok ? 'Manifests valid' : 'Manifest error' }}
        </UBadge>
        <UButton
          size="sm"
          variant="subtle"
          icon="i-lucide-refresh-cw"
          @click="refresh()"
        >
          Refresh
        </UButton>
      </div>
    </header>

    <UAlert
      v-if="data && !data.validation.ok"
      color="error"
      variant="subtle"
      icon="i-lucide-triangle-alert"
      title="Manifest validation failed"
      :description="data.validation.error ?? ''"
    />

    <p class="text-sm text-muted">
      Enabled at build time: {{ data?.enabledModuleIds.join(', ') || 'none' }}
    </p>

    <div class="grid gap-4 lg:grid-cols-2">
      <UCard
        v-for="item in data?.modules ?? []"
        :key="item.id"
      >
        <div class="space-y-4">
          <div class="flex flex-wrap items-start justify-between gap-2">
            <div>
              <div class="flex items-center gap-2">
                <h2 class="text-lg font-semibold">
                  {{ item.name }}
                </h2>
                <UBadge
                  :color="stateColor(stateOf(item))"
                  variant="subtle"
                >
                  {{ stateOf(item) }}
                </UBadge>
                <UBadge
                  v-if="!item.enabled"
                  color="neutral"
                  variant="outline"
                >
                  not enabled
                </UBadge>
              </div>
              <p class="text-xs text-muted font-mono">
                {{ item.id }} · v{{ item.version }} · api v{{ item.apiVersion }}
              </p>
            </div>
            <div class="flex gap-2">
              <UButton
                size="xs"
                variant="subtle"
                icon="i-lucide-shield-check"
                :loading="pending === `${item.id}:validate`"
                @click="runAction(item, 'validate')"
              >
                Validate
              </UButton>
              <UButton
                size="xs"
                color="success"
                variant="subtle"
                icon="i-lucide-play"
                :disabled="!canEnable(item)"
                :loading="pending === `${item.id}:enable`"
                @click="runAction(item, 'enable')"
              >
                Enable
              </UButton>
              <UButton
                size="xs"
                color="warning"
                variant="subtle"
                icon="i-lucide-pause"
                :disabled="!canDisable(item)"
                :loading="pending === `${item.id}:disable`"
                @click="runAction(item, 'disable')"
              >
                Disable
              </UButton>
              <UButton
                size="xs"
                color="error"
                variant="subtle"
                icon="i-lucide-trash-2"
                :disabled="!canUninstall(item)"
                :loading="pending === `${item.id}:uninstall`"
                @click="runAction(item, 'uninstall')"
              >
                {{ confirmingUninstall === item.id ? 'Confirm uninstall' : 'Uninstall' }}
              </UButton>
            </div>
          </div>

          <UAlert
            v-if="item.state?.error"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            title="Last error"
            :description="item.state.error"
          />

          <dl class="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt class="text-xs text-muted">
                Core compatibility
              </dt>
              <dd class="font-mono">
                {{ item.compatibility.core ?? 'any' }}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-muted">
                Migration scope
              </dt>
              <dd class="font-mono">
                {{ item.migrationScope }}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-muted">
                Dependencies
              </dt>
              <dd class="font-mono">
                {{ item.dependencies.length
                  ? item.dependencies.map(d => item.dependencyRanges[d] ? `${d}@${item.dependencyRanges[d]}` : d).join(', ')
                  : 'none' }}
              </dd>
            </div>
            <div>
              <dt class="text-xs text-muted">
                Last state update
              </dt>
              <dd>{{ formatDate(item.state?.updatedAt ?? null) }}</dd>
            </div>
          </dl>

          <div class="space-y-1 text-sm">
            <p class="text-xs text-muted">
              Required permissions
            </p>
            <div class="flex flex-wrap gap-1">
              <UBadge
                v-for="permission in item.permissions"
                :key="permission"
                color="neutral"
                variant="subtle"
              >
                {{ permission }}
              </UBadge>
              <span
                v-if="!item.permissions.length"
                class="text-muted"
              >none</span>
            </div>
          </div>

          <div class="grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
            <div>
              <p class="text-muted">
                Database tables
              </p>
              <p class="font-mono">
                {{ item.database.join(', ') || '—' }}
              </p>
            </div>
            <div>
              <p class="text-muted">
                APIs / tools / UI
              </p>
              <p class="font-mono">
                {{ item.api.length }} / {{ item.tools.length }} / {{ item.components.length }}
              </p>
            </div>
          </div>

          <div class="space-y-2">
            <p class="text-xs text-muted">
              Migrations
            </p>
            <div
              v-if="item.migrations.length"
              class="space-y-1"
            >
              <div
                v-for="migration in item.migrations"
                :key="migration.id"
                class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-default px-2 py-1 text-xs"
              >
                <span class="font-mono">{{ migration.id }}</span>
                <span class="flex items-center gap-2">
                  <UBadge
                    :color="migration.status === 'applied' ? 'success' : migration.status === 'failed' ? 'error' : 'neutral'"
                    variant="subtle"
                  >
                    {{ migration.status }}
                  </UBadge>
                  <span class="text-muted">{{ formatDate(migration.appliedAt) }}</span>
                  <span
                    v-if="migration.durationMs !== null"
                    class="text-muted"
                  >{{ migration.durationMs }}ms</span>
                </span>
              </div>
            </div>
            <p
              v-else
              class="text-xs text-muted"
            >
              No migrations recorded.
            </p>
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * OAuth clients dashboard page — `/dashboard/oauthClients`.
 *
 * Reuses DashboardCrudPage for the metadata-driven list/form and adds two
 * OAuth-specific affordances:
 *   - after create (or a public → confidential switch) the generated client
 *     secret is shown once in a modal;
 *   - a per-row "rotate secret" action that issues a new secret.
 */
import type { TableMetaWithOptions } from '~/types/dashboard'

definePageMeta({ middleware: 'admin', layout: 'dashboard', keepalive: true })

const { t } = useI18n()
useSeoMeta({ title: () => `${t('oauthClients.title')} · ${t('dashboard.table.seoSuffix')}` })

const { data: meta } = await useAsyncData(
  'dashboard:meta:oauthClients',
  () => cGet<TableMetaWithOptions>('/api/dashboard/meta/oauthClients')
)

const toast = useToast()
const crudRef = ref()
const rotating = ref<number | null>(null)

interface SecretInfo {
  clientId: string
  clientSecret: string
  name?: string
}
const secretOpen = ref(false)
const secretInfo = ref<SecretInfo | null>(null)

function showSecret(info: SecretInfo) {
  secretInfo.value = info
  secretOpen.value = true
}

function onSaved(payload: { response: unknown }) {
  const res = payload.response as {
    item?: { clientId?: string, name?: string }
    clientSecret?: string | null
  }
  if (res?.clientSecret) {
    showSecret({
      clientId: res.item?.clientId ?? '',
      clientSecret: res.clientSecret,
      name: res.item?.name
    })
  }
}

/** Pre-fill sensible defaults for a new application. */
function onBeforeCreate(form: { value: Record<string, unknown> }) {
  form.value.scopes = 'openid profile email'
  form.value.accessTokenTtlMinutes = 60
  form.value.refreshTokenTtlDays = 30
}

async function rotateSecret(item: Record<string, unknown>) {
  const id = Number(item.id)
  if (!id) return
  rotating.value = id
  try {
    const res = await cPost<{ clientId: string, clientSecret: string }>(`/api/oauth/clients/${id}/rotate-secret`)
    showSecret({ clientId: res.clientId, clientSecret: res.clientSecret, name: String(item.name ?? '') })
    toast.add({ title: t('oauthClients.rotated'), color: 'success' })
  } catch (e) {
    toast.add({ title: extractErrorMessage(e, t('oauthClients.rotateFailed')), color: 'error' })
  } finally {
    rotating.value = null
  }
}

async function copySecret() {
  if (!secretInfo.value) return
  await navigator.clipboard.writeText(secretInfo.value.clientSecret)
  toast.add({ title: t('oauthClients.copied'), color: 'success' })
}
</script>

<template>
  <div>
    <DashboardCrudPage
      v-if="meta"
      ref="crudRef"
      :meta="meta"
      @saved="onSaved"
      @before-create="onBeforeCreate"
    >
      <!-- Per-row secret rotation (confidential clients only) -->
      <template #table-actions-prepend="{ item }">
        <UButton
          v-if="!item.isPublic"
          size="xs"
          variant="ghost"
          color="warning"
          icon="i-lucide-refresh-cw"
          :loading="rotating === item.id"
          :aria-label="t('oauthClients.rotate')"
          :title="t('oauthClients.rotate')"
          @click="rotateSecret(item)"
        />
      </template>

      <template #table-clientId="{ value }">
        <code class="rounded bg-elevated px-1.5 py-0.5 text-xs">{{ value }}</code>
      </template>

      <template #table-scopes="{ value }">
        <div class="flex flex-wrap gap-1">
          <UBadge
            v-for="scope in String(value || '').split(' ').filter(Boolean)"
            :key="scope"
            size="sm"
            variant="subtle"
            color="neutral"
            :label="scope"
          />
        </div>
      </template>

      <template #table-isPublic="{ value }">
        <UBadge
          :color="value ? 'info' : 'primary'"
          variant="subtle"
          size="sm"
          :label="value ? t('oauthClients.public') : t('oauthClients.confidential')"
        />
      </template>

      <template #table-isActive="{ value }">
        <UBadge
          :color="value ? 'success' : 'error'"
          variant="subtle"
          size="sm"
          :label="value ? t('oauthClients.active') : t('oauthClients.inactive')"
        />
      </template>
    </DashboardCrudPage>

    <!-- One-time secret reveal -->
    <UModal
      v-model:open="secretOpen"
      :title="t('oauthClients.secretTitle')"
    >
      <template #body>
        <div v-if="secretInfo" class="space-y-4">
          <UAlert
            icon="i-lucide-triangle-alert"
            color="warning"
            variant="subtle"
            :title="t('oauthClients.secretOnce')"
            :description="t('oauthClients.secretOnceHint')"
          />
          <div>
            <p class="text-xs text-muted">
              {{ t('oauthClients.clientName') }}
            </p>
            <p class="text-sm font-medium text-highlighted">
              {{ secretInfo.name || secretInfo.clientId }}
            </p>
          </div>
          <UFormField :label="t('oauthClients.clientId')">
            <UInput :model-value="secretInfo.clientId" readonly class="w-full font-mono" />
          </UFormField>
          <UFormField :label="t('oauthClients.clientSecret')">
            <div class="flex gap-2">
              <UInput :model-value="secretInfo.clientSecret" readonly class="w-full font-mono" />
              <UButton icon="i-lucide-copy" variant="soft" color="primary" @click="copySecret" />
            </div>
          </UFormField>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full justify-end">
          <UButton color="primary" :label="t('common.close')" @click="secretOpen = false" />
        </div>
      </template>
    </UModal>
  </div>
</template>

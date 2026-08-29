<script setup lang="ts">
/**
 * Users dashboard page — `/dashboard/users`.
 *
 * Reuses DashboardCrudPage (generic metadata-driven CRUD) with custom slots:
 *   - Toolbar: create + import + export buttons
 *   - Filters: role / isActive / gender / emailVerified
 *   - Table cells: avatar+username, role badge, active badge
 *   - Detail cells: role badge, active badge
 *
 * Backend: custom API at /api/dashboard/data/users/* (same structure as
 * generic CRUD but with richer validation, role joins, import endpoint).
 */
import type { TableMetaWithOptions } from '~/types/dashboard'

definePageMeta({ middleware: 'admin', layout: 'dashboard', keepalive: true })

const { t } = useI18n()
useSeoMeta({ title: () => `${t('users.title')} · ${t('dashboard.table.seoSuffix')}` })

function navigate(table: string) {
  if (table === 'users') return
  navigateTo(`/dashboard/${table}`)
}

// ---------- Fetch table meta (includes relation options for roleId) ----------
const { data: meta } = await useAsyncData(
  'dashboard:meta:users',
  () => cGet<TableMetaWithOptions>('/api/dashboard/meta/users')
)

// ---------- CRUD page ref (to call refresh after import) ----------
const crudRef = ref()

// ---------- Import modal ----------
const importModalOpen = ref(false)
function onImported() {
  crudRef.value?.refresh()
}

// ---------- Export to Excel ----------
const { exporting, exportTableExcel } = useExcelExport()

function exportExcel() {
  exportTableExcel(
    meta.value!,
    '/api/dashboard/data/users',
    {},
    false,
    (u: Record<string, unknown>) => ({
      ID: u.id,
      Username: u.username,
      Name: u.name ?? '',
      Telephone: u.telephone ?? '',
      Email: u.email,
      Role: (u as any).role?.name ?? '',
      Status: u.isActive ? t('users.active') : t('users.disabled'),
      EmailVerified: u.emailVerifiedAt ? 'Yes' : 'No',
      Gender: u.gender ?? '',
      Created: new Date(u.createdAt as string).toLocaleString()
    }),
  )
}

// ---------- Helpers ----------
const roleFilterOptions = computed(() =>
  (meta.value?.relationOptions?.roleId ?? []).map(o => ({ label: o.label, value: o.label }))
)
function roleColor(roleName: string | undefined): 'primary' | 'neutral' {
  return roleName === 'admin' ? 'primary' : 'neutral'
}
</script>

<template>
  <DashboardShell active-table="users" @navigate="navigate">
    <DashboardCrudPage v-if="meta" ref="crudRef" :meta="meta">
      <!-- Toolbar: Create + Import + Export -->
      <template #toolbar="{ openCreate, trashed }">
        <template v-if="!trashed">
          <UButton
            icon="i-lucide-upload"
            variant="soft"
            color="primary"
            :label="t('users.import')"
            @click="importModalOpen = true"
          />
          <UButton
            icon="i-lucide-download"
            variant="soft"
            color="warning"
            :label="t('users.export')"
            :loading="exporting"
            @click="exportExcel"
          />
          <UButton
            icon="i-lucide-plus"
            color="primary"
            :label="t('users.create')"
            @click="openCreate"
          />
        </template>
      </template>

      <!-- Filters: role / isActive / gender / emailVerified -->
      <template #filters="{ set, filters }">
        <UFormField :label="t('users.colRole')">
          <USelectMenu
            :model-value="filters.role"
            value-key="value"
            :items="roleFilterOptions"
            :placeholder="t('common.all')"
            class="w-40"
            @update:model-value="set('role', $event === undefined ? undefined : $event)"
          />
        </UFormField>
        <UFormField :label="t('users.colActive')">
          <USelectMenu
            :model-value="filters.isActive"
            value-key="value"
            :items="[{ label: t('users.active'), value: 'true' }, { label: t('users.disabled'), value: 'false' }]"
            :placeholder="t('common.all')"
            class="w-32"
            @update:model-value="set('isActive', $event === undefined ? undefined : $event)"
          />
        </UFormField>
        <UFormField :label="t('profile.gender')">
          <USelectMenu
            :model-value="filters.gender"
            value-key="value"
            :items="[{ label: t('profile.genderMale'), value: 'male' }, { label: t('profile.genderFemale'), value: 'female' }, { label: t('profile.genderOther'), value: 'other' }]"
            :placeholder="t('common.all')"
            class="w-32"
            @update:model-value="set('gender', $event === undefined ? undefined : $event)"
          />
        </UFormField>
        <UFormField :label="t('users.colEmailVerified')">
          <USelectMenu
            :model-value="filters.emailVerified"
            value-key="value"
            :items="[{ label: t('users.verified'), value: 'true' }, { label: t('users.unverified'), value: 'false' }]"
            :placeholder="t('common.all')"
            class="w-32"
            @update:model-value="set('emailVerified', $event === undefined ? undefined : $event)"
          />
        </UFormField>
      </template>

      <!-- Table: username with avatar -->
      <template #table-username="{ item }">
        <div class="flex items-center gap-2">
          <UAvatar
            :src="item.avatarPath ? `/api/files/serve/${item.avatarPath}` : undefined"
            :alt="item.username"
            size="sm"
          />
          <span class="font-medium text-highlighted">{{ item.username }}</span>
        </div>
      </template>

      <!-- Table: role badge -->
      <template #table-role="{ item }">
        <UBadge
          v-if="item.role"
          :label="item.role.name"
          :color="roleColor(item.role.name)"
          variant="subtle"
          size="sm"
        />
        <span v-else class="text-muted">-</span>
      </template>

      <!-- Table: isActive badge -->
      <template #table-isActive="{ value }">
        <UBadge
          :color="value ? 'success' : 'error'"
          variant="subtle"
          size="sm"
          :label="value ? t('users.active') : t('users.disabled')"
        />
      </template>

      <!-- Detail: avatar at top (before other fields) -->
      <template #detail-before="{ item }">
        <div v-if="item" class="mb-4 flex justify-center">
          <BaseImagePreview
            v-if="item.avatarPath"
            :src="`/api/files/serve/${item.avatarPath}`"
            :alt="String(item.username || '')"
          >
            <template #default="{ open }">
              <img
                :src="`/api/files/serve/${item.avatarPath}`"
                :alt="String(item.username || '')"
                class="h-24 w-24 cursor-zoom-in rounded-full object-cover border-2 border-default shadow"
                @click="open"
              />
            </template>
          </BaseImagePreview>
          <UAvatar
            v-else
            :name="String((item as Record<string, unknown>).name || item.username || '')"
            alt="Avatar"
            size="3xl"
          />
        </div>
      </template>

      <!-- Detail: role badge -->
      <template #detail-role="{ item }">
        <UBadge
          v-if="item.role"
          :label="(item.role as { name?: string }).name"
          :color="roleColor((item.role as { name?: string }).name)"
          variant="subtle"
          size="sm"
        />
        <span v-else class="text-muted">-</span>
      </template>

      <!-- Detail: isActive badge -->
      <template #detail-isActive="{ value }">
        <UBadge
          :color="value ? 'success' : 'error'"
          variant="subtle"
          size="sm"
          :label="value ? t('users.active') : t('users.disabled')"
        />
      </template>
    </DashboardCrudPage>

    <!-- Import modal -->
    <DashboardUsersImportModal v-model:open="importModalOpen" @imported="onImported" />
  </DashboardShell>
</template>

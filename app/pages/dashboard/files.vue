<script setup lang="ts">
/**
 * Files dashboard page — `/dashboard/files`.
 *
 * Reuses DashboardCrudPage (generic metadata-driven CRUD) with custom slots:
 *   - Toolbar: upload button (replaces default create)
 *   - Filters: mimeType / sizeMin / sizeMax
 *   - Table cells: filename+preview+download, short hash, formatted size
 *   - Detail cells: full hash, formatted size, image preview
 *
 * Backend: custom API at /api/dashboard/data/files/* (same structure as
 * generic CRUD but with file-specific upload/serve/download logic).
 * Serve/download endpoints remain at /api/files/serve/* and
 * /api/files/download/* (public, not admin-only).
 */
import type { TableMetaWithOptions } from '~/types/dashboard'

definePageMeta({ middleware: 'admin', layout: 'dashboard', keepalive: true })

const { t } = useI18n()
useSeoMeta({ title: () => `${t('files.title')} · ${t('dashboard.table.seoSuffix')}` })

function navigate(table: string) {
  if (table === 'files') return
  navigateTo(`/dashboard/${table}`)
}

// ---------- Fetch table meta ----------
const { data: meta } = await useAsyncData(
  'dashboard:meta:files',
  () => cGet<TableMetaWithOptions>('/api/dashboard/meta/files')
)

// ---------- CRUD page ref ----------
const crudRef = ref()

// ---------- Upload modal ----------
const uploadModalOpen = ref(false)
function onUploaded() {
  uploadModalOpen.value = false
  crudRef.value?.refresh()
}

// ---------- Helpers ----------
function isImageMime(mime: string | null | undefined): boolean {
  return !!mime && mime.startsWith('image/')
}
function serveUrl(path: string): string {
  return `/api/files/serve/${path}`
}
function downloadUrl(path: string): string {
  return `/api/files/download/${path}`
}
</script>

<template>
  <DashboardShell active-table="files" @navigate="navigate">
    <DashboardCrudPage v-if="meta" ref="crudRef" :meta="meta">
      <!-- Toolbar: Upload button (replaces default Create) -->
      <template #toolbar="{ trashed }">
        <UButton
          v-if="!trashed"
          icon="i-lucide-upload"
          color="primary"
          :label="t('files.create')"
          @click="uploadModalOpen = true"
        />
      </template>

      <!-- Filters: mimeType / sizeMin / sizeMax -->
      <template #filters="{ set, filters }">
        <UFormField :label="t('files.colMimeType')">
          <USelectMenu
            :model-value="filters.mimeType"
            value-key="value"
            :items="[
              { label: t('files.mimeImage'), value: 'image/' },
              { label: t('files.mimeVideo'), value: 'video/' },
              { label: t('files.mimeAudio'), value: 'audio/' },
              { label: t('files.mimeText'), value: 'text/' },
              { label: t('files.mimeApplication'), value: 'application/' }
            ]"
            :placeholder="t('common.all')"
            class="w-40"
            @update:model-value="set('mimeType', $event === undefined ? undefined : $event)"
          />
        </UFormField>
        <UFormField :label="t('files.sizeMin')">
          <UInput
            :model-value="filters.sizeMin"
            type="number"
            placeholder="0"
            class="w-28"
            @update:model-value="set('sizeMin', $event === '' ? undefined : $event)"
          />
        </UFormField>
        <UFormField :label="t('files.sizeMax')">
          <UInput
            :model-value="filters.sizeMax"
            type="number"
            placeholder="∞"
            class="w-28"
            @update:model-value="set('sizeMax', $event === '' ? undefined : $event)"
          />
        </UFormField>
      </template>

      <!-- Table: filename — name on the left, image thumbnail on the right -->
      <template #table-filename="{ item }">
        <div class="flex items-center gap-2">
          <div class="min-w-0 flex-1">
            <div class="truncate font-medium text-highlighted">{{ item.originalName }}</div>
            <div class="truncate text-xs text-muted">{{ item.filename }}</div>
          </div>
          <UTooltip
            v-if="isImageMime(item.mimeType)"
            :content="{ side: 'top' }"
            :ui="{ content: '!max-w-[85vw] !w-auto !overflow-visible' }"
          >
            <template #content>
              <img :src="serveUrl(item.path)" :alt="item.originalName" class="max-h-[80vh] max-w-[80vw] rounded object-contain">
            </template>
            <img :src="serveUrl(item.path)" :alt="item.originalName" class="h-10 w-10 shrink-0 cursor-zoom-in rounded border object-cover">
          </UTooltip>
        </div>
      </template>

      <!-- Actions prepend: preview (open in browser) + download -->
      <template #table-actions-prepend="{ item }">
        <UButton
          :to="serveUrl(item.path)"
          external
          target="_blank"
          icon="i-lucide-external-link"
          size="xs"
          color="neutral"
          variant="ghost"
          :title="t('common.preview')"
        />
        <UButton
          :to="downloadUrl(item.path)"
          external
          icon="i-lucide-download"
          size="xs"
          color="neutral"
          variant="ghost"
          :title="t('common.download')"
        />
      </template>

      <!-- Table: owner name -->
      <template #table-userId="{ item }">
        {{ item.userName ?? item.userId }}
      </template>

      <!-- Table: short hash -->
      <template #table-hash="{ value }">
        <span class="font-mono text-xs text-muted" :title="value">
          {{ shortHash(value) }}
        </span>
      </template>

      <!-- Table: formatted size -->
      <template #table-size="{ value }">
        {{ formatBytes(value) }}
      </template>

      <!-- Detail: image preview (before other fields) -->
      <template #detail-before="{ item }">
        <div v-if="item && isImageMime(String(item.mimeType ?? ''))" class="mb-4 flex justify-center">
          <UTooltip :content="{ side: 'top' }" :ui="{ content: '!max-w-[85vw] !w-auto !overflow-visible' }">
            <template #content>
              <img :src="serveUrl(String(item.path ?? ''))" :alt="String(item.originalName ?? '')" class="max-h-[80vh] max-w-[80vw] rounded object-contain">
            </template>
            <img :src="serveUrl(String(item.path ?? ''))" :alt="String(item.originalName ?? '')" class="max-h-64 max-w-full cursor-zoom-in rounded bg-muted object-contain">
          </UTooltip>
        </div>
      </template>

      <!-- Detail: owner name -->
      <template #detail-userId="{ value, item }">
        {{ item?.userName ?? value }}
      </template>

      <!-- Detail: full hash -->
      <template #detail-hash="{ value }">
        <code class="break-all text-xs">{{ value }}</code>
      </template>

      <!-- Detail: formatted size -->
      <template #detail-size="{ value }">
        {{ formatBytes(Number(value)) }}
      </template>

      <!-- Detail: path with monospace -->
      <template #detail-path="{ value }">
        <code class="break-all text-xs">{{ value }}</code>
      </template>
    </DashboardCrudPage>

    <!-- Upload modal -->
    <UModal
      v-model:open="uploadModalOpen"
      :title="t('files.createTitle')"
      :description="t('files.subtitle')"
    >
      <template #body>
        <BaseFileUploader
          endpoint="/api/dashboard/data/files/upload"
          @uploaded="onUploaded"
        />
      </template>
    </UModal>
  </DashboardShell>
</template>

<script setup lang="ts">
/**
 * Record detail view — drives display from FieldMeta.
 * Slots: `detail-before`, `detail-after`, and per-field `detail-{key}`.
 */
import type { TableMetaWithOptions } from '~/types/dashboard'

const props = defineProps<{
  meta: TableMetaWithOptions
  item: Record<string, unknown> | null
}>()

const { t } = useI18n()
const { fieldLabel } = useDashboardLabels()

const visibleFields = computed(() => props.meta.fields.filter(f => f.showInDetail))
const fLabel = (f: { key: string, label: string }) => fieldLabel(props.meta.table, f)
</script>

<template>
  <div class="space-y-2">
    <slot name="detail-before" :item="item" />
    <div v-if="!item" class="py-6 text-center text-muted italic">{{ t('dashboard.crud.loadingDetail') }}</div>
    <dl v-else class="space-y-2">
      <div
        v-for="f in visibleFields"
        :key="f.key"
        class="grid grid-cols-12 items-start gap-3 border-b pb-2"
      >
        <dt class="col-span-3 pt-1 text-sm text-right text-muted pr-2">{{ fLabel(f) }}</dt>
        <dd class="col-span-9 text-sm">
          <slot :name="`detail-${f.key}`" :item="item" :value="item[f.key]">
            <DashboardCellRenderer
              :field="f"
              :value="item[f.key]"
              :options="meta.relationOptions?.[f.key]"
              variant="detail"
            />
          </slot>
        </dd>
      </div>
    </dl>
    <slot name="detail-after" :item="item" />
  </div>
</template>

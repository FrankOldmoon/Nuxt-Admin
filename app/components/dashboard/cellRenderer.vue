<script setup lang="ts">
/**
 * Cell renderer used in dashboard tables AND detail views.
 * Given a FieldMeta + raw value, produce a nice display.
 * Callers can override any cell via slot `table-{key}` / `detail-{key}`.
 */
import type { FieldMeta, FieldOption } from '~/types/dashboard'

const props = defineProps<{
  field: FieldMeta
  value: unknown
  /** Used for select/relation cells to map value → label */
  options?: FieldOption[]
  /** Render variant — affects density (table = compact, detail = relaxed) */
  variant?: 'table' | 'detail'
}>()

const { t } = useI18n()

function resolveImageSrc(raw: string): string {
  if (/^https?:\/\//i.test(raw) || raw.startsWith('/') || raw.startsWith('data:')) return raw
  return `/api/files/serve/${raw}`
}
function displayUrl(v: string): string {
  if (v.length <= 80) return v
  return `${v.slice(0, 77)}…`
}

/** Deterministically pick a badge color for a tag so the same tag always
 *  gets the same color across renders.  Cycles through a curated palette. */
const TAG_COLORS = ['primary', 'info', 'success', 'warning', 'error', 'neutral'] as const
type TagColor = typeof TAG_COLORS[number]
function tagColor(tag: string, index: number): TagColor {
  let hash = 0
  for (let i = 0; i < tag.length; i++) {
    hash = ((hash << 5) - hash + tag.charCodeAt(i)) | 0
  }
  return TAG_COLORS[Math.abs(hash + index) % TAG_COLORS.length] as TagColor
}

/** Normalise a tags value into a string array.  Handles real arrays,
 *  JSON-array strings (`["new","hot"]`) and comma/space-separated strings
 *  (`new,hot`), so a single tag "new,hot" can never appear. */
function normalizeTags(v: unknown): string[] {
  if (Array.isArray(v)) return (v as Array<string | number>).map(String)
  if (typeof v === 'string') {
    const s = v.trim()
    if (!s) return []
    try {
      const parsed = JSON.parse(s)
      if (Array.isArray(parsed)) return parsed.map(String)
    } catch { /* not a JSON array — fall through to splitting */ }
    return s.split(/[,，\s]+/).filter(Boolean)
  }
  return []
}

const displayValue = computed(() => {
  const f = props.field
  // Apply the field's custom getter (if registered) before display.
  let v = applyFieldGetter(f.getter, props.value)
  if (v === null || v === undefined || v === '') {
    return { kind: 'empty' as const }
  }
  // Treat json columns whose key contains "tags" as tags arrays
  const effectiveType = f.type === 'json' && f.key.toLowerCase().includes('tags') ? 'tags' : f.type
  switch (effectiveType) {
    case 'boolean':
      return { kind: 'boolean' as const, value: !!v }
    case 'number':
      return { kind: 'text' as const, value: String(v) }
    case 'date':
    case 'datetime': {
      const date = typeof v === 'string' ? new Date(v) : v instanceof Date ? v : null
      if (!date || isNaN(date.getTime())) return { kind: 'text' as const, value: String(v) }
      return { kind: 'date' as const, value: date }
    }
    case 'image': {
      const obj = (v && typeof v === 'object') ? (v as Record<string, unknown>) : null
      const path = (obj?.path as string) ?? String(v)
      return { kind: 'image' as const, value: resolveImageSrc(path) }
    }
    case 'icon': {
      const s = String(v).trim()
      if (s.startsWith('<svg')) return { kind: 'icon' as const, iconKind: 'svg' as const, value: s }
      if (s.startsWith('i-')) return { kind: 'icon' as const, iconKind: 'iconify' as const, value: s }
      if (/^https?:\/\//i.test(s) || s.startsWith('/') || s.startsWith('data:')) {
        return { kind: 'icon' as const, iconKind: 'url' as const, value: resolveImageSrc(s) }
      }
      return { kind: 'text' as const, value: s }
    }
    case 'file': {
      const obj = (v && typeof v === 'object') ? (v as Record<string, unknown>) : null
      const path = (obj?.path as string) ?? String(v)
      const name = (obj?.fileName as string) ?? path
      return { kind: 'file', original: name, value: resolveImageSrc(path) }
    }
    case 'files': {
      const arr = Array.isArray(v) ? v : (v == null || v === '' ? [] : [v])
      const items = (arr as Array<unknown>).map((x) => {
        const obj = (x && typeof x === 'object') ? (x as Record<string, unknown>) : null
        const path = (obj?.path as string) ?? String(x)
        const name = (obj?.fileName as string) ?? path
        return { path, name }
      })
      return { kind: 'files' as const, value: items }
    }
    case 'hyperlink':
      return { kind: 'hyperlink' as const, value: String(v), label: displayUrl(String(v)) }
    case 'select':
    case 'relation': {
      const match = (props.options ?? f.options ?? []).find(o => String(o.value) === String(v))
      return { kind: 'tag' as const, value: match?.label ?? String(v) }
    }
    case 'tags':
    case 'many-to-many': {
      const items = normalizeTags(v)
      // For many-to-many, map ids → labels using options
      if (f.type === 'many-to-many' && props.options?.length) {
        const labels = items.map(id => props.options!.find(o => String(o.value) === String(id))?.label ?? String(id))
        return { kind: 'tags' as const, value: labels }
      }
      return { kind: 'tags' as const, value: items }
    }
    case 'password':
      return { kind: 'text' as const, value: '••••••' }
    case 'json': {
      try {
        const pretty = typeof v === 'string' ? JSON.stringify(JSON.parse(v), null, 2) : JSON.stringify(v, null, 2)
        return { kind: 'code' as const, value: pretty }
      } catch {
        return { kind: 'text' as const, value: String(v) }
      }
    }
    case 'markdown':
      return { kind: 'markdown' as const, value: String(v) }
    case 'textarea':
    case 'text':
    default:
      return { kind: 'text' as const, value: String(v) }
  }
})
</script>

<template>
  <!-- table variant: dense, with truncation -->
  <template v-if="variant !== 'detail'">
    <span v-if="displayValue.kind === 'empty'" class="text-muted italic">-</span>
    <UBadge v-else-if="displayValue.kind === 'boolean'" :color="displayValue.value ? 'success' : 'neutral'" variant="soft">
      {{ displayValue.value ? t('dashboard.crud.booleanYes') : t('dashboard.crud.booleanNo') }}
    </UBadge>
    <UBadge v-else-if="displayValue.kind === 'tag'" variant="soft" color="neutral" class="font-normal">
      {{ displayValue.value }}
    </UBadge>
    <div v-else-if="displayValue.kind === 'tags'" class="flex flex-wrap gap-1">
      <UBadge v-for="(tag, i) in displayValue.value" :key="i" size="xs" variant="subtle" :color="tagColor(tag, i)">{{ tag }}</UBadge>
    </div>
    <time v-else-if="displayValue.kind === 'date'" :datetime="(displayValue.value as Date).toISOString()" class="whitespace-nowrap text-sm">
      {{ formatTime((displayValue.value as Date).getTime()) }}
    </time>
    <UTooltip
      v-else-if="displayValue.kind === 'image'"
      :content="{ side: 'top' }"
      :ui="{ content: '!max-w-[85vw] !w-auto !overflow-visible' }"
    >
      <template #content>
        <img :src="displayValue.value" :alt="field.label" class="max-h-[80vh] max-w-[80vw] rounded object-contain">
      </template>
      <img :src="displayValue.value" :alt="field.label" class="h-10 w-10 shrink-0 cursor-zoom-in rounded border object-cover">
    </UTooltip>
    <!-- icon field: inline SVG / Iconify class / image URL -->
    <div v-else-if="displayValue.kind === 'icon'" class="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-default bg-muted/40">
      <img v-if="displayValue.iconKind === 'url'" :src="displayValue.value" :alt="field.label" class="h-full w-full object-contain">
      <UIcon v-else-if="displayValue.iconKind === 'iconify'" :name="displayValue.value" class="h-5 w-5 text-muted" />
      <!-- svg rendered as raw HTML -->
      <span v-else-if="displayValue.iconKind === 'svg'" class="flex h-full w-full items-center justify-center" v-html="displayValue.value"></span>
    </div>
    <a
      v-else-if="displayValue.kind === 'file'"
      :href="displayValue.value"
      target="_blank"
      rel="noopener noreferrer"
      class="inline-flex items-center gap-1 text-primary hover:underline truncate block max-w-[260px]"
      :title="displayValue.original as string"
    >
      <UIcon name="i-lucide-file" class="h-3.5 w-3.5 shrink-0" />
      <span class="truncate">{{ displayValue.original }}</span>
    </a>
    <div v-else-if="displayValue.kind === 'files'" class="flex max-w-[320px] flex-wrap gap-x-3 gap-y-1">
      <a
        v-for="(item, i) in (displayValue.value as { path: string, name: string }[])"
        :key="i"
        :href="resolveImageSrc(item.path)"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex max-w-full items-center gap-1 text-primary hover:underline"
        :title="item.name"
      >
        <UIcon name="i-lucide-paperclip" class="h-3.5 w-3.5 shrink-0" />
        <span class="truncate">{{ item.name }}</span>
      </a>
    </div>
    <a
      v-else-if="displayValue.kind === 'hyperlink'"
      :href="displayValue.value"
      target="_blank"
      rel="noopener noreferrer"
      class="text-primary hover:underline truncate block max-w-[300px]"
      :title="displayValue.value"
    >{{ displayValue.label }}</a>
    <UTooltip v-else-if="displayValue.kind === 'text' && String(displayValue.value).length > 40" :text="displayValue.value as string">
      <span class="truncate block max-w-[240px]">{{ displayValue.value }}</span>
    </UTooltip>
    <span v-else-if="displayValue.kind === 'text'">{{ displayValue.value }}</span>
    <div v-else-if="displayValue.kind === 'markdown'" class="line-clamp-2 max-w-[320px] overflow-hidden text-xs text-muted">
      {{ String(displayValue.value).slice(0, 120) }}{{ String(displayValue.value).length > 120 ? '…' : '' }}
    </div>
    <UTooltip v-else-if="displayValue.kind === 'code'" :text="t('dashboard.crud.clickToCopy')">
      <code class="truncate block max-w-[260px] text-xs bg-muted px-2 py-1 rounded">{{ (displayValue.value as string).slice(0, 40) + ((displayValue.value as string).length > 40 ? '…' : '') }}</code>
    </UTooltip>
  </template>

  <!-- detail variant: relaxed, no truncation -->
  <template v-else>
    <div v-if="displayValue.kind === 'empty'" class="text-muted italic">-</div>
    <UBadge v-else-if="displayValue.kind === 'boolean'" :color="displayValue.value ? 'success' : 'neutral'" variant="soft">
      {{ displayValue.value ? t('dashboard.crud.booleanYes') : t('dashboard.crud.booleanNo') }}
    </UBadge>
    <UBadge v-else-if="displayValue.kind === 'tag'" variant="soft" color="neutral">{{ displayValue.value }}</UBadge>
    <div v-else-if="displayValue.kind === 'tags'" class="flex flex-wrap gap-1.5">
      <UBadge v-for="(tag, i) in displayValue.value" :key="i" size="sm" variant="subtle" :color="tagColor(tag, i)">{{ tag }}</UBadge>
    </div>
    <time v-else-if="displayValue.kind === 'date'" :datetime="(displayValue.value as Date).toISOString()">
      {{ formatTime((displayValue.value as Date).getTime()) }}
    </time>
    <UTooltip
      v-else-if="displayValue.kind === 'image'"
      :content="{ side: 'top' }"
      :ui="{ content: '!max-w-[85vw] !w-auto !overflow-visible' }"
    >
      <template #content>
        <img :src="displayValue.value" :alt="field.label" class="max-h-[80vh] max-w-[80vw] rounded object-contain">
      </template>
      <img :src="displayValue.value" :alt="field.label" class="max-h-80 max-w-full cursor-zoom-in rounded bg-muted object-contain">
    </UTooltip>
    <div v-else-if="displayValue.kind === 'icon'" class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-default bg-muted/40">
      <img v-if="displayValue.iconKind === 'url'" :src="displayValue.value" :alt="field.label" class="h-full w-full object-contain">
      <UIcon v-else-if="displayValue.iconKind === 'iconify'" :name="displayValue.value" class="h-7 w-7 text-muted" />
      <span v-else-if="displayValue.iconKind === 'svg'" class="flex h-full w-full items-center justify-center" v-html="displayValue.value"></span>
    </div>
    <a
      v-else-if="displayValue.kind === 'file'"
      :href="displayValue.value"
      target="_blank"
      rel="noopener noreferrer"
      class="inline-flex items-center gap-1.5 text-primary hover:underline break-all"
    >
      <UIcon name="i-lucide-file-text" class="h-4 w-4 shrink-0" />
      <span>{{ displayValue.original }}</span>
    </a>
    <div v-else-if="displayValue.kind === 'files'" class="flex flex-wrap gap-x-3 gap-y-1">
      <template v-if="(displayValue.value as { path: string, name: string }[]).length">
        <a
          v-for="(item, i) in (displayValue.value as { path: string, name: string }[])"
          :key="i"
          :href="resolveImageSrc(item.path)"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-1.5 text-primary hover:underline break-all"
        >
          <UIcon name="i-lucide-paperclip" class="h-4 w-4 shrink-0" />
          <span>{{ item.name }}</span>
        </a>
      </template>
      <span v-else class="text-muted italic">-</span>
    </div>
    <a
      v-else-if="displayValue.kind === 'hyperlink'"
      :href="displayValue.value"
      target="_blank"
      rel="noopener noreferrer"
      class="text-primary hover:underline break-all"
    >{{ displayValue.value }}</a>
    <div v-else-if="displayValue.kind === 'text'" class="whitespace-pre-wrap break-words">{{ displayValue.value }}</div>
    <div v-else-if="displayValue.kind === 'markdown'" class="max-h-96 overflow-y-auto rounded border border-default p-3">
      <BaseCherryViewer :source="String(displayValue.value)" />
    </div>
    <pre v-else-if="displayValue.kind === 'code'" class="overflow-auto text-xs bg-muted p-3 rounded max-h-64">{{ displayValue.value }}</pre>
  </template>
</template>

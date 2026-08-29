<script setup lang="ts">
/**
 * Blog module — create/edit modal for a post, reusing the HOST's generic
 * dashboard form (DashboardCrudFormModal + DashboardCrudForm) and the post's
 * TableMeta fetched from `/api/dashboard/meta/posts`.
 *
 * Uses the generic dashboard data API (`/api/dashboard/data/posts`), so the
 * saved values follow the exact same rules as the admin dashboard's posts
 * page. Emits `saved(post)` after a successful create/update.
 */
import type { TableMetaWithOptions } from '~/types/dashboard'

const props = defineProps<{
  open: boolean
  mode: 'create' | 'update'
  /** Post row to edit (update mode). Pass the full/slug-ish record; the full
   *  record is fetched by id to pre-fill relation fields. */
  item?: Record<string, unknown> | null
}>()

const emit = defineEmits<{
  'update:open': [boolean]
  'saved': [record: Record<string, unknown>]
}>()

const { t } = useI18n()
const toast = useToast()

const meta = ref<TableMetaWithOptions | null>(null)
const metaLoading = ref(false)

// Fields hidden only in the blog front-end form (not in the admin dashboard).
// They are auto-managed by the backend: author = current user, publishedAt =
// set on publish.
const HIDDEN_FORM_KEYS = ['authorId', 'publishedAt']

async function loadMeta() {
  if (meta.value) return
  metaLoading.value = true
  try {
    const full = await cGet<TableMetaWithOptions>('/api/dashboard/meta/posts')
    // Return a cloned meta with the front-end-only hidden fields removed from
    // the form, keeping the dashboard's own postMeta untouched.
    meta.value = {
      ...full,
      fields: full.fields.filter(f => !HIDDEN_FORM_KEYS.includes(f.key))
    }
  } catch (e) {
    toast.add({ title: (e as any)?.data?.message || 'Failed to load form', color: 'error' })
  } finally {
    metaLoading.value = false
  }
}

// ---- Form state (mirrors DashboardCrudPage) ----
const modalMode = ref<'create' | 'update'>('create')
const editing = ref<Record<string, unknown> | null>(null)
const form = ref<Record<string, unknown>>({})
const saving = ref(false)
const errorMsg = ref('')
const fieldErrors = ref<Record<string, string>>({})

function initCreateForm() {
  const payload: Record<string, unknown> = {}
  for (const f of meta.value?.fields ?? []) {
    if (!f.showInForm) continue
    if (f.type === 'boolean') payload[f.key] = (f.validation?.required ?? true) ? true : false
    else if (f.nullable) payload[f.key] = null
    else if (f.type === 'number') payload[f.key] = 0
    else payload[f.key] = ''
  }
  form.value = payload
}

function openDialog() {
  modalMode.value = props.mode
  editing.value = props.item ?? null
  errorMsg.value = ''
  fieldErrors.value = {}
  loadMeta().then(() => {
    if (!meta.value) return
    if (props.mode === 'create') {
      initCreateForm()
    } else if (props.item?.id != null) {
      // Fetch full record (list API omits some m2m/relation ids needed by form)
      cGet<{ item: Record<string, unknown> }>(`/api/dashboard/data/posts/${props.item.id}`)
        .then(res => {
          form.value = res.item ?? {}
          // Clear password fields if any
          for (const f of meta.value?.fields ?? []) {
            if (f.type === 'password') form.value[f.key] = ''
          }
        })
        .catch(() => { form.value = { ...props.item! } })
    } else {
      initCreateForm()
    }
  })
}

watch(() => props.open, (v) => { if (v) openDialog() }, { immediate: true })

async function save() {
  if (!meta.value) return
  try {
    saving.value = true
    errorMsg.value = ''
    fieldErrors.value = {}
    const payload = { ...form.value }
    // Client-side validation against the post meta (mirrors host + backend).
    const errs = validateForm(meta.value as any, payload, modalMode.value)
    if (Object.keys(errs).length > 0) {
      fieldErrors.value = errs
      errorMsg.value = Object.values(errs).join('; ')
      return
    }
    if (modalMode.value === 'create') {
      await cPost('/api/dashboard/data/posts', payload)
      toast.add({ title: t('dashboard.crud.createSuccess'), color: 'success' })
    } else if (editing.value?.id != null) {
      await cPut(`/api/dashboard/data/posts/${editing.value.id}`, payload)
      toast.add({ title: t('dashboard.crud.updateSuccess'), color: 'success' })
    }
    emit('saved', form.value)
    emit('update:open', false)
  } catch (e) {
    errorMsg.value = (e as any)?.data?.message || t('dashboard.crud.saveFailed')
  } finally {
    saving.value = false
  }
}

function cancel() {
  emit('update:open', false)
}
</script>

<template>
  <DashboardCrudFormModal
    :modal-open="props.open"
    :modal-title="modalMode === 'create' ? t('dashboard.crud.createLabel', { name: 'Post' }) : t('dashboard.crud.editLabel', { name: 'Post' })"
    :saving="saving"
    :error-msg="errorMsg"
    @update:modal-open="emit('update:open', $event)"
    @save="save"
    @cancel="cancel"
  >
    <template #form>
      <p v-if="metaLoading" class="py-8 text-center text-muted">Loading…</p>
      <div v-else-if="meta" class="space-y-4">
        <DashboardCrudForm
          :meta="meta"
          v-model="form"
          :mode="modalMode"
          :errors="fieldErrors"
        >
          <!-- #7 cover: allow uploading OR pasting a URL -->
          <template #form-coverUrl="{ modelValue, update }">
            <div class="space-y-2">
              <UInput
                :model-value="typeof modelValue === 'string' ? modelValue : ''"
                type="url"
                placeholder="https://…"
                @update:model-value="update($event || null)"
              />
              <BaseFileUploader
                :max-files="1"
                :multiple="false"
                accept="image/*"
                @uploaded="(files: any) => {
                  const first = Array.isArray(files) ? files[0] : files
                  if (first?.path) update(first.path)
                }"
              />
              <img
                v-if="modelValue"
                :src="resolveBlogCover('cover', String(modelValue), 300, 170)"
                alt="cover preview"
                class="h-24 w-40 rounded border object-cover"
              >
            </div>
          </template>
        </DashboardCrudForm>
      </div>
      <p v-else class="py-8 text-center text-muted">{{ t('blog.empty') }}</p>
    </template>
  </DashboardCrudFormModal>
</template>